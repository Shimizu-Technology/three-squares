# frozen_string_literal: true

module Authenticatable
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_request
    attr_reader :current_user
  end

  private

  def authenticate_request
    token = extract_token
    return render_unauthorized unless token

    begin
      payload, clerk_client = verify_token_with_clerk(token)

      clerk_id = payload["sub"]

      unless clerk_id
        Rails.logger.error("Missing clerk_id (sub) in JWT payload")
        return render_unauthorized("Invalid token payload")
      end

      Rails.logger.info("Fetching user info from Clerk for ID: #{clerk_id}")

      # Fetch user info from Clerk API
      clerk_user = clerk_client.users.find(clerk_id)

      # Extract primary email
      primary_email_obj = clerk_user["email_addresses"].find { |e| e["id"] == clerk_user["primary_email_address_id"] }
      email = primary_email_obj ? primary_email_obj["email_address"] : nil

      Rails.logger.info("Clerk user fetched - Email: #{email}")

      unless email
        Rails.logger.error("No email found for Clerk user #{clerk_id}")
        return render_unauthorized("User has no email address")
      end

      @current_user = find_or_create_user(clerk_id, email)
      Rails.logger.info("User authenticated: #{@current_user.email} (Admin: #{@current_user.admin?})")
    rescue StandardError => e
      Rails.logger.error("Authentication error: #{e.class} - #{e.message}")
      Rails.logger.error(e.backtrace.first(5).join("\n"))
      render_unauthorized("Authentication failed")
    end
  end

  def verify_token_with_clerk(token)
    clerk_client = Clerk::SDK.new
    payload = clerk_client.verify_token(token)

    unless payload.is_a?(Hash)
      raise StandardError, "Invalid token payload from Clerk verification"
    end

    [ payload.with_indifferent_access, clerk_client ]
  end

  DEFAULT_ADMIN_EMAILS = %w[
    shimizutechnology@gmail.com
    jerry.shimizutechnology@gmail.com
  ].freeze

  ADMIN_EMAILS = ENV.fetch("ADMIN_EMAILS", DEFAULT_ADMIN_EMAILS.join(","))
                    .split(",")
                    .map(&:strip)
                    .reject(&:blank?)
                    .freeze

  def extract_token
    auth_header = request.headers["Authorization"]
    return unless auth_header&.start_with?("Bearer ")

    auth_header.split(" ").last
  end

  def find_or_create_user(clerk_id, email)
    normalized_email = email.downcase
    user = User.find_or_create_by!(clerk_id: clerk_id) do |u|
      u.email = email
      u.role = ADMIN_EMAILS.include?(normalized_email) ? "admin" : "customer"
    end

    # Only auto-promote customers to admin, never override staff/manager roles.
    # Use update! so the in-memory object stays consistent (update_columns skips model callbacks
    # and leaves user.role stale in memory, which would cause require_admin! to reject valid admins).
    if user.customer? && ADMIN_EMAILS.include?(normalized_email)
      user.update!(role: "admin")
    end

    user.update_columns(email: email) if user.email != email

    user
  end

  def render_unauthorized(message = "Unauthorized")
    render json: { error: message }, status: :unauthorized
  end

  # Helper to check if user is admin
  def require_admin!
    render json: { error: "Forbidden" }, status: :forbidden unless current_user&.admin?
  end

  def require_manager!
    render json: { error: "Forbidden" }, status: :forbidden unless current_user&.manager_or_above?
  end

  def require_staff!
    render json: { error: "Forbidden" }, status: :forbidden unless current_user&.staff_or_above?
  end

  # Helper to make authentication optional
  def authenticate_optional
    token = extract_token
    return unless token

    begin
      payload, clerk_client = verify_token_with_clerk(token)
      clerk_id = payload["sub"]

      return unless clerk_id

      clerk_user = clerk_client.users.find(clerk_id)

      primary_email_obj = clerk_user["email_addresses"].find { |e| e["id"] == clerk_user["primary_email_address_id"] }
      email = primary_email_obj ? primary_email_obj["email_address"] : nil

      @current_user = find_or_create_user(clerk_id, email) if email
    rescue StandardError => e
      Rails.logger.warn("Optional auth failed: #{e.class} - #{e.message}")
      nil
    end
  end
end
