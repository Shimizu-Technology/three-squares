class User < ApplicationRecord
  # Validations
  validates :clerk_id, presence: true, uniqueness: true
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: %w[customer admin] }, allow_nil: false

  # Default role
  after_initialize :set_default_role, if: :new_record?

  # Associations
  belongs_to :assigned_location, class_name: "Location", optional: true
  has_many :cart_items, dependent: :destroy
  has_many :imports, dependent: :destroy
  has_many :orders, dependent: :nullify  # Keep orders but remove user association on delete

  # Scopes
  scope :admins, -> { where(role: "admin") }
  scope :customers, -> { where(role: "customer") }

  # Role helpers
  def admin?
    role == "admin"
  end

  def customer?
    role == "customer"
  end

  # Location-scoped staff: when assigned, they only see their location's data
  def location_scoped?
    admin? && assigned_location_id.present?
  end

  private

  def set_default_role
    self.role ||= "customer"
  end
end
