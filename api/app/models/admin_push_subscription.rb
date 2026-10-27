class AdminPushSubscription < ApplicationRecord
  belongs_to :admin_device

  validates :endpoint, presence: true, uniqueness: true
  validates :p256dh_key, presence: true
  validates :auth_key, presence: true

  scope :active, -> { where(active: true) }
end
