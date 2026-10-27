module StaffAuthorization
  extend ActiveSupport::Concern

  included do
    before_action :authorize_staff_route!
  end

  private

  def staff_access_policy
    @staff_access_policy ||= StaffAccessPolicy.new(current_user)
  end

  def staff_scope(relation, location_column: :location_id)
    staff_access_policy.scope_relation(relation, location_column: location_column)
  end

  def require_staff_capability!(capability)
    return true if staff_access_policy.allowed?(capability)

    message = current_user&.staff? && staff_access_policy.operational_scope == :none ?
      "Ask a manager to assign your location" : "Your role does not allow this action"
    render json: { error: message, code: "staff_access_denied" }, status: :forbidden
    false
  end

  def authorize_staff_route!(explicit: false)
    return true if @staff_route_authorized
    return true unless explicit || StaffRouteCapabilities.protected?(controller_path, action_name)
    # Rails moves a re-declared callback to its later declaration. Several
    # direct controllers retain a legacy authenticate_request declaration, so
    # the guard must resolve authentication before making a policy decision.
    authenticate_request unless current_user
    return false if performed?
    capability = StaffRouteCapabilities.capability_for(controller_path, action_name)
    unless capability
      render json: { error: "This administrative action has no access policy" }, status: :forbidden
      return false
    end
    return false unless require_staff_capability!(capability)
    return false unless authorize_staff_record_scope!
    return false unless authorize_shared_stock_write!

    @staff_route_authorized = true
    true
  end

  def authorize_shared_stock_write!
    return true if staff_access_policy.allowed?("stock.manage")

    if controller_path == "api/v1/admin/imports" && action_name == "create"
      # The legacy Shopify importer writes shared inventory as part of products
      # and optional inventory files. The simple menu CSV remains catalog.import.
      return require_staff_capability!("stock.manage")
    end
    if controller_path == "api/v1/admin/products" && action_name == "duplicate"
      source = Product.find_by(id: params[:id]) || Product.find_by(slug: params[:id])
      if source && (source.product_stock_quantity.to_i != 0 || source.product_variants.where.not(stock_quantity: 0).exists?)
        return require_staff_capability!("stock.manage")
      end
    end
    if controller_path == "api/v1/admin/products" && %w[create update].include?(action_name)
      attrs = params[:product]
      record = action_name == "update" ? (Product.find_by(id: params[:id]) || Product.find_by(slug: params[:id])) : Product.new
      keys = %w[inventory_level product_stock_quantity product_low_stock_threshold track_inventory]
    elsif controller_path == "api/v1/admin/product_variants" && %w[create update destroy generate].include?(action_name)
      # Generation consumes top-level stock; create/update use variant_params'
      # non-empty alias precedence. Authorize exactly the payload written.
      attrs = action_name == "generate" ? params : (params[:product_variant].presence || params[:variant].presence)
      record = %w[update destroy].include?(action_name) ? ProductVariant.find_by(id: params[:id]) : ProductVariant.new(stock_quantity: 0)
      return require_staff_capability!("stock.manage") if action_name == "destroy" && record&.stock_quantity.to_i != 0
      keys = %w[stock_quantity low_stock_threshold]
    else
      return true
    end
    return true unless record && attrs

    changed = keys.any? do |key|
      attrs.key?(key) && record.class.type_for_attribute(key).cast(attrs[key]) != record.public_send(key)
    end
    changed ? require_staff_capability!("stock.manage") : true
  end

  def authorize_staff_record_scope!
    if controller_path == "api/v1/admin/payment_terminals" && params[:id].present?
      return staff_record_missing! unless staff_scope(PaymentTerminal.all).exists?(id: params[:id])
    elsif controller_path == "api/v1/admin/pos_orders" && action_name != "create"
      return staff_record_missing! unless staff_scope(Order.all).exists?(id: params[:id])
    elsif controller_path == "api/v1/admin/pos_orders" && action_name == "create"
      requested = params.dig(:order, :location_id)
      # Scoped POS controllers select the assignment when no location was sent;
      # a forged explicit location must be rejected before any sale/replay.
      if requested.present? && !staff_access_policy.location_allowed?(requested)
        return staff_record_missing!
      end
    end
    true
  end

  def staff_record_missing!
    render json: { error: "Record not found" }, status: :not_found
    false
  end
end
