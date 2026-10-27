require "uri"
require "ipaddr"

class QrCodeService
  DEFAULT_ORIGIN = "https://three-squares-web.netlify.app".freeze

  def initialize(location, base_url: nil)
    unless location.slug.to_s.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/)
      raise ArgumentError, "Save a lowercase hyphenated location slug before generating its QR code"
    end
    @location = location
    @origin = validated_origin(ENV["PUBLIC_STOREFRONT_ORIGIN"].presence || ENV["FRONTEND_URL"].presence || DEFAULT_ORIGIN)
    if base_url.present? && validated_origin(base_url) != @origin
      raise ArgumentError, "QR origin must match the configured public storefront"
    end
  end

  def menu_url
    "#{@origin}/menu/#{ERB::Util.url_encode(@location.slug)}"
  end

  def to_svg
    RQRCode::QRCode.new(menu_url, level: :h).as_svg(
      module_size: 6, standalone: true, use_path: true, viewbox: true,
      offset: 24, color: "000", fill: "fff"
    )
  end

  private

  def validated_origin(value)
    uri = URI.parse(value.to_s)
    local = !Rails.env.production? && %w[localhost 127.0.0.1].include?(uri.host)
    # WHATWG browsers interpret shortened, octal and hex numeric hosts as IPv4.
    numeric_host = uri.host.to_s.split(".").last.to_s.match?(/\A(?:[0-9]+|0x[0-9a-f]+)\z/i)
    public_host = !numeric_host && uri.host.present? && uri.host.match?(/\A[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\z/i) && !uri.host.downcase.end_with?(".local", ".localhost", ".internal", ".test", ".invalid")
    begin
      IPAddr.new(uri.host.to_s)
      # WHATWG browsers interpret shortened, octal and hex numeric hosts as IPv4.
    numeric_host = uri.host.to_s.split(".").last.to_s.match?(/\A(?:[0-9]+|0x[0-9a-f]+)\z/i)
    public_host = !numeric_host && false # Printed production links must use a public hostname.
    rescue IPAddr::InvalidAddressError
      # DNS hostnames are expected.
    end
    valid_transport = uri.scheme == "https" && uri.port == 443 || local && uri.scheme == "http"
    unless valid_transport && (local || public_host) && uri.userinfo.nil? &&
        ["", "/"].include?(uri.path) && uri.query.nil? && uri.fragment.nil?
      raise ArgumentError, "Configure a valid public HTTPS storefront origin for QR codes"
    end
    "#{uri.scheme}://#{uri.host}#{uri.port == uri.default_port ? '' : ":#{uri.port}"}"
  rescue URI::InvalidURIError
    raise ArgumentError, "Invalid QR storefront origin"
  end
end
