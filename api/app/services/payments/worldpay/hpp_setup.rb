# frozen_string_literal: true

require "nokogiri"
require "digest"
require_relative "configuration"

module Payments
  module Worldpay
    class HppSetup
      # Shared bounded XML reader. Never enables DTD loading, entity expansion,
      # XInclude, recovery, or HUGE parsing. Errors contain fixed codes only.
      module Xml
        MAX_DEPTH = 16
        MAX_NODES = 4096
        NAME = /\A[A-Za-z][A-Za-z0-9_]{0,63}\z/
        class Invalid < ArgumentError; end

        def self.parse(input)
          raise Invalid, "invalid_xml_size" unless input.is_a?(String) && input.bytesize.between?(1, Configuration::MAX_BYTES)
          wire = input.dup.force_encoding(Encoding::UTF_8)
          unless wire.valid_encoding? && !wire.include?("\0") && !wire.match?(/<!\s*(?:DOCTYPE|ENTITY)/i)
            raise Invalid, "unsafe_xml"
          end
          options = Nokogiri::XML::ParseOptions::STRICT | Nokogiri::XML::ParseOptions::NONET
          count = 0
          Nokogiri::XML::Reader(wire, nil, "UTF-8", options).each do |node|
            raise Invalid, "xml_depth_limit" if node.depth >= MAX_DEPTH
            count += 1
            raise Invalid, "xml_node_limit" if count > MAX_NODES
          end
          document = Nokogiri::XML::Document.parse(wire, nil, "UTF-8", options)
          raise Invalid, "unsafe_xml" if document.internal_subset || document.external_subset
          root = document.root
          raise Invalid, "missing_xml_root" unless root
          namespace = root.namespace&.href
          document.traverse do |node|
            next unless node.element?
            raise Invalid, "invalid_xml_name" unless NAME.match?(node.name)
            raise Invalid, "mixed_xml_namespaces" unless node.namespace&.href == namespace
            raise Invalid, "xml_child_limit" if node.element_children.length > 1000
            raise Invalid, "unexpected_xml_attributes" unless node.attribute_nodes.empty?
          end
          root
        rescue Nokogiri::XML::SyntaxError, ArgumentError => error
          raise error if error.is_a?(Invalid)
          raise Invalid, "malformed_xml", cause: nil
        end

        def self.child(node, name, required: false)
          matches = node.element_children.select { |child| child.name == name }
          raise Invalid, "ambiguous_xml_field" if matches.length > 1
          raise Invalid, "missing_xml_field" if required && matches.empty?
          matches.first
        end

        def self.at(node, path, required: false)
          path.reduce(node) { |current, name| current && child(current, name, required: required) }
        end

        def self.text(node, limit: 256)
          return nil unless node
          raise Invalid, "nested_xml_scalar" unless node.element_children.empty?
          text = node.text
          unless text.bytesize.between?(1, limit) && text == text.strip && !text.match?(/[[:cntrl:]]/)
            raise Invalid, "invalid_xml_scalar"
          end
          text
        end

        def self.code(response)
          value = text(child(response, "ExpressResponseCode", required: true))
          raise Invalid, "invalid_express_code" unless /\A[0-9]{1,4}\z/.match?(value)
          value
        end

        # Names only; no arbitrary response values enter audit metadata.
        def self.unknown_paths(node, known_paths, prefix = [])
          node.element_children.flat_map do |child|
            path = prefix + [ child.name ]
            if known_paths.include?(path)
              []
            elsif known_paths.any? { |known| known.take(path.length) == path }
              unknown_paths(child, known_paths, path)
            else
              [ path.join("/") ]
            end
          end.uniq.sort.take(100)
        end
      end

      # The validation code is server-only. #to_h and #inspect never include it.
      attr_reader :status, :setup_id, :hosted_url, :validation_code, :metadata

      def initialize(status:, setup_id: nil, hosted_url: nil, validation_code: nil, metadata: {})
        @status, @setup_id, @hosted_url, @validation_code = [ status, setup_id, hosted_url, validation_code ].map { |value| value&.dup&.freeze }
        @metadata = metadata.freeze
        freeze
      end

      def to_h
        { status: status, setup_id: setup_id, hosted_url: hosted_url, metadata: metadata }
      end

      def inspect
        "#<#{self.class.name} status=#{status.inspect} [REDACTED]>"
      end

      def valid_return_code?(candidate)
        return false unless validation_code && candidate.is_a?(String) && candidate.bytesize.between?(1, 256)
        left = Digest::SHA256.digest(validation_code)
        right = Digest::SHA256.digest(candidate)
        left.bytes.zip(right.bytes).reduce(0) { |difference, (a, b)| difference | (a ^ b) }.zero?
      end

      # Paths must come from the supplied setup response contract. Premium can
      # return a full URL in TransactionSetupID; it is NEVER relabeled as an ID.
      def self.parse(xml, configuration:, presentation:, contract:)
        raise Xml::Invalid, "invalid_hpp_presentation" unless %w[legacy premium].include?(presentation)
        root = Xml.parse(xml)
        unless root.name == "TransactionSetupResponse" && root.namespace&.href == configuration.namespace(:transaction)
          raise Xml::Invalid, "unexpected_setup_root"
        end
        response = Xml.child(root, "Response", required: true)
        code = Xml.code(response)
        metadata = { contract_verified: false, express_response_code: code, normalized_express_response_code: code.to_i }
        return new(status: "unknown", metadata: metadata) unless code.to_i.zero?
        paths = validate_contract!(contract)
        value = lambda do |key, required = false|
          limit = key == :hosted_url_path || (key == :setup_id_path && presentation == "premium" && !paths[:hosted_url_path]) ? 2048 : 256
          paths[key] && Xml.text(Xml.at(response, paths[key], required: required), limit: limit)
        end
        raw_setup = value.call(:setup_id_path, true)
        validation = value.call(:validation_code_path, true)
        raise Xml::Invalid, "setup_validation_code_required" unless validation
        if presentation == "legacy"
          raise Xml::Invalid, "legacy_setup_guid_required" unless raw_setup && Configuration::GUID.match?(raw_setup)
          setup_id = raw_setup
          url = configuration.hosted_url(setup_id)
        else
          # The same setup field is a URL in the documented Premium variant.
          url_value = paths[:hosted_url_path] ? value.call(:hosted_url_path, true) : Xml.text(Xml.at(response, paths[:setup_id_path], required: true), limit: 2048)
          url = configuration.premium_url(url_value)
          setup_id = paths[:hosted_url_path] ? raw_setup : nil
          raise Xml::Invalid, "premium_setup_id_invalid" if setup_id && !Configuration::GUID.match?(setup_id)
        end
        metadata[:unknown_fields] = Xml.unknown_paths(root, [ [ "Response", "ExpressResponseCode" ] ] + paths.values.map { |path| [ "Response" ] + path })
        raise Xml::Invalid, "sensitive_response" if configuration.secrets_in?([ setup_id, url, validation, metadata ])
        new(status: "ready", setup_id: setup_id, hosted_url: url, validation_code: validation, metadata: metadata)
      rescue Xml::Invalid, Configuration::Invalid => error
        new(status: "unknown", metadata: { contract_verified: false, parse_error: error.message })
      end

      def self.validate_contract!(contract)
        unless contract.is_a?(Hash) && (contract.keys - %i[setup_id_path validation_code_path hosted_url_path]).empty? &&
            contract.key?(:setup_id_path) && contract.key?(:validation_code_path) &&
            contract.values.uniq == contract.values &&
            contract.values.all? { |path| path.is_a?(Array) && path.length.between?(1, 4) && path.all? { |part| part.is_a?(String) && Xml::NAME.match?(part) } }
          raise Xml::Invalid, "setup_wire_contract_required"
        end
        contract
      end
      private_class_method :validate_contract!
    end
  end
end
