class OnlineOrderingChange < ApplicationRecord
  belongs_to :actor, class_name: "User", optional: true
end
