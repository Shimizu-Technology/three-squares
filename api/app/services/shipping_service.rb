# frozen_string_literal: true

class ShippingService
  # Three Squares's warehouse address (Guam) - default fallback
  ORIGIN_ADDRESS = {
    company: "Three Squares",
    street1: "215 Rojas Street",
    street2: "Ixora Industrial Park, Unit 104",
    city: "Tamuning",
    state: "GU",
    zip: "96913",
    country: "US",
    phone: "671-989-3444"
  }.freeze

  class ShippingError < StandardError; end

  # Default weight for items without weight (8oz = typical apparel)
  DEFAULT_WEIGHT_OZ = 8.0

  # Calculate shipping rates for a cart/order
  # @param cart_items [Array<CartItem>] - Items to ship
  # @param destination [Hash] - Shipping address (street1, city, state, zip, country)
  # @return [Array<Hash>] - Array of shipping options with rates
  def self.calculate_rates(cart_items, destination)
    raise ShippingError, "No items to ship" if cart_items.blank?
    raise ShippingError, "Destination address required" if destination.blank?

    # Calculate total weight (use default 8oz per item if weight not set)
    total_weight_oz = cart_items.sum do |item|
      weight = item.product_variant.weight_oz.presence || DEFAULT_WEIGHT_OZ
      weight * item.quantity
    end

    # Ensure minimum weight for shipping calculation
    total_weight_oz = DEFAULT_WEIGHT_OZ if total_weight_oz <= 0

    # Try EasyPost first if configured
    if ENV["EASYPOST_API_KEY"].present?
      begin
        return calculate_easypost_rates(cart_items, destination, total_weight_oz)
      rescue StandardError => e
        Rails.logger.error "EasyPost failed, using fallback rates: #{e.message}"
        # Fall through to fallback rates
      end
    else
      Rails.logger.warn "EasyPost API key not configured, using fallback rates"
    end

    # Fallback to table rates
    calculate_fallback_rates(total_weight_oz, destination)
  end

  private

  # Calculate rates using EasyPost API
  def self.calculate_easypost_rates(cart_items, destination, total_weight_oz)
    origin = origin_address

    Rails.logger.info "🚀 Attempting EasyPost API call..."
    Rails.logger.info "   Weight: #{total_weight_oz}oz"
    Rails.logger.info "   From: #{origin[:city]}, #{origin[:state]} #{origin[:zip]}"
    Rails.logger.info "   To: #{destination[:city]}, #{destination[:state]} #{destination[:zip]}"

    # Create custom HTTP executor to work around macOS SSL/CRL issue
    # This uses Net::HTTP with SSL verification but without CRL checking
    custom_http_exec = lambda do |method, uri, headers, open_timeout, read_timeout, body = nil|
      require "net/http"

      # Log the API request for debugging
      if body && method.to_s.downcase == "post"
        Rails.logger.debug "📤 EasyPost Request: #{uri}"
        Rails.logger.debug "   Body: #{body[0..500]}" # First 500 chars
      end

      # Build request
      request = Net::HTTP.const_get(method.to_s.capitalize).new(uri)
      headers.each { |k, v| request[k] = v }
      request.body = body if body

      # Execute request with custom SSL settings
      response = Net::HTTP.start(
        uri.host,
        uri.port,
        use_ssl: true,
        read_timeout: read_timeout,
        open_timeout: open_timeout,
        verify_mode: OpenSSL::SSL::VERIFY_PEER,
        ca_file: ENV["SSL_CERT_FILE"],
        # Custom verify callback that bypasses CRL checking
        verify_callback: proc { |preverify_ok, _cert_store| preverify_ok }
      ) do |http|
        http.request(request)
      end

      # Log response for debugging
      if response.body
        Rails.logger.debug "📥 EasyPost Response: #{response.code}"
        Rails.logger.debug "   Body: #{response.body[0..500]}" # First 500 chars
      end

      response
    end

    # Create EasyPost client with custom HTTP executor
    client = EasyPost::Client.new(
      api_key: ENV["EASYPOST_API_KEY"],
      read_timeout: 60,
      open_timeout: 30,
      custom_client_exec: custom_http_exec
    )

    Rails.logger.info "✅ EasyPost client created with custom HTTP executor (CRL checking disabled)"

    # Create EasyPost shipment
    shipment = client.shipment.create(
      from_address: origin,
      to_address: {
        street1: destination[:street1],
        street2: destination[:street2],
        city: destination[:city],
        state: destination[:state],
        zip: destination[:zip],
        country: destination[:country] || "US",
        name: destination[:name],
        phone: destination[:phone]
      },
      parcel: {
        weight: total_weight_oz,
        # Assume standard box dimensions (can be customized per product later)
        length: 12,
        width: 10,
        height: 8
      }
    )

    Rails.logger.info "✅ EasyPost shipment created: #{shipment.id}"
    Rails.logger.info "   Origin verified: #{shipment.from_address&.city}, #{shipment.from_address&.state}"
    Rails.logger.info "   Found #{shipment.rates.count} rates"

    # Log first rate for verification
    if shipment.rates.any?
      first_rate = shipment.rates.first
      Rails.logger.info "   Example rate: #{first_rate.carrier} #{first_rate.service} - $#{first_rate.rate}"
    end

    # Format rates for frontend
    formatted = format_rates(shipment.rates)
    Rails.logger.info "✅ Returning #{formatted.count} formatted rates"
    formatted
  rescue StandardError => e
    Rails.logger.error "❌ EasyPost Error Details:"
    Rails.logger.error "   Class: #{e.class.name}"
    Rails.logger.error "   Message: #{e.message}"
    Rails.logger.error "   Backtrace: #{e.backtrace.first(5).join("\n   ")}"
    raise e
  end

  def self.origin_address
    settings_address = SiteSetting.instance.shipping_origin_address || {}
    normalized = deep_symbolize_keys(settings_address)

    ORIGIN_ADDRESS.merge(normalized).compact
  end

  # Calculate rates using fallback table
  def self.calculate_fallback_rates(total_weight_oz, destination)
    settings = SiteSetting.instance
    rates_table = settings.fallback_shipping_rates

    # Determine if international (non-US) or domestic
    country = destination[:country] || "US"
    is_international = country.upcase != "US"

    rate_type = is_international ? "international" : "domestic"
    rate_tiers = rates_table[rate_type] || rates_table["domestic"]

    # Find matching rate tier based on weight
    matching_tier = rate_tiers.find do |tier|
      max_weight = tier["max_weight_oz"]
      max_weight.nil? || total_weight_oz <= max_weight
    end

    rate_cents = matching_tier ? matching_tier["rate_cents"] : 5000 # Default $50 if no match

    # Return a single fallback rate in the same format as EasyPost rates
    [ {
      id: "fallback_standard",
      carrier: "Standard Shipping",
      service: is_international ? "International Mail" : "USPS Priority Mail",
      rate_cents: rate_cents, # Use cents directly
      rate_formatted: "$#{'%.2f' % (rate_cents / 100.0)}",
      delivery_days: is_international ? 14 : 5,
      delivery_date: nil,
      delivery_date_guaranteed: false,
      fallback: true # Mark as fallback rate
    } ]
  end

  # Validate a shipping address
  # @param address [Hash] - Address to validate
  # @return [Hash] - Validated/corrected address
  def self.validate_address(address)
    raise ShippingError, "EasyPost API key not configured" unless ENV["EASYPOST_API_KEY"].present?

    # Create EasyPost client
    client = EasyPost::Client.new(api_key: ENV["EASYPOST_API_KEY"])

    easypost_address = client.address.create(
      street1: address[:street1],
      street2: address[:street2],
      city: address[:city],
      state: address[:state],
      zip: address[:zip],
      country: address[:country] || "US",
      verify: [ "delivery" ]
    )

    # Return the verified address or original if verification fails
    if easypost_address.verifications&.delivery&.success
      {
        street1: easypost_address.street1,
        street2: easypost_address.street2,
        city: easypost_address.city,
        state: easypost_address.state,
        zip: easypost_address.zip,
        country: easypost_address.country,
        verified: true
      }
    else
      address.merge(verified: false)
    end
  rescue StandardError => e
    Rails.logger.error "EasyPost Address Verification Error: #{e.message}"
    address.merge(verified: false, error: e.message)
  end

  private

  # Format EasyPost rates for frontend consumption
  def self.format_rates(rates)
    return [] if rates.blank?

    # Filter and sort rates
    rates
      .select { |rate| rate.rate.present? && rate.rate.to_f > 0 }
      .sort_by { |rate| rate.rate.to_f }
      .map do |rate|
        {
          id: rate.id,
          carrier: rate.carrier,
          service: rate.service,
          rate_cents: (rate.rate.to_f * 100).to_i,
          rate_formatted: "$#{'%.2f' % rate.rate}",
          delivery_days: rate.delivery_days,
          delivery_date: rate.delivery_date,
          delivery_date_guaranteed: rate.delivery_date_guaranteed || false,
          est_delivery_days: rate.est_delivery_days
        }
      end
  end

  def self.deep_symbolize_keys(value)
    case value
    when Hash
      value.each_with_object({}) do |(k, v), memo|
        memo[k.to_sym] = deep_symbolize_keys(v)
      end
    when Array
      value.map { |v| deep_symbolize_keys(v) }
    else
      value
    end
  end
end
