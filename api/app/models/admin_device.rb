class AdminDevice < ApplicationRecord
  belongs_to :user, optional: true
  belongs_to :location, optional: true
  has_many :admin_push_subscriptions, dependent: :destroy

  validates :device_uuid, presence: true, uniqueness: true, length: { maximum: 128 }
  validates :name, presence: true, length: { maximum: 120 }
  validates :platform, :browser, length: { maximum: 120 }
  validates :user_agent, length: { maximum: 1024 }

  # Runs inside save's transaction, including scope repairs during subscription.
  after_update :disable_reassigned_subscriptions,
    if: -> { saved_change_to_location_id? || saved_change_to_user_id? }

  scope :active, -> { where(active: true) }
  scope :recent, -> { order(last_seen_at: :desc, updated_at: :desc) }

  def push_enabled?
    admin_push_subscriptions.active.exists?
  end

  def mark_seen!
    update_column(:last_seen_at, Time.current)
  end
  private

  def disable_reassigned_subscriptions
    admin_push_subscriptions.update_all(active: false, updated_at: Time.current)
  end
end
