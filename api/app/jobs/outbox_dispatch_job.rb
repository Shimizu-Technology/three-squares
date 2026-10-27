# frozen_string_literal: true

class OutboxDispatchJob < ApplicationJob
  queue_as :payments

  def perform
    financial = PaymentOutbox.due.where(kind: %w[compensate cart_cleanup]).order(:next_attempt_at, :id).limit(100).pluck(:id)
    notifications = PaymentOutbox.due.where.not(kind: %w[compensate cart_cleanup]).order(:next_attempt_at, :id).limit(100).pluck(:id)
    (financial + notifications).each do |id|
      begin
        Payments::DispatchOutbox.call(outbox: PaymentOutbox.find(id))
      rescue StandardError => error
        Rails.logger.error("Payment outbox=#{id} error=#{error.class}")
      end
    end
  end
end
