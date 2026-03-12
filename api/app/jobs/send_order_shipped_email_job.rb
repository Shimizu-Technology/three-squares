# frozen_string_literal: true

# DEPRECATED: This job was replaced by SendOrderStatusEmailJob.
# Stub exists to drain any jobs enqueued before deployment.
# Safe to remove after one full deploy cycle (all queued jobs processed).
class SendOrderShippedEmailJob < ApplicationJob
  queue_as :default
  discard_on StandardError

  def perform(*)
    Rails.logger.info "⏭️ SendOrderShippedEmailJob is deprecated — discarding. Use SendOrderStatusEmailJob."
  end
end
