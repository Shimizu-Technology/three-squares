# frozen_string_literal: true

module Payments
  Result = Data.define(:status, :identity_id, :raw_id, :requested_cents, :approved_cents, :captured_cents, :currency, :metadata) do
    def captured?
      status == "captured" && captured_cents == requested_cents && captured_cents.positive?
    end
  end

end
