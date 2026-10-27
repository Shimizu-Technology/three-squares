# frozen_string_literal: true

class PaymentService
  class PaymentError < StandardError; end

  def self.create_checkout_session(amount_cents:, customer_email:, order_id:, test_mode: false, payment_processor: nil)
    provider = Payments::ProviderResolver.resolve(
      payment_processor: payment_processor || SiteSetting.instance.payment_processor,
      test_mode: test_mode
    )

    provider.create_checkout_session(
      amount_cents: amount_cents,
      customer_email: customer_email,
      order_id: order_id
    )
  rescue Stripe::StripeError => e
    Rails.logger.error "Stripe Checkout Session Error: #{e.message}"
    { success: false, error: "Failed to initialize payment. Please try again." }
  rescue PaymentError => e
    Rails.logger.error "Payment Provider Error: #{e.message}"
    { success: false, error: e.message }
  rescue StandardError => e
    Rails.logger.error "Checkout Session Error: #{e.class} - #{e.message}"
    { success: false, error: "An unexpected error occurred. Please try again." }
  end

  # Process a payment (real or simulated based on test_mode)
  # @param amount_cents [Integer] - Amount to charge in cents
  # @param payment_method [Hash] - Payment method details (card token, etc.)
  # @param order [Order] - The order being paid for
  # @param customer_email [String] - Customer's email
  # @param test_mode [Boolean] - Whether to simulate payment (default: false)
  # @return [Hash] - { success: boolean, charge_id: string, error: string }
  def self.process_payment(amount_cents:, payment_method:, order:, customer_email:, test_mode: false, payment_processor: nil)
    provider = Payments::ProviderResolver.resolve(
      payment_processor: payment_processor || SiteSetting.instance.payment_processor,
      test_mode: test_mode
    )

    provider.process_payment(
      amount_cents: amount_cents,
      payment_method: payment_method,
      order: order,
      customer_email: customer_email
    )
  rescue Stripe::CardError => e
    Rails.logger.error "Stripe Card Error: #{e.message}"
    { success: false, error: e.message }
  rescue Stripe::StripeError => e
    Rails.logger.error "Stripe API Error: #{e.message}"
    { success: false, error: "Payment processing failed. Please try again." }
  rescue PaymentError => e
    Rails.logger.error "Payment Provider Error: #{e.message}"
    { success: false, error: e.message }
  rescue StandardError => e
    Rails.logger.error "Payment Error: #{e.class} - #{e.message}"
    { success: false, error: "An unexpected error occurred. Please try again." }
  end

  # Create a payment intent (for Stripe Checkout)
  # @param amount_cents [Integer] - Amount to charge in cents
  # @param customer_email [String] - Customer's email
  # @param order_id [Integer] - Order ID for reference
  # @param test_mode [Boolean] - Whether to simulate payment intent (default: false)
  # @return [Hash] - { success: boolean, client_secret: string, error: string }
  def self.create_payment_intent(amount_cents:, customer_email:, order_id:, test_mode: false, payment_processor: nil)
    result = create_checkout_session(
      amount_cents: amount_cents,
      customer_email: customer_email,
      order_id: order_id,
      test_mode: test_mode,
      payment_processor: payment_processor
    )

    return result unless result[:success]

    if result[:flow] != "embedded" && !(test_mode && result[:flow] == "simulated")
      return {
        success: false,
        error: "The selected payment processor does not use embedded card collection."
      }
    end

    {
      success: true,
      client_secret: result[:client_secret],
      payment_intent_id: result[:payment_reference] || result[:payment_intent_id]
    }
  end

  def self.verify_payment(payment_reference:, expected_amount_cents:, test_mode: false, payment_processor: nil)
    provider = Payments::ProviderResolver.resolve(
      payment_processor: payment_processor || SiteSetting.instance.payment_processor,
      test_mode: test_mode
    )

    provider.verify_payment(
      payment_reference: payment_reference,
      expected_amount_cents: expected_amount_cents
    )
  rescue PaymentError => e
    Rails.logger.error "Payment Verification Provider Error: #{e.message}"
    { success: false, captured: :unknown, error: e.message }
  rescue StandardError => e
    Rails.logger.error "Payment Verification Error: #{e.class} - #{e.message}"
    { success: false, captured: :unknown, error: "Payment verification failed. Please try again." }
  end

  # Process a refund (real or simulated based on test_mode)
  # @param order [Order] - The order to refund
  # @param amount_cents [Integer] - Amount to refund in cents
  # @param reason [String] - Reason for refund
  # @param admin_user [User] - Admin processing the refund
  # @param test_mode [Boolean] - Whether to simulate refund
  # @return [Hash] - { success: boolean, refund: Refund, error: string }
  def self.refund_payment(order:, amount_cents:, reason: nil, admin_user: nil, test_mode: false, payment_processor: nil)
    payment_processor ||= order.effective_payment_provider || SiteSetting.instance.payment_processor

    provider = Payments::ProviderResolver.resolve(
      payment_processor: payment_processor,
      test_mode: test_mode
    )

    provider.refund_payment(
      order: order,
      amount_cents: amount_cents,
      reason: reason,
      admin_user: admin_user
    )
  rescue Stripe::StripeError => e
    Rails.logger.error "Stripe Refund Error: #{e.message}"
    { success: false, error: e.message }
  rescue PaymentError => e
    Rails.logger.error "Refund Provider Error: #{e.message}"
    { success: false, error: e.message }
  rescue StandardError => e
    Rails.logger.error "Refund Error: #{e.class} - #{e.message}"
    { success: false, error: "An unexpected error occurred during refund." }
  end
end
