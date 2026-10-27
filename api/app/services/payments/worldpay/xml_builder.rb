# frozen_string_literal: true

require "nokogiri"
require_relative "configuration"
require_relative "money"

module Payments
  module Worldpay
    class XmlBuilder
      TRANSACTION_METHODS = %w[TransactionSetup CreditCardSale CreditCardAuthorization CreditCardAuthorizationCompletion CreditCardReturn CreditCardVoid CreditCardReversal BatchTotalsQuery BatchClose].freeze
      REPORTING_METHODS = %w[TransactionQuery TransactionQueryPagination].freeze
      SERVICES_METHODS = %w[PaymentAccountCreate PaymentAccountCreateWithTransID PaymentAccountQuery PaymentAccountUpdate PaymentAccountDelete].freeze
      SECTIONS = %w[Terminal Transaction TransactionSetup PaymentAccount Parameters Batch].freeze
      # Raw card collection and arbitrary XML are never supported by this port.
      FORBIDDEN = /\A(?:Credentials|Application|AccountID|AccountToken|AcceptorID|Card|CardNumber|PAN|CVV|CVV2|CVC|CVC2|Track1|Track2|TrackData|PIN|PINBlock|Cryptogram|OpaqueHandle|IdempotencyKey)\z/i

      def self.interface(method)
        return :transaction if TRANSACTION_METHODS.include?(method)
        return :reporting if REPORTING_METHODS.include?(method)
        return :services if SERVICES_METHODS.include?(method)
        raise Configuration::Invalid, "unsupported_express_method"
      end

      # A contract is an explicit reviewed wire layout, NOT an SDK/handle mapping.
      # Each method declares ordered fields and required paths, and optional
      # amount_path/return_url_path. Missing mappings stop before transport.
      def initialize(configuration:, contract:)
        @configuration = configuration
        @contract = validate_contract!(contract)
      end

      def build(method:, fields: {}, amount_cents: nil, idempotency_key: nil)
        interface = self.class.interface(method)
        spec = @contract.fetch(method) { raise Configuration::Invalid, "wire_contract_required" }
        if interface == :transaction
          raise Configuration::Invalid, "guid_idempotency_key_required" unless idempotency_key.is_a?(String) && Configuration::GUID.match?(idempotency_key)
        elsif !idempotency_key.nil?
          raise Configuration::Invalid, "idempotency_not_supported_on_interface"
        end
        values = copy_fields!(fields, spec)
        if interface == :transaction && !%w[BatchTotalsQuery BatchClose].include?(method)
          unless spec.fetch(:required_profile_paths, []).any?
            raise Configuration::Invalid, "terminal_profile_contract_required"
          end
          @configuration.terminal_profile.each do |section, entries|
            entries.each { |name, value| insert!(values, [ section, name ], value, spec) }
          end
          spec[:required_profile_paths].each do |section, name|
            raise Configuration::Invalid, "terminal_profile_incomplete" unless @configuration.terminal_profile.dig(section, name)
          end
        end
        if amount_cents.nil? && spec[:amount_path] && values.dig(*spec[:amount_path])
          raise Configuration::Invalid, "integer_amount_parameter_required"
        end
        unless amount_cents.nil?
          insert!(values, spec.fetch(:amount_path) { raise Configuration::Invalid, "amount_mapping_required" }, Money.format(amount_cents), spec)
        end
        if method == "TransactionSetup"
          insert!(values, spec.fetch(:return_url_path) { raise Configuration::Invalid, "return_url_mapping_required" }, @configuration.return_url, spec)
        end
        spec.fetch(:required_paths, []).each do |section, name|
          raise Configuration::Invalid, "required_wire_field_missing" unless values.dig(section, name)
        end
        xml = Nokogiri::XML::Builder.new(encoding: "UTF-8") do |builder|
          builder.public_send(method, xmlns: @configuration.namespace(interface)) do
            write_section(builder, "Credentials", @configuration.credentials)
            write_section(builder, "Application", @configuration.application)
            builder.IdempotencyKey(idempotency_key) if interface == :transaction
            spec.fetch(:fields).each do |section, names|
              ordered = names.to_h { |name| [ name, values.dig(section, name) ] }.compact
              write_section(builder, section, ordered) unless ordered.empty?
            end
          end
        end.to_xml
        raise Configuration::Invalid, "request_size_limit" if xml.bytesize > Configuration::MAX_BYTES
        xml.freeze
      rescue KeyError, TypeError, NoMethodError
        raise Configuration::Invalid, "invalid_wire_contract", cause: nil
      end

      def inspect
        "#<#{self.class.name} [REDACTED]>"
      end

      private

      def validate_contract!(contract)
        raise Configuration::Invalid, "invalid_wire_contract" unless contract.is_a?(Hash)
        contract.to_h do |method, spec|
          self.class.interface(method)
          unless spec.is_a?(Hash) && (spec.keys - %i[fields required_paths required_profile_paths amount_path return_url_path]).empty? && spec[:fields].is_a?(Hash)
            raise Configuration::Invalid, "invalid_wire_contract"
          end
          fields = spec[:fields].to_h do |section, names|
            unless SECTIONS.include?(section) && names.is_a?(Array) && names.length.between?(1, 100) && names.uniq == names && names.all? { |name| valid_name?(name) }
              raise Configuration::Invalid, "invalid_wire_field_allowlist"
            end
            [ section.dup.freeze, names.map { |name| name.dup.freeze }.freeze ]
          end.freeze
          paths = spec.except(:fields).to_h do |key, value|
            list = %i[amount_path return_url_path].include?(key) ? [ value ] : value
            unless list.is_a?(Array) && list.length <= 100 && list.all? { |path| path.is_a?(Array) && path.length == 2 && fields.fetch(path[0], []).include?(path[1]) }
              raise Configuration::Invalid, "invalid_wire_path"
            end
            copy = list.map { |path| path.map { |part| part.dup.freeze }.freeze }.freeze
            [ key, %i[amount_path return_url_path].include?(key) ? copy.first : copy ]
          end
          [ method.dup.freeze, paths.merge(fields: fields).freeze ]
        end.freeze
      end

      def valid_name?(name)
        name.is_a?(String) && name.bytesize <= 64 && /\A[A-Za-z][A-Za-z0-9]*\z/.match?(name) && !FORBIDDEN.match?(name)
      end

      def scalar!(value)
        text = value.dup.force_encoding(Encoding::UTF_8) if value.is_a?(String)
        unless text && text.valid_encoding? && text.bytesize.between?(1, 2048) && !text.match?(/[[:cntrl:]]/)
          raise Configuration::Invalid, "invalid_wire_value"
        end
        text
      end

      def copy_fields!(fields, spec)
        raise Configuration::Invalid, "invalid_wire_fields" unless fields.is_a?(Hash)
        fields.to_h do |section, entries|
          unless entries.is_a?(Hash) && spec[:fields].key?(section) && (entries.keys - spec[:fields][section]).empty?
            raise Configuration::Invalid, "wire_field_not_allowed"
          end
          [ section, entries.to_h { |name, value| [ name, scalar!(value) ] } ]
        end
      end

      def insert!(values, path, value, spec)
        section, name = path
        raise Configuration::Invalid, "wire_field_not_allowed" unless spec[:fields].fetch(section, []).include?(name)
        values[section] ||= {}
        raise Configuration::Invalid, "protected_wire_field_conflict" if values[section].key?(name) && values[section][name] != value
        values[section][name] = value
      end

      def write_section(builder, section, fields)
        builder.public_send(section) { fields.each { |name, value| builder.public_send(name, value) } }
      end
    end
  end
end
