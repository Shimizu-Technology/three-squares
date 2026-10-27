# Public ordering intent is separate from provider connectivity and staff sales.
class OnlineOrderingAvailability
  DEFAULT_MESSAGE = "Online ordering is temporarily paused. You can still browse the menu. Please check back soon.".freeze

  def self.message(settings = SiteSetting.instance)
    settings.online_ordering_pause_message.presence || DEFAULT_MESSAGE
  end

  def self.validate!
    settings = SiteSetting.instance
    raise Payments::FulfillmentError, message(settings) if settings.online_ordering_paused?
  end
end
