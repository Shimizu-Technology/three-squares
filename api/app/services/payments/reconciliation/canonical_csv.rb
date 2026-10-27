# frozen_string_literal: true

require "csv"
require "date"
require "digest"
require "time"

module Payments
  module Reconciliation
    # Application-owned observations, with no payment or settlement authority.
    class CanonicalCSV
      class Invalid < StandardError; end

      VERSION = "tsq-reconciliation-v1"
      HEADERS = %w[
        schema_version record_type account_id environment currency external_id
        batch_id deposit_id transaction_id original_reference location_id terminal_id
        entry_type amount_cents sales_cents returns_cents fees_cents adjustments_cents
        occurred_at provider_local_time provider_offset business_date provider_batch_date
        deposit_date description
      ].freeze
      CONTEXT_FIELDS = %w[account_id environment currency].freeze
      ID_FIELDS = %w[account_id external_id batch_id deposit_id transaction_id original_reference terminal_id].freeze
      MONEY_FIELDS = %w[amount_cents sales_cents returns_cents fees_cents adjustments_cents].freeze
      DATE_FIELDS = %w[business_date provider_batch_date deposit_date].freeze
      REQUIRED = {
        "batch" => %w[amount_cents sales_cents returns_cents fees_cents adjustments_cents provider_batch_date business_date].freeze,
        "item" => %w[batch_id entry_type amount_cents occurred_at business_date].freeze,
        "deposit" => %w[amount_cents deposit_date].freeze,
        "allocation" => %w[batch_id deposit_id amount_cents].freeze
      }.freeze
      FIELD_TYPES = {
        "batch_id" => %w[batch item allocation].freeze,
        "deposit_id" => %w[deposit allocation].freeze,
        "transaction_id" => %w[item].freeze,
        "original_reference" => %w[item].freeze,
        "entry_type" => %w[item].freeze,
        "sales_cents" => %w[batch].freeze,
        "returns_cents" => %w[batch].freeze,
        "fees_cents" => %w[batch].freeze,
        "adjustments_cents" => %w[batch].freeze,
        "provider_batch_date" => %w[batch item allocation].freeze,
        "deposit_date" => %w[deposit allocation].freeze
      }.freeze
      ENTRY_TYPES = %w[sale return void reversal fee adjustment].freeze
      MAX_BYTES = 1_048_576
      MAX_ROWS = 1000
      MAX_CELL_BYTES = 512
      MAX_INTEGER = 2_147_483_647
      ID_PATTERN = /\A[A-Za-z0-9][A-Za-z0-9_.:\/-]*\z/
      DATE_PATTERN = /\A\d{4}-\d{2}-\d{2}\z/
      OFFSET_PATTERN = /\A[+-](?:[01]\d|2[0-3]):[0-5]\d\z/
      LOCAL_PATTERN = /\A\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\z/
      INSTANT_PATTERN = /\A\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)\z/

      class << self
        def parse(text, context:)
          scope = validate_context(context)
          invalid(0, "input", "must be a string") unless text.is_a?(String)
          invalid(0, "input", "exceeds byte limit") if text.bytesize > MAX_BYTES
          source = utf8(text, 0, "input")
          source = source.delete_prefix("\uFEFF")
          invalid(0, "input", "unexpected BOM") if source.include?("\uFEFF")
          csv = CSV.new(source, skip_blanks: false, liberal_parsing: false)
          row_number = 1
          header = csv.shift
          invalid(1, "headers", "must match canonical order exactly") unless header == HEADERS
          records = []
          row_number = 2
          while (cells = csv.shift)
            invalid(row_number, "record", "exceeds row limit") if records.length >= MAX_ROWS
            invalid(row_number, "record", "must have 25 columns") unless cells.length == HEADERS.length
            records << normalize_record(HEADERS.zip(cells).to_h, scope, row_number)
            row_number += 1
          end
          invalid(2, "record", "at least one record required") if records.empty?
          { records: records.freeze, sha256: Digest::SHA256.hexdigest(text).freeze }.freeze
        rescue CSV::MalformedCSVError
          invalid(row_number || 1, "record", "invalid CSV syntax")
        end

        def dump(records:, context:)
          scope = validate_context(context)
          unless records.is_a?(Array) && records.length.between?(1, MAX_ROWS)
            invalid(0, "records", "must contain 1 to 1000 records")
          end
          output = CSV.generate_line(HEADERS, row_sep: "\n")
          normalized = records.each_with_index.map do |record, index|
            row = index + 2
            unless record.is_a?(Hash) && record.size <= HEADERS.size && record.keys.all? { |key| HEADERS.include?(key) }
              invalid(row, "record", "must be a hash of canonical string keys")
            end
            values = record.dup
            scope.merge("schema_version" => VERSION).each do |field, expected|
              invalid(row, field, "conflicts with context or version") if values.key?(field) && values[field] != expected
              values[field] = expected
            end
            values.each do |field, value|
              next if value.nil?
              if MONEY_FIELDS.include?(field) || field == "location_id"
                invalid(row, field, "must be an integer") unless value.is_a?(Integer)
                invalid(row, field, "outside integer bound") if value.abs > MAX_INTEGER
                values[field] = value.to_s
              elsif !value.is_a?(String)
                invalid(row, field, "must be a string")
              end
            end
            result = normalize_record(values, scope, row)
            output << CSV.generate_line(HEADERS.map { |field| result[field] }, row_sep: "\n")
            invalid(row, "record", "exceeds output byte limit") if output.bytesize > MAX_BYTES
            result
          end
          invalid(0, "records", "round trip mismatch") unless parse(output, context: scope)[:records] == normalized
          output
        end

        private

        def invalid(row, field, reason)
          raise Invalid, "row #{row} field #{field}: #{reason}"
        end

        def utf8(value, row, field)
          string = value.dup.force_encoding(Encoding::UTF_8)
          invalid(row, field, "invalid UTF-8") unless string.valid_encoding?
          string
        end

        def validate_context(context)
          unless context.is_a?(Hash) && context.size == CONTEXT_FIELDS.size && CONTEXT_FIELDS.all? { |field| context.key?(field) }
            invalid(0, "context", "requires account_id, environment, currency string keys")
          end
          scope = context.to_h do |field, value|
            invalid(0, field, "must be a nonempty string") unless value.is_a?(String) && !value.empty?
            invalid(0, field, "exceeds cell byte limit") if value.bytesize > MAX_CELL_BYTES
            [ field, utf8(value, 0, field).freeze ]
          end
          validate_id(scope["account_id"], 0, "account_id")
          invalid(0, "environment", "unsupported environment") unless %w[production sandbox simulated].include?(scope["environment"])
          invalid(0, "currency", "must be USD") unless scope["currency"] == "USD"
          scope.freeze
        end

        def normalize_record(values, scope, row)
          result = HEADERS.to_h do |field|
            value = values[field]
            unless value.nil?
              invalid(row, field, "must be a string") unless value.is_a?(String)
              invalid(row, field, "exceeds cell byte limit") if value.bytesize > MAX_CELL_BYTES
              value = utf8(value, row, field)
              invalid(row, field, "contains control character or BOM") if value.match?(/[\p{Cc}\uFEFF]/)
              value = nil if value.empty?
            end
            [ field, value ]
          end
          invalid(row, "schema_version", "unsupported version") unless result["schema_version"] == VERSION
          scope.each do |field, expected|
            invalid(row, field, "does not match context") unless result[field] == expected
          end
          type = result["record_type"]
          invalid(row, "record_type", "unsupported type") unless REQUIRED.key?(type)
          ([ "external_id" ] + REQUIRED.fetch(type)).each do |field|
            invalid(row, field, "required") if result[field].nil?
          end
          FIELD_TYPES.each do |field, types|
            invalid(row, field, "incompatible record type") if result[field] && !types.include?(type)
          end
          ID_FIELDS.each { |field| validate_id(result[field], row, field) if result[field] }
          MONEY_FIELDS.each do |field|
            next unless result[field]
            result[field] = integer(result[field], row, field)
            if %w[sales_cents returns_cents fees_cents].include?(field) && result[field].negative?
              invalid(row, field, "must be nonnegative")
            end
          end
          if result["location_id"]
            result["location_id"] = integer(result["location_id"], row, "location_id")
            invalid(row, "location_id", "must be positive") unless result["location_id"].positive?
          end
          if result["entry_type"] && !ENTRY_TYPES.include?(result["entry_type"])
            invalid(row, "entry_type", "unsupported entry type")
          end
          DATE_FIELDS.each { |field| validate_date(result[field], row, field) if result[field] }
          if result["occurred_at"]
            instant = result["occurred_at"]
            invalid(row, "occurred_at", "requires ISO8601 with explicit offset and at most 6 fractional digits") unless instant.match?(INSTANT_PATTERN)
            validate_date(instant[0, 10], row, "occurred_at")
            utc = Time.iso8601(instant).utc
            invalid(row, "occurred_at", "UTC year outside four-digit range") unless utc.year.between?(0, 9999)
            result["occurred_at"] = utc.iso8601(6)
          end
          validate_provider_time(result, row)
          if result["description"]
            description = result["description"]
            invalid(row, "description", "exceeds 160 characters") if description.length > 160
            invalid(row, "description", "formula requires literal leading apostrophe") if description.match?(/\A[[:space:]]*[=+\-@]/)
          end
          result.each_value { |value| value.freeze }
          result.freeze
        end

        def validate_id(value, row, field)
          invalid(row, field, "requires opaque identifier of at most 128 bytes") unless value.bytesize <= 128 && value.match?(ID_PATTERN)
        end

        def integer(value, row, field)
          invalid(row, field, "requires base-10 integer") unless value.match?(/\A-?\d+\z/)
          number = Integer(value, 10)
          invalid(row, field, "outside integer bound") if number.abs > MAX_INTEGER
          number
        end

        def validate_date(value, row, field)
          invalid(row, field, "requires valid YYYY-MM-DD") unless value.match?(DATE_PATTERN)
          Date.iso8601(value, Date::GREGORIAN)
        rescue Date::Error
          invalid(row, field, "requires valid YYYY-MM-DD")
        end

        def validate_provider_time(result, row)
          local = result["provider_local_time"]
          offset = result["provider_offset"]
          invalid(row, "provider_local_time", "requires local time and offset pair") if local.nil? != offset.nil?
          return unless local

          invalid(row, "provider_local_time", "requires YYYY-MM-DD HH:MM:SS") unless local.match?(LOCAL_PATTERN)
          validate_date(local[0, 10], row, "provider_local_time")
          invalid(row, "provider_offset", "requires signed HH:MM offset") unless offset.match?(OFFSET_PATTERN)
        end
      end
    end
  end
end
