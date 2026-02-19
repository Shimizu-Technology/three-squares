# frozen_string_literal: true

class SendAdminOrderSmsJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  def perform(order_id)
    order = Order.find(order_id)
    SmsService.send_admin_new_order(order)
  end
end
