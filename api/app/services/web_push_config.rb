module WebPushConfig
  module_function

  def configured?
    public_key.present? && private_key.present? && subject.present?
  end

  def public_key
    ENV["WEB_PUSH_VAPID_PUBLIC_KEY"].to_s
  end

  def private_key
    ENV["WEB_PUSH_VAPID_PRIVATE_KEY"].to_s
  end

  def subject
    ENV["WEB_PUSH_VAPID_SUBJECT"].to_s
  end
end
