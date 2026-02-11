# frozen_string_literal: true

# Catering inquiry/quote request from customers.
# Workflow: pending → quoted → accepted/declined → completed
class CateringInquiry < ApplicationRecord
  # === Constants ===
  STATUSES = %w[pending quoted accepted declined completed cancelled].freeze
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

  validate :event_date_in_future, on: :create
  validate :minimum_lead_time, on: :create

  # === Scopes ===
  scope :pending, -> { where(status: "pending") }
  scope :quoted, -> { where(status: "quoted") }
  scope :active, -> { where(status: %w[pending quoted accepted]) }
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
    days_until_event && days_until_event <= 7
  end

  def mark_quoted!(amount:, admin:, notes: nil)
    update!(
      status: "quoted",
      quoted_amount: amount,
      quoted_at: Time.current,
      responded_by: admin,
      admin_notes: notes
    )
  end

  def mark_accepted!
    update!(status: "accepted")
  end

  def mark_declined!
    update!(status: "declined")
  end

  def mark_completed!
    update!(status: "completed")
  end

  private

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
