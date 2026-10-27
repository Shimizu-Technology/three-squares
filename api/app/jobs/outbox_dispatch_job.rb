# frozen_string_literal: true

class OutboxDispatchJob < ApplicationJob
  queue_as :payments

  def perform
    PaymentOutbox.due.limit(200).pluck(:id).each do |id|
      begin
        Payments::DispatchOutbox.call(outbox: PaymentOutbox.find(id))
      rescue StandardError => error
        Rails.logger.error("Payment outbox=#{id} error=#{error.class}")
      end
    end
  end
end
