# frozen_string_literal: true

class User < ApplicationRecord
  ROLE_HIERARCHY = { "customer" => 0, "staff" => 1, "manager" => 2, "owner" => 3 }.freeze

  # Validations
  validates :clerk_id, presence: true, uniqueness: true
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: %w[ customer staff manager owner ] }, allow_nil: false
  validate :staff_requires_location

  # Default role
  after_initialize :set_default_role, if: :new_record?

  # Associations
  belongs_to :assigned_location, class_name: "Location", optional: true
  has_many :cart_items, dependent: :destroy
  has_many :imports, dependent: :destroy
  has_many :orders, dependent: :nullify

  # Scopes
  scope :admins, -> { where(role: %w[ staff manager owner ]) }
  scope :owners, -> { where(role: "owner") }
  scope :customers, -> { where(role: "customer") }

  # Role hierarchy helpers
  def role_level
    ROLE_HIERARCHY[role] || 0
  end

  def owner?
    role == "owner"
  end

  def manager?
    role == "manager"
  end

  def staff?
    role == "staff"
  end

  def customer?
    role == "customer"
  end

  def manager_or_above?
    role_level >= ROLE_HIERARCHY["manager"]
  end

  def staff_or_above?
    role_level >= ROLE_HIERARCHY["staff"]
  end

  # Backwards compatibility: admin? now means staff_or_above
  def admin?
    staff_or_above?
  end

  # Location-scoped: staff/manager/owner with assigned location see only their location's data
  def location_scoped?
    staff_or_above? && assigned_location_id.present?
  end

  private

  def set_default_role
    self.role ||= "customer"
  end

  def staff_requires_location
    if staff? && assigned_location_id.blank?
      errors.add(:assigned_location_id, "is required for staff members")
    end
  end
end
