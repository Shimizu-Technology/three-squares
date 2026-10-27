# frozen_string_literal: true

class SendOrderStatusEmailJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 5
  discard_on ActiveRecord::RecordNotFound
  EVENTS = {
    'confirmed' => :send_order_confirmed_email,
    'processing' => :send_order_processing_email,
    'ready' => :send_order_ready_email,
    'shipped' => :send_order_shipped_email,
    'picked_up' => :send_order_picked_up_email,
    'delivered' => :send_order_delivered_email,
    'cancelled' => :send_order_cancelled_email
  }.freeze

  def perform(order_id, event, seq)
    method = EVENTS.fetch(event) { raise ArgumentError, 'Unknown notification event' }
    raise ArgumentError, 'Invalid sequence' unless seq == Order::STATUS_SEQUENCE.fetch(event)
    order = Order.find(order_id)
    Payments::DeliverNotification.call(record: order, channel: 'last_email_seq', flag: :last_email_seq, seq: seq,
      job: self.class.name, args: [order_id, event, seq]) { EmailService.public_send(method, order) }
  end
end
