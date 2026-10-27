# frozen_string_literal: true

class RefundRecoveryJob < ApplicationJob
  queue_as :payments

  def perform
    RefundOperation.where(state: %w[reserved dispatching pending unknown])
      .where('next_recovery_at IS NULL OR next_recovery_at <= ?', Time.current).order(:created_at).limit(100).each do |operation|
      begin
        service = Payments::RefundPayment.new
        if operation.state == 'reserved'
          service.call(order: operation.order, amount_cents: operation.amount_cents, request_key: operation.caller_idempotency_key,
            reason: operation.reason, admin_user: operation.user, metadata: operation.metadata,
            restoration_request: operation.restoration_request, kind: operation.kind)
        else
          service.reconcile(operation: operation)
        end
      rescue StandardError => error
        operation.update!(last_error: error.class.name, next_recovery_at: 1.hour.from_now)
        Rails.logger.error("Refund recovery operation=#{operation.id} error=#{error.class}")
      end
    end
    Payments::DispatchRefundEffects.call
    OutboxDispatchJob.perform_later
  end
end
