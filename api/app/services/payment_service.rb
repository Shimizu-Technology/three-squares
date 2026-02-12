# frozen_string_literal: true

class PaymentService
  class PaymentError < StandardError; end

  # Process a payment (real or simulated based on test_mode)
  # @param amount_cents [Integer] - Amount to charge in cents
  # @param payment_method [Hash] - Payment method details (card token, etc.)
  # @param order [Order] - The order being paid for
  # @param customer_email [String] - Customer's email
  # @param test_mode [Boolean] - Whether to simulate payment (default: false)
  # @return [Hash] - { success: boolean, charge_id: string, error: string }
  def self.process_payment(amount_cents:, payment_method:, order:, customer_email:, test_mode: false)
    if test_mode
      process_test_payment(amount_cents, payment_method, order, customer_email)
    else
      process_real_payment(amount_cents, payment_method, order, customer_email)
    end
  rescue Stripe::CardError => e
    Rails.logger.error "Stripe Card Error: #{e.message}"
    { success: false, error: e.message }
  rescue Stripe::StripeError => e
    Rails.logger.error "Stripe API Error: #{e.message}"
    { success: false, error: "Payment processing failed. Please try again." }
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
  def self.create_payment_intent(amount_cents:, customer_email:, order_id:, test_mode: false)
    if test_mode
      create_test_payment_intent(amount_cents, customer_email, order_id)
    else
      create_real_payment_intent(amount_cents, customer_email, order_id)
    end
  rescue Stripe::StripeError => e
    Rails.logger.error "Stripe Payment Intent Error: #{e.message}"
    { success: false, error: "Failed to initialize payment. Please try again." }
  rescue StandardError => e
    Rails.logger.error "Payment Intent Error: #{e.class} - #{e.message}"
    { success: false, error: "An unexpected error occurred. Please try again." }
  end

  # Process a refund (real or simulated based on test_mode)
  # @param order [Order] - The order to refund
  # @param amount_cents [Integer] - Amount to refund in cents
  # @param reason [String] - Reason for refund
  # @param admin_user [User] - Admin processing the refund
  # @param test_mode [Boolean] - Whether to simulate refund
  # @return [Hash] - { success: boolean, refund: Refund, error: string }
  def self.refund_payment(order:, amount_cents:, reason: nil, admin_user: nil, test_mode: false)
    if test_mode
      process_test_refund(order, amount_cents, reason, admin_user)
    else
      process_real_refund(order, amount_cents, reason, admin_user)
    end
  rescue Stripe::StripeError => e
    Rails.logger.error "Stripe Refund Error: #{e.message}"
    { success: false, error: e.message }
  rescue StandardError => e
    Rails.logger.error "Refund Error: #{e.class} - #{e.message}"
    { success: false, error: "An unexpected error occurred during refund." }
  end

  private

  # Real Stripe payment processing
  def self.process_real_payment(amount_cents, payment_method, order, customer_email)
    Rails.logger.info "💳 Processing real Stripe payment: $#{'%.2f' % (amount_cents / 100.0)}"

    charge = Stripe::Charge.create(
      amount: amount_cents,
      currency: "usd",
      source: payment_method[:token],
      description: "Order ##{order.id} - Three Squares",
      receipt_email: customer_email,
      metadata: {
        order_id: order.id,
        order_type: order.order_type
      }
    )

    {
      success: true,
      charge_id: charge.id,
      payment_method: "stripe",
      card_last4: charge.source&.last4,
      card_brand: charge.source&.brand
    }
  end

  # Simulated payment for test mode
  def self.process_test_payment(amount_cents, payment_method, order, customer_email)
    Rails.logger.info "⚙️  TEST MODE: Simulating payment of $#{'%.2f' % (amount_cents / 100.0)}"
    Rails.logger.info "   Order ID: #{order.id}"
    Rails.logger.info "   Customer: #{customer_email}"
    Rails.logger.info "   Payment Method: #{payment_method.inspect}"

    # Simulate a slight delay (like a real API call)
    sleep(0.5)

    # Generate fake charge ID
    charge_id = "test_charge_#{SecureRandom.hex(12)}"

    {
      success: true,
      charge_id: charge_id,
      payment_method: "test",
      card_last4: "4242",
      card_brand: "Visa (Test)"
    }
  end

  # Real Stripe Payment Intent
  def self.create_real_payment_intent(amount_cents, customer_email, order_id)
    Rails.logger.info "💳 Creating real Stripe Payment Intent: $#{'%.2f' % (amount_cents / 100.0)}"

    intent = Stripe::PaymentIntent.create(
      amount: amount_cents,
      currency: "usd",
      receipt_email: customer_email,
      metadata: {
        order_id: order_id
      }
    )

    {
      success: true,
      client_secret: intent.client_secret,
      payment_intent_id: intent.id
    }
  end

  # Test mode Payment Intent
  # When Stripe test keys are configured, we still call Stripe (which handles test mode)
  # This allows full Stripe.js integration testing with test cards like 4242 4242 4242 4242
  def self.create_test_payment_intent(amount_cents, customer_email, order_id)
    Rails.logger.info "⚙️  TEST MODE: Creating Stripe Payment Intent with test keys"
    Rails.logger.info "   Amount: $#{'%.2f' % (amount_cents / 100.0)}"
    Rails.logger.info "   Customer: #{customer_email}"
    Rails.logger.info "   Order ID: #{order_id}"

    configured_test_secret =
      ENV["STRIPE_SECRET_KEY_TEST"].presence ||
      ENV["STRIPE_SECRET_KEY"].presence ||
      Stripe.api_key

    # Check if we have a test Stripe key configured
    if configured_test_secret.present? && configured_test_secret.start_with?("sk_test_")
      # Use real Stripe API with test keys - enables full checkout testing
      intent = Stripe::PaymentIntent.create(
        amount: amount_cents,
        currency: "usd",
        receipt_email: customer_email,
        metadata: {
          order_id: order_id,
          test_mode: true
        }
      )

      {
        success: true,
        client_secret: intent.client_secret,
        payment_intent_id: intent.id
      }
    else
      # No Stripe keys - return simulated response (won't work with Stripe.js)
      Rails.logger.warn "⚠️  No Stripe test keys configured - using simulated payment intent"
      {
        success: true,
        client_secret: "test_secret_#{SecureRandom.hex(16)}",
        payment_intent_id: "test_pi_#{SecureRandom.hex(12)}"
      }
    end
  end

  def self.process_real_refund(order, amount_cents, reason, admin_user)
    Rails.logger.info "💸 Processing Stripe refund: $#{"%.2f" % (amount_cents / 100.0)} for Order ##{order.order_number}"

    refund_params = {
      payment_intent: order.payment_intent_id,
      amount: amount_cents,
      reason: map_refund_reason(reason)
    }

    stripe_refund = Stripe::Refund.create(refund_params)

    refund = order.refunds.create!(
      stripe_refund_id: stripe_refund.id,
      amount_cents: amount_cents,
      reason: reason,
      status: stripe_refund.status == "succeeded" ? "succeeded" : "pending",
      user: admin_user,
      metadata: { stripe_status: stripe_refund.status }
    )

    order.update!(payment_status: "refunded") if order.fully_refunded?

    { success: true, refund: refund, stripe_refund_id: stripe_refund.id }
  end

  def self.process_test_refund(order, amount_cents, reason, admin_user)
    Rails.logger.info "⚙️  TEST MODE: Simulating refund of $#{"%.2f" % (amount_cents / 100.0)} for Order ##{order.order_number}"

    sleep(0.3)
    fake_refund_id = "test_refund_#{SecureRandom.hex(12)}"

    refund = order.refunds.create!(
      stripe_refund_id: fake_refund_id,
      amount_cents: amount_cents,
      reason: reason,
      status: "succeeded",
      user: admin_user,
      metadata: { test_mode: true }
    )

    order.update!(payment_status: "refunded") if order.fully_refunded?

    { success: true, refund: refund, stripe_refund_id: fake_refund_id }
  end

  def self.map_refund_reason(reason)
    case reason&.downcase
    when "duplicate" then "duplicate"
    when "fraudulent" then "fraudulent"
    else "requested_by_customer"
    end
  end
end
