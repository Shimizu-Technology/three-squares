# frozen_string_literal: true

module Payments
  module CollectionAccess
    def self.active?(session, attempt)
      return false unless session.expires_at.future? && !attempt.cancel_requested_at
      return attempt.state == 'collecting' unless attempt.collection_config['flow'] == 'worldpay_hosted_page'
      return false unless %w[collecting unknown].include?(attempt.state) && attempt.approved_cents.zero? && attempt.captured_cents.zero? &&
        !attempt.compensation_claimed_at && !attempt.provider_metadata['worldpay_collection_blocked'] && attempt.last_error != 'Payments::BindingError'
      attempt.dispatched_at.present? && attempt.dispatched_at > 10.minutes.ago
    end
  end
end
