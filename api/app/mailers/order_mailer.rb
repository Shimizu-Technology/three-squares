# frozen_string_literal: true

class OrderMailer < ApplicationMailer
  default from: -> { "Three Squares <#{SiteSetting.instance.store_email || 'sales@bgpacific.com'}>" }

  def refund_notification(order, refund)
    @order = order
    @refund = refund
    @amount = "$#{'%.2f' % (refund.amount_cents / 100.0)}"
    mail(to: order.email, subject: "Three Squares \u2014 Refund Processed for Order ##{order.order_number}")
  end
end
