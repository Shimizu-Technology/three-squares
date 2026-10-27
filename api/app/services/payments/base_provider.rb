# frozen_string_literal: true

module Payments
  class BaseProvider
    def create_checkout_session(**)
      raise NotImplementedError, "#{self.class.name} must implement #create_checkout_session"
    end

    def process_payment(**)
      raise NotImplementedError, "#{self.class.name} must implement #process_payment"
    end

    def refund_payment(**)
      raise NotImplementedError, "#{self.class.name} must implement #refund_payment"
    end

    def verify_payment(**)
      raise NotImplementedError, "#{self.class.name} must implement #verify_payment"
    end
  end
end
