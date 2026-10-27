require "base64"
require "openssl"
require "uri"

class AdminPushSubscription < ApplicationRecord
  # Never send to arbitrary client-provided hosts. These are the browser vendors'
  # push services; Net::HTTP (used by web-push) does not follow redirects.
  PUSH_HOSTS = %w[fcm.googleapis.com updates.push.services.mozilla.com web.push.apple.com].freeze

  belongs_to :admin_device

  validates :endpoint, presence: true, uniqueness: true, length: { maximum: 2048 }
  validate :safe_endpoint
  validate :valid_subscription_keys

  scope :active, -> { where(active: true) }

  def safe_endpoint?
    uri = URI.parse(endpoint.to_s)
    uri.is_a?(URI::HTTPS) && PUSH_HOSTS.include?(uri.host) && uri.port == 443 &&
      uri.userinfo.nil? && uri.fragment.nil? && uri.path.start_with?("/") && uri.path.length > 1
  rescue URI::InvalidURIError
    false
  end

  private

  def safe_endpoint
    errors.add(:endpoint, "must be an HTTPS browser push service URL") unless safe_endpoint?
  end

  def valid_subscription_keys
    public_key = decode_key(p256dh_key)
    auth = decode_key(auth_key)
    unless valid_public_key?(public_key)
      errors.add(:p256dh_key, "must be a URL-safe base64 uncompressed P-256 public key")
    end
    errors.add(:auth_key, "must be a URL-safe base64 16-byte secret") unless auth&.bytesize == 16
  end

  def valid_public_key?(key)
    return false unless key&.bytesize == 65 && key.getbyte(0) == 4

    point = OpenSSL::PKey::EC::Point.new(OpenSSL::PKey::EC::Group.new("prime256v1"), OpenSSL::BN.new(key, 2))
    point.on_curve? && !point.infinity?
  rescue OpenSSL::OpenSSLError
    false
  end

  def decode_key(value)
    return unless value.to_s.match?(/\A[A-Za-z0-9_-]+={0,2}\z/) && value.length <= 90

    Base64.urlsafe_decode64(value)
  rescue ArgumentError
    nil
  end
end
