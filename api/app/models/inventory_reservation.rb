# frozen_string_literal: true

class InventoryReservation < ApplicationRecord
  belongs_to :order
end
