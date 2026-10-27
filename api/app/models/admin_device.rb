class AdminDevice < ApplicationRecord
  belongs_to :user, optional: true
  belongs_to :location, optional: true
  has_many :admin_push_subscriptions, dependent: :destroy

  validates :device_uuid, presence: true, uniqueness: true
  validates :name, presence: true

  scope :active, -> { where(active: true) }
  scope :recent, -> { order(last_seen_at: :desc, updated_at: :desc) }

  def push_enabled?
    admin_push_subscriptions.active.exists?
  end

  def mark_seen!
    update_column(:last_seen_at, Time.current)
  end
end
