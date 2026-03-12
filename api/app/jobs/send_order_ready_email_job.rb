# frozen_string_literal: true

# DEPRECATED: This job was replaced by SendOrderStatusEmailJob.
# Stub exists to drain any jobs enqueued before deployment.
# Safe to remove after one full deploy cycle (all queued jobs processed).
class SendOrderReadyEmailJob < ApplicationJob
  queue_as :default
  discard_on StandardError

  def perform(*)
    Rails.logger.info "⏭️ SendOrderReadyEmailJob is deprecated — discarding. Use SendOrderStatusEmailJob."
  end
end
