# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

# Read more: https://github.com/cyu/rack-cors

# Support multiple origins via comma-separated ALLOWED_ORIGINS env var.
# Falls back to FRONTEND_URL for backward compatibility, then localhost for dev.
#
# Examples:
#   ALLOWED_ORIGINS=https://three-squares.com,https://www.three-squares.com,https://three-squares.netlify.app
#   FRONTEND_URL=https://three-squares.netlify.app  (legacy single-origin)
#
allowed_origins = if ENV["ALLOWED_ORIGINS"].present?
                    ENV["ALLOWED_ORIGINS"].split(",").map(&:strip).reject(&:blank?)
elsif ENV["FRONTEND_URL"].present?
                    [ ENV["FRONTEND_URL"].strip ]
else
                    [ "http://localhost:5173", "http://localhost:5174", "http://localhost:4173" ]
end

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins *allowed_origins

    resource "*",
      headers: :any,
      methods: [ :get, :post, :put, :patch, :delete, :options, :head ],
      credentials: true
  end
end
