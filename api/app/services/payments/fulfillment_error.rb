# frozen_string_literal: true

module Payments
  # Eligibility.validate_order! raises this for a captured order that cannot fulfill.
  class FulfillmentError < StandardError; end
end
