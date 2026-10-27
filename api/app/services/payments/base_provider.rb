# frozen_string_literal: true

module Payments
  class BaseProvider
    attr_reader :identity

    def initialize(identity)
      @identity = Configuration.validate_identity!(identity)
    end

    %i[setup collect query authorize capture sale cancel reverse void refund tokenize terminal report].each do |method|
      define_method(method) { |**| raise UnsupportedCapability, "#{method} is not supported by this profile" }
    end
  end
end
