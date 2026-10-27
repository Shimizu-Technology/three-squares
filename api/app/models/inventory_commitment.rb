# frozen_string_literal: true

class InventoryCommitment < ApplicationRecord
  attr_readonly :order_id, :snapshot_digest
  belongs_to :order
end
