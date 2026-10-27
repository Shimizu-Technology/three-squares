# frozen_string_literal: true

# Database sequence allocation is independent of merchant and operation type. Never recycle IDs.
class PaymentOperationNumber < ApplicationRecord
end
