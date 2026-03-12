class Order < ApplicationRecord
  belongs_to :user, optional: true  # Allow guest checkout
  belongs_to :location, optional: true
  has_many :order_items, dependent: :destroy
  has_many :refunds, dependent: :destroy

  # Valid statuses by order type:
  # Retail:    pending → processing → shipped → delivered (or cancelled)
  # Wholesale: pending → confirmed → ready → picked_up (or cancelled)
  VALID_STATUSES = %w[pending confirmed processing ready shipped picked_up delivered cancelled].freeze
  RETAIL_STATUSES = %w[pending processing shipped delivered cancelled].freeze
  PICKUP_STATUSES = %w[pending confirmed ready picked_up cancelled].freeze

  # Explicit sequence map for notification idempotency. Jobs only execute
  # if their seq > last_*_seq, preventing both duplicates and out-of-order sends.
  # Starts at 1 (not 0) so "pending/placed" (seq=1) passes the default
  # last_*_seq=0 guard. 0 is reserved as "no notification sent yet".
  #
  # IMPORTANT: Use an explicit hash, NOT positional index from VALID_STATUSES.
  # Inserting a new status between existing ones would silently shift all
  # downstream seq values, breaking idempotency for in-flight jobs.
  STATUS_SEQUENCE = {
    "pending"    => 1,
    "confirmed"  => 2,
    "processing" => 3,
    "ready"      => 4,
    "shipped"    => 5,
    "picked_up"  => 6,
    "delivered"  => 7,
    "cancelled"  => 8
  }.freeze

  def notification_seq
    seq = STATUS_SEQUENCE[status]
    unless seq
      Rails.logger.error "⚠️ notification_seq: unknown status '#{status}' — " \
                         "add it to STATUS_SEQUENCE before using in production"
      raise ArgumentError, "Unknown order status '#{status}' has no notification sequence"
    end
    seq
  end

  # Validations
  validates :order_number, presence: true, uniqueness: true
  validates :order_type, inclusion: { in: %w[retail wholesale pickup dine_in] }
  validates :fulfillment_type, inclusion: { in: %w[pickup shipping] }
  validates :source, inclusion: { in: %w[online pos phone] }
  validates :payment_method, inclusion: { in: %w[stripe cash card_present] }, allow_nil: true
  validates :status, inclusion: { in: VALID_STATUSES }
  validates :payment_status, inclusion: { in: %w[pending paid failed refunded] }
  validates :total_cents, numericality: { greater_than_or_equal_to: 0 }
  validate :pickup_orders_require_location

  # Guest orders (no user_id) must have contact email — unless staff-created (POS walk-ins)
  validates :customer_email, presence: { message: "is required for guest checkout" }, if: -> { user_id.nil? && !staff_created? }
  validates :customer_email, format: { with: URI::MailTo::EMAIL_REGEXP, message: "is not a valid email address" }, allow_blank: true

  # Scopes
  scope :retail, -> { where(order_type: "retail") }
  scope :wholesale, -> { where(order_type: "wholesale") }
  scope :pos_orders, -> { where(source: "pos") }
  scope :online_orders, -> { where(source: "online") }
  scope :pending, -> { where(status: "pending") }
  scope :confirmed, -> { where(status: "confirmed") }
  scope :processing, -> { where(status: "processing") }
  scope :ready, -> { where(status: "ready") }
  scope :shipped, -> { where(status: "shipped") }
  scope :picked_up, -> { where(status: "picked_up") }
  scope :delivered, -> { where(status: "delivered") }
  scope :cancelled, -> { where(status: "cancelled") }
  scope :paid, -> { where(payment_status: "paid") }
  scope :recent, -> { order(created_at: :desc) }
  scope :active, -> { where.not(status: "cancelled") }

  # Callbacks
  before_validation :generate_order_number, if: -> { order_number.blank? }
  # NOTE: Inventory restoration on cancellation is handled by
  # admin/orders_controller#update (which passes current_user for audit trail).
  # Do NOT add an after_update callback here — it would double-restore.

  # Convenience aliases for customer fields
  def email
    customer_email
  end

  def email=(value)
    self.customer_email = value
  end

  def phone
    customer_phone
  end

  def phone=(value)
    self.customer_phone = value
  end

  def name
    customer_name
  end

  def name=(value)
    self.customer_name = value
  end

  # Money handling
  def subtotal
    Money.new(subtotal_cents || 0, "USD")
  end

  def shipping_cost
    Money.new(shipping_cost_cents || 0, "USD")
  end

  def tax
    Money.new(tax_cents || 0, "USD")
  end

  def total
    Money.new(total_cents || 0, "USD")
  end

  # Status helpers
  # Refund helpers
  def total_refunded_cents
    refunds.succeeded.sum(:amount_cents)
  end

  def fully_refunded?
    total_refunded_cents >= total_cents
  end

  def refundable_amount_cents
    total_cents - total_refunded_cents
  end

  def can_refund?
    payment_status == "paid" && refundable_amount_cents > 0
  end

    def can_cancel?
    %w[pending confirmed processing ready].include?(status)
  end

  def can_ship?
    status == "processing" && payment_status == "paid"
  end

  def can_mark_ready?
    wholesale? && status == "confirmed" && payment_status == "paid"
  end

  def is_paid?
    payment_status == "paid"
  end

  def is_complete?
    status.in?(%w[delivered picked_up])
  end

  def is_pickup_order?
    fulfillment_type == "pickup"
  end

  # Get valid next statuses based on order type and current status
  def next_status_options
    if retail?
      case status
      when "pending" then [ "processing", "cancelled" ]
      when "processing" then [ "shipped", "cancelled" ]
      when "shipped" then [ "delivered" ]
      else []
      end
    else
      case status
      when "pending" then [ "confirmed", "cancelled" ]
      when "confirmed" then [ "ready", "cancelled" ]
      when "ready" then [ "picked_up" ]
      else []
      end
    end
  end

  # Type helpers
  def retail?
    order_type == "retail"
  end

  def wholesale?
    order_type == "wholesale"
  end

  def pos_order?
    source == "pos"
  end

  def staff_created?
    staff_created
  end

  def cash_payment?
    payment_method == "cash"
  end

  def requires_shipping?
    fulfillment_type == "shipping"
  end

  # Shipping address helper
  def shipping_address
    return nil unless requires_shipping?

    {
      line1: shipping_address_line1,
      line2: shipping_address_line2,
      city: shipping_city,
      state: shipping_state,
      zip: shipping_zip,
      country: shipping_country || "US"
    }
  end

  def full_shipping_address
    return nil unless requires_shipping?

    [
      shipping_address_line1,
      shipping_address_line2,
      [ shipping_city, shipping_state, shipping_zip ].compact.join(", "),
      shipping_country
    ].compact.join("\n")
  end

  # Calculate totals from order items
  def calculate_totals!
    self.subtotal_cents = order_items.sum(:total_price_cents)
    self.total_cents = subtotal_cents + (shipping_cost_cents || 0) + (tax_cents || 0)
  end

  # Restore inventory when order is cancelled
  # Mirrors the deduct_inventory logic in reverse
  def restore_inventory_for_cancellation
    order_items.includes(product_variant: :product).each do |item|
      variant = item.product_variant
      next unless variant # Skip if variant was deleted

      product = variant.product

      case product.inventory_level
      when "variant"
        variant.with_lock do
          previous_stock = variant.stock_quantity
          new_stock = previous_stock + item.quantity
          variant.update!(stock_quantity: new_stock)

          InventoryAudit.record_order_cancelled(
            variant: variant,
            quantity: item.quantity,
            order: self
          )
        end

      when "product"
        product.with_lock do
          previous_stock = product.product_stock_quantity || 0
          new_stock = previous_stock + item.quantity
          product.update!(product_stock_quantity: new_stock)

          InventoryAudit.record_product_stock_change(
            product: product,
            previous_qty: previous_stock,
            new_qty: new_stock,
            reason: "Order ##{order_number} cancelled - stock restored",
            audit_type: "order_cancelled",
            order: self
          )
        end

      when "none"
        next
      end
    end

    Rails.logger.info "Inventory restored for cancelled order ##{order_number}"
  end

  private

  def pickup_orders_require_location
    return unless fulfillment_type == "pickup"
    return if location_id.present?

    errors.add(:location, "must be selected for pickup orders")
  end

  def generate_order_number
    # Format: TSQ-{TYPE}-YYYYMMDD-XXXX (Three Squares)
    # - Retail:    TSQ-R-20251210-0001
    # - Wholesale: TSQ-W-20251210-0001
    type_prefix = case source
    when "pos" then "P"
    else
      case order_type
      when "wholesale" then "W"
      else "R"
      end
    end

    date_str = Time.current.strftime("%Y%m%d")
    prefix = "TSQ-#{type_prefix}-#{date_str}"

    # Find the last order number with this prefix for today
    last_order = Order.where("order_number LIKE ?", "#{prefix}-%").order(:order_number).last

    if last_order
      # Extract the sequence number and increment
      sequence = last_order.order_number.split("-").last.to_i + 1
    else
      sequence = 1
    end

    self.order_number = "#{prefix}-#{sequence.to_s.rjust(4, '0')}"
  end
end
