class User < ApplicationRecord
  ROLES = %w[customer owner manager staff].freeze
  # Shared across every User save/destroy, rather than a lock on one owner row.
  # PostgreSQL releases this advisory lock at transaction end (commit/rollback).
  OWNER_GUARD_LOCK = 8_423_071_006

  validates :clerk_id, presence: true, uniqueness: true
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: ROLES }, allow_nil: false
  validate :staff_requires_valid_location

  after_initialize :set_default_role, if: :new_record?
  # Role writes/deletions must use save/update/destroy, not callback-skipping
  # update_all/update_columns/delete APIs.
  before_save :protect_owner_change
  # Prepend so a rejected destroy cannot run dependent association callbacks.
  before_destroy :protect_owner_destruction, prepend: true

  belongs_to :assigned_location, class_name: "Location", optional: true
  has_many :cart_items, dependent: :destroy
  has_many :imports, dependent: :destroy
  has_many :admin_devices, dependent: :nullify
  has_many :orders, dependent: :nullify

  scope :admins, -> { where(role: "owner") }
  scope :owners, -> { where(role: "owner") }
  scope :customers, -> { where(role: "customer") }

  def owner?
    role == "owner"
  end

  def manager?
    role == "manager"
  end

  def staff?
    role == "staff"
  end

  # Compatibility for owner-only legacy call sites. Never aliases operational
  # roles or accepts obsolete admin writes after the conversion migration.
  def admin?
    owner?
  end

  def customer?
    role == "customer"
  end

  def access_policy
    StaffAccessPolicy.new(self)
  end

  # Compatibility helpers are not a substitute for policy.scope_relation:
  # an invalid/missing staff assignment has scope :none, never global access.
  def location_scoped?
    staff? || (manager? && assigned_location_id.present?)
  end

  def global_admin?
    owner?
  end

  private

  def set_default_role
    self.role ||= "customer"
  end

  def staff_requires_valid_location
    if staff? && !Location.exists?(id: assigned_location_id)
      errors.add(:assigned_location, "must be a valid location for staff")
    end
  end

  def protect_owner_change
    protect_last_owner(removing: role != "owner")
  end

  def protect_owner_destruction
    protect_last_owner(removing: true)
  end

  def protect_last_owner(removing:)
    self.class.connection.execute("SELECT pg_advisory_xact_lock(#{OWNER_GUARD_LOCK})")
    # Read the persisted role after locking: a stale model instance must not
    # bypass the guard after another transaction promotes/demotes that user.
    return unless persisted? && self.class.unscoped.where(id: id).pick(:role) == "owner"
    return unless removing
    return if self.class.unscoped.where(role: "owner").where.not(id: id).exists?

    errors.add(:base, "Cannot remove the last owner")
    throw(:abort)
  end
end
