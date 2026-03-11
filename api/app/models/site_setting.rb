class SiteSetting < ApplicationRecord
  # Singleton pattern - only one record should ever exist
  validates :payment_processor, presence: true, inclusion: { in: %w[stripe paypal] }
  validates :payment_test_mode, inclusion: { in: [ true, false ] }
  validate :validate_shipping_origin_address

  # Singleton accessor — always queries DB to ensure Sidekiq workers see
  # the latest admin settings. Single-row table, so this is fast (~0.1ms).
  # Do NOT memoize with Thread.current — Sidekiq threads are long-lived
  # and would serve stale toggle values after admin settings changes.
  def self.instance
    first_or_create!(
      payment_test_mode: true,
      payment_processor: "stripe",
      send_customer_emails: false, # Legacy field - kept for backwards compatibility
      send_retail_emails: false,   # Off by default for development
      send_wholesale_emails: false, # Off by default for development
      store_name: "Three Squares",
      store_email: "sales@bgpacific.com",
      store_phone: "671-646-2652",
      placeholder_image_url: "/images/three-squares-logo.png",
      order_notification_emails: [ "shimizutechnology@gmail.com" ],
      shipping_origin_address: {
        company: "Three Squares",
        street1: "416 Chalan San Antonio",
        street2: "",
        city: "Tamuning",
        state: "GU",
        zip: "96913",
        country: "US",
        phone: "671-646-2652"
      }
    )
  end

  # Check if customer emails are enabled for a specific order type
  def send_emails_for?(order_type)
    case order_type
    when "wholesale" then send_wholesale_emails
    else send_retail_emails # retail is default
    end
  end

  # Prevent deletion of the singleton record
  before_destroy :prevent_destroy

  # Helper methods
  def test_mode?
    payment_test_mode
  end

  def production_mode?
    !payment_test_mode
  end

  def using_stripe?
    payment_processor == "stripe"
  end

  def using_paypal?
    payment_processor == "paypal"
  end

  def shipping_origin_complete?
    missing = missing_shipping_origin_fields
    missing.empty?
  end

  private

  def prevent_destroy
    raise ActiveRecord::RecordNotDestroyed, "Cannot delete the site settings record"
  end

  def validate_shipping_origin_address
    missing = missing_shipping_origin_fields
    return if missing.empty?

    errors.add(:shipping_origin_address, "is missing required fields: #{missing.join(', ')}")
  end

  def missing_shipping_origin_fields
    address = shipping_origin_address || {}
    required = %w[company street1 city state zip country phone]

    required.select do |field|
      address[field].blank? && address[field.to_sym].blank?
    end
  end
end
