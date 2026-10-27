class PaymentEvent < ApplicationRecord
  belongs_to :payment_identity, optional: true
  attr_readonly :payment_identity_id, :provider, :external_account_id, :environment, :external_event_id, :payload_digest, :facts
end
