# frozen_string_literal: true

module Payments
  class FinalizeOrder
    def self.call(attempt:, result:)
      raise BindingError, 'Expected authenticated typed provider result' unless result.is_a?(Result)
      AttemptLock.call(attempt, raw_id: result.raw_id) do |session, stored, charge, order, charges|
        identity = AttemptLock.validate!(session, stored, order)
        validate_result!(stored, result)
        collection_closed = %w[failed cancelled].include?(stored.state) || session.state == 'cancelled'
        if Configuration.production? && result.raw_id.to_s.start_with?('sim_', 'test_pi_', 'fake_')
          raise BindingError, 'Synthetic transaction cannot fulfill production'
        end
        # A supplied reference never grants ownership of an existing charge.
        known = charges.find { |row| row.payment_identity_id == identity.id && row.raw_provider_id == result.raw_id } if result.raw_id.present?
        if known && (known.payment_attempt_id != stored.id || (known.order_id && known.order_id != order.id))
          raise BindingError, 'Charge belongs to another payment'
        end
        raise BindingError, 'Attempt charge changed' if charge && result.raw_id.present? && charge.raw_provider_id != result.raw_id
        if stored.state == 'compensated' || stored.compensation_claimed_at
          # Keep new money evidence without changing a dispatched reversal's
          # payload under the same key. Changed amounts require manual review.
          if result.approved_cents > stored.approved_cents || result.captured_cents > stored.captured_cents
            stored.update!(approved_cents: [stored.approved_cents, result.approved_cents].max,
              captured_cents: [stored.captured_cents, result.captured_cents].max,
              error_classification: 'manual_reconciliation_required', last_error: 'late_amount_change_during_compensation')
          end
          next order
        end
        if result.approved_cents.positive? || result.captured_cents.positive?
          raise BindingError, 'Missing captured transaction ID' if result.raw_id.blank?
          charge ||= PaymentTransaction.create!(payment_identity: identity, payment_attempt: stored,
            provider: identity.provider, raw_provider_id: result.raw_id, reference: identity.canonical_reference(result.raw_id),
            amount_cents: result.captured_cents.positive? ? result.captured_cents : result.approved_cents, currency: result.currency,
            state: result.captured_cents.positive? ? 'captured' : 'authorized', first_observed_at: Time.current, last_observed_at: Time.current)
          charge.update!(last_observed_at: Time.current, state: 'captured') if result.captured_cents.positive?
          stored.update!(raw_provider_id: result.raw_id, approved_cents: [stored.approved_cents, result.approved_cents].max,
            captured_cents: [stored.captured_cents, result.captured_cents].max)
        elsif stored.captured_cents.positive? || charge&.order_id
          next order # A delayed unknown/decline cannot erase captured evidence.
        else
          state = %w[failed cancelled].include?(result.status) ? result.status : (result.status == 'unknown' ? 'unknown' : 'collecting')
          if stored.recovery_deadline_at&.past? && !%w[failed cancelled].include?(state)
            state = 'reconciliation_required'
            stored.error_classification = 'manual_reconciliation_required'
          end
          stored.update!(state: state, raw_provider_id: stored.raw_provider_id || result.raw_id,
            next_recovery_at: %w[failed cancelled].include?(state) ? nil : 30.seconds.from_now)
          if %w[failed cancelled].include?(state)
            session.update!(state: 'cancelled')
            InventoryReservation.where(order_id: order.id, state: 'held').update_all(state: 'released', updated_at: Time.current)
          end
          next order
        end
        if collection_closed
          mark_compensation!(session, stored, 'capture_after_collection_closed')
          next order
        end
        if charge.order_id == order.id && (commitment = InventoryCommitment.find_by(order_id: order.id))
          order.update!(inventory_committed_at: commitment.created_at, inventory_commitment_id: commitment.id)
          session.update!(state: 'fulfilled', consumed_at: session.consumed_at || Time.current)
          record_effects!(order, session)
          next order
        end
        if result.metadata[:compensation_required]
          mark_compensation!(session, stored, 'fraud_policy')
          next order
        end
        unless result.captured? && result.approved_cents == stored.requested_cents
          mark_compensation!(session, stored) if result.approved_cents < stored.requested_cents || result.captured_cents.positive?
          next order
        end
        begin
          # Roll back any stock mutations on eligibility/stock failure while retaining payment evidence.
          Order.transaction(requires_new: true) do
            Snapshot.validate!(session: session, attempt: stored, order: order)
            raise FulfillmentError, 'Order was cancelled' if order.status == 'cancelled'
            Eligibility.validate_order!(order)
            commitment = ReserveInventory.commit!(order: order, snapshot_digest: session.snapshot_digest)
            charge.update!(order_id: order.id, state: 'captured')
            order.update!(payment_status: 'paid', status: order.source == 'pos' ? 'confirmed' : order.status, payment_reference: charge.reference,
              inventory_committed_at: commitment.created_at, inventory_commitment_id: commitment.id)
            stored.update!(state: 'captured', next_recovery_at: nil, last_error: nil)
            session.update!(state: 'fulfilled', consumed_at: Time.current)
            record_effects!(order, session)
          end
        rescue FulfillmentError, ReserveInventory::Unavailable, BindingError, ActiveRecord::RecordInvalid => error
          stored.reload
          mark_compensation!(session, stored, error.class.name)
        end
        order.reload
      end
    rescue ActiveRecord::RecordNotUnique
      # A reference race must never enter compensation against the winning order.
      raise BindingError, 'Payment reference already consumed'
    end

    # Staff authorization/contact eligibility belongs to the caller/Eligibility.
    # Cash has no provider identity or external charge to manufacture.
    def self.call_cash(order:)
      Configuration.validate_environment!
      Order.transaction do
        current = Order.lock.find(order.id)
        unless current.source == 'pos' && current.staff_created? && current.payment_method == 'cash' &&
            current.payment_identity_id.nil? && current.payment_attempt_id.nil? && current.checkout_session_id.nil?
          raise BindingError, 'Expected an unbound staff cash POS order'
        end
        if Configuration.production? && (current.simulated? || current.payment_environment != 'production')
          raise BindingError, 'Production cash requires production environment'
        end
        commitment = InventoryCommitment.find_by(order_id: current.id)
        unless commitment
          Eligibility.validate_order!(current)
          snapshot = current.payment_snapshot.presence || {
            'order' => current.attributes.except('created_at', 'updated_at', 'payment_snapshot', 'payment_status', 'inventory_committed_at', 'inventory_commitment_id'),
            'items' => current.order_items.order(:id).map { |item| item.attributes.except('created_at', 'updated_at') }
          }
          current.update!(payment_snapshot: snapshot)
          commitment = ReserveInventory.commit!(order: current, snapshot_digest: Snapshot.digest(snapshot))
        end
        current.update!(payment_status: 'paid', status: 'confirmed', inventory_committed_at: commitment.created_at, inventory_commitment_id: commitment.id)
        record_effects!(current, nil)
        current
      end
    end

    def self.validate_result!(attempt, result)
      unless result.identity_id == attempt.payment_identity_id && result.requested_cents == attempt.requested_cents &&
          result.currency == attempt.currency && (attempt.raw_provider_id.blank? || result.raw_id == attempt.raw_provider_id || (result.raw_id.nil? && result.status == 'unknown')) &&
          [result.requested_cents, result.approved_cents, result.captured_cents].all? { |v| v.is_a?(Integer) } &&
          result.captured_cents >= 0 && result.approved_cents >= result.captured_cents && result.approved_cents <= result.requested_cents
        raise BindingError, 'Provider result binding/amount mismatch'
      end
    end

    def self.mark_compensation!(session, attempt, error = 'partial_approval')
      attempt.update!(state: 'compensation_required', last_error: error, next_recovery_at: Time.current)
      session.update!(state: 'compensation_required')
      # The same transaction claims ownership before recording the durable dispatch intent.
      CompensateAttempt.claim_locked!(session, attempt, PaymentTransaction.lock.find_by!(payment_attempt_id: attempt.id), Order.lock.find(attempt.order_id))
    end

    def self.record_effects!(order, session)
      effects = session ? { 'cart_cleanup' => { 'session_id' => session.id } } : {}
      unless order.simulated? || order.payment_environment == 'simulated'
        settings = SiteSetting.instance
        effects['confirmation_email'] = { 'order_id' => order.id } if settings.enable_order_emails && order.customer_email.present?
        effects['confirmation_sms'] = { 'order_id' => order.id } if settings.enable_order_sms && order.customer_phone.present?
        effects['admin_email'] = { 'order_id' => order.id }
        effects['admin_push'] = { 'order_id' => order.id } if defined?(SendAdminPushNotificationJob)
        effects['admin_sms'] = { 'order_id' => order.id } if settings.enable_admin_sms
      end
      effects.each { |kind, payload| PaymentOutbox.record!(effect_key: "order:#{order.id}:#{kind}", kind: kind, payload: payload) }
    end
  end
end
