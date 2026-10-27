# frozen_string_literal: true

require "bigdecimal"

module Payments
  module Worldpay
    # Integer USD cents only. This is an application safety bound, not a host limit.
    module Money
      MAX_CENTS = 9_999_999_999
      class Invalid < ArgumentError; end

      # JSON's decimal_class hook receives the original numeric token. Retaining it
      # avoids both binary floats and loss of excess fractional digits (e.g. 1.230).
      DecimalLexeme = Struct.new(:text) do
        def to_json(*)
          text
        end
      end

      def self.validate_cents(value, allow_zero: false)
        minimum = allow_zero ? 0 : 1
        unless value.is_a?(Integer) && value.between?(minimum, MAX_CENTS)
          raise Invalid, "invalid_cents"
        end
        value
      end

      def self.parse(value, currency: "USD", allow_zero: false)
        raise Invalid, "unsupported_currency" unless currency == "USD"

        text = case value
        when String then value
        when Integer then value.to_s
        when DecimalLexeme then value.text
        else raise Invalid, "invalid_amount"
        end
        unless text.bytesize <= 16 && /\A(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?\z/.match?(text)
          raise Invalid, "invalid_amount"
        end

        dollars, fraction = text.split(".", 2)
        validate_cents(dollars.to_i * 100 + fraction.to_s.ljust(2, "0").to_i, allow_zero: allow_zero)
      end

      def self.format(cents, allow_zero: false)
        validate_cents(cents, allow_zero: allow_zero)
        dollars, fraction = (BigDecimal(cents) / 100).to_s("F").split(".")
        "#{dollars}.#{fraction.ljust(2, '0')}"
      end
    end
  end
end
