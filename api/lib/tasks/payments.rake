# frozen_string_literal: true

namespace :payments do
  desc "Verify Stripe account and provision its default online profile (dry run; APPLY=true to write)"
  task provision_stripe: :environment do
    Payments::ProvisionStripe.call(apply: ENV["APPLY"] == "true")
  rescue Payments::Configuration::UnsafeConfiguration
    abort "Stripe provisioning refused: unsafe configuration. Verify environment, credential mode, account and existing profiles."
  rescue Stripe::StripeError
    # Provider messages can contain request/credential details. Keep task output safe.
    abort "Stripe account verification failed; no provisioning changes were made. Check the slot and account-read permission."
  end
end
