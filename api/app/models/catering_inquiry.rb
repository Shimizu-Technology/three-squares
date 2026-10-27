# frozen_string_literal: true

# Catering inquiry/quote request from customers.
# Quotes are manually recorded; no customer delivery is implied.
class CateringInquiry < ApplicationRecord
  # === Constants ===
  STATUSES = %w[pending quoted accepted declined completed cancelled].freeze
  ACTIVE_STATUSES = %w[pending quoted accepted].freeze
  STATUS_TRANSITIONS = {
    "pending" => %w[quoted cancelled],
    "quoted" => %w[accepted declined cancelled],
    "accepted" => %w[completed cancelled],
    "declined" => %w[cancelled],
    "completed" => [],
    "cancelled" => []
  }.freeze
  EVENT_TYPES = %w[wedding corporate party graduation funeral memorial other].freeze
  BUDGET_RANGES = [
    "$500 or less",
    "$500 - $1,000",
    "$1,000 - $2,500",
    "$2,500 - $5,000",
    "$5,000 - $10,000",
    "$10,000+"
  ].freeze

  # === Associations ===
  belongs_to :responded_by, class_name: "User", optional: true

  # === Validations ===
  validates :contact_name, presence: true
  validates :contact_email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :event_type, presence: true, inclusion: { in: EVENT_TYPES }
  validates :event_date, presence: true
  validates :guest_count, presence: true, numericality: { greater_than: 0 }
  validates :status, presence: true, inclusion: { in: STATUSES }

  validate :allowed_status_transition, on: :update

  validate :event_date_in_future, on: :create
  validate :minimum_lead_time, on: :create

  # === Scopes ===
  scope :pending, -> { where(status: "pending") }
  scope :quoted, -> { where(status: "quoted") }
  scope :active, -> { where(status: ACTIVE_STATUSES) }
  scope :urgent, -> { active.where(event_date: Date.current..(Date.current + 7)) }
  scope :upcoming, -> { where("event_date >= ?", Date.current).order(:event_date) }
  scope :recent, -> { order(created_at: :desc) }

  # === Instance Methods ===

  def pending?
    status == "pending"
  end

  def quoted?
    status == "quoted"
  end

  def accepted?
    status == "accepted"
  end

  def declined?
    status == "declined"
  end

  def days_until_event
    return nil unless event_date
    (event_date - Date.current).to_i
  end

  def urgent?
    ACTIVE_STATUSES.include?(status) && days_until_event.present? && days_until_event.between?(0, 7)
  end

  # Validate the uncast input only when recording a quote. Historical malformed
  # amounts must not prevent staff from saving unrelated notes or status changes.
  def mark_quoted!(amount:, admin:, **options)
    unless %w[pending quoted].include?(status)
      errors.add(:status, "does not allow recording a quote")
      raise ActiveRecord::RecordInvalid, self
    end

    unless (amount.is_a?(String) || amount.is_a?(Numeric)) &&
        amount.to_s.match?(/\A[0-9]+(?:\.[0-9]{1,2})?\z/) &&
        amount.to_d.positive? && amount.to_d <= BigDecimal("99999999.99")
      errors.add(:quoted_amount, "must be a positive decimal up to 99999999.99 with at most two decimal places")
      raise ActiveRecord::RecordInvalid, self
    end

    attributes = {
      status: "quoted",
      quoted_amount: amount,
      quoted_at: Time.current,
      responded_by: admin
    }
    attributes[:admin_notes] = options[:notes] if options.key?(:notes)
    update!(attributes)
  end

  def transition_to!(next_status)
    unless next_status != "quoted" && STATUS_TRANSITIONS.fetch(status, []).include?(next_status)
      errors.add(:status, "cannot change from #{status} to #{next_status}")
      raise ActiveRecord::RecordInvalid, self
    end

    update!(status: next_status)
  end

  def mark_accepted!
    transition_to!("accepted")
  end

  def mark_declined!
    transition_to!("declined")
  end

  def mark_completed!
    transition_to!("completed")
  end

  private

  def allowed_status_transition
    return unless will_save_change_to_status?
    return if STATUS_TRANSITIONS.fetch(status_in_database, []).include?(status)

    errors.add(:status, "cannot change from #{status_in_database} to #{status}")
  end

  def event_date_in_future
    return unless event_date
    if event_date < Date.current
      errors.add(:event_date, "must be in the future")
    end
  end

  def minimum_lead_time
    return unless event_date
    min_days = 3  # Minimum 3 days notice for catering
    if event_date < Date.current + min_days.days
      errors.add(:event_date, "must be at least #{min_days} days from now for catering orders")
    end
  end
end
