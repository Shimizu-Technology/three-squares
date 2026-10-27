# Be sure to restart your server when you modify this file.

# Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
# Use this to limit dissemination of sensitive information.
# See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
Rails.application.config.filter_parameters += [
  :handle, :activation_code, :activationCode, :instrument_handle,
  :capability, :collection_config, :passw, :email, :secret, :token, :_key, :crypt, :salt, :certificate, :otp, :ssn, :cvv, :cvc
]

# Push endpoints and subscription keys grant delivery capability.
Rails.application.config.filter_parameters += %i[endpoint p256dh auth]
Rails.application.config.filter_parameters += %i[ValidationCode TransactionSetupID state AccountToken AcceptorID AccountID]
