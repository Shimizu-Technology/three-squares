# frozen_string_literal: true

class SendOrderSmsJob < ApplicationJob
  queue_as :default
  SmsTemporarilyUnavailable = Payments::DeliverNotification::Retryable
  retry_on StandardError, wait: :polynomially_longer, attempts: 5
  discard_on ActiveRecord::RecordNotFound
  EVENTS = {
    'confirmed' => :send_order_confirmed,
    'processing' => :send_order_processing,
    'ready' => :send_order_ready,
    'shipped' => :send_order_shipped,
    'picked_up' => :send_order_picked_up,
    'delivered' => :send_order_delivered,
    'cancelled' => :send_order_cancelled
  }.freeze

  def perform(order_id, event, seq)
    method = EVENTS.fetch(event) { raise ArgumentError, 'Unknown notification event' }
    raise ArgumentError, 'Invalid sequence' unless seq == Order::STATUS_SEQUENCE.fetch(event)
    order = Order.find(order_id)
    Payments::DeliverNotification.call(record: order, channel: 'last_sms_seq', flag: :last_sms_seq, seq: seq,
      job: self.class.name, args: [order_id, event, seq]) { SmsService.public_send(method, order) }
  end
end
