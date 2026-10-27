# frozen_string_literal: true

class PaymentRecoveryJob < ApplicationJob
  queue_as :payments

  def perform
    # Includes newly persisted intent and stale dispatches even without a callback.
    PaymentAttempt.where.not(state: %w[failed cancelled compensated]).where(
      'next_recovery_at <= :now OR (next_recovery_at IS NULL AND updated_at < :stale)', now: Time.current, stale: 2.minutes.ago
    ).find_each do |attempt|
      next if attempt.state == 'captured' && InventoryCommitment.exists?(order_id: attempt.order_id)
      begin
        Payments::ReconcileAttempt.call(attempt: attempt)
      rescue StandardError => error
        Rails.logger.error("Payment recovery attempt=#{attempt.id} error=#{error.class}")
      end
    end
    OutboxDispatchJob.perform_later
  end
end
