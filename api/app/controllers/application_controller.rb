class ApplicationController < ActionController::API
  # --- Production error handling (HAF-16) ---
  # In production, catch unhandled errors and return clean JSON
  # instead of leaking stack traces and file paths.
  unless Rails.env.development? || Rails.env.test?
    rescue_from StandardError, with: :render_internal_error
  end

  rescue_from ActiveRecord::RecordNotFound do |e|
    render json: { error: "Record not found" }, status: :not_found
  end

  rescue_from ActionController::ParameterMissing do |e|
    render json: { error: e.message }, status: :unprocessable_entity
  end

  # Defense for writers that bypass Order's number-assignment lock. Let the
  # transaction unwind before responding; never retry a PostgreSQL-aborted
  # payment transaction or turn an unrelated unique violation into a conflict.
  rescue_from ActiveRecord::RecordNotUnique do |error|
    constraint = error.cause&.result&.error_field(PG::Result::PG_DIAG_CONSTRAINT_NAME) if error.cause.is_a?(PG::UniqueViolation)
    if constraint == "index_orders_on_order_number"
      render json: { error: "Order number is busy. Please retry your request.", outcome: "unknown" }, status: :conflict
    else
      raise error if Rails.env.development? || Rails.env.test?
      render_internal_error(error)
    end
  end

  # HAF-37: Clean JSON response for undefined API routes
  def route_not_found
    render json: { error: "Route not found" }, status: :not_found
  end

  private

  def render_internal_error(error)
    Rails.logger.error "Unhandled #{error.class}: #{error.message}"
    Rails.logger.error error.backtrace&.first(10)&.join("\n")
    render json: { error: "Internal server error" }, status: :internal_server_error
  end
end
