# Canonical capability registry for both server guards and /me disclosure.
# A capability grants an action category; callers must also scope records with
# scope_relation and enforce resource ownership (including device ownership).
class StaffAccessPolicy
  STAFF_CAPABILITIES = %w[
    orders.read orders.counts orders.status pos.sell payments.collect
    availability.manage devices.self
  ].freeze
  MANAGER_OPERATIONAL_CAPABILITIES = (STAFF_CAPABILITIES + %w[
    orders.manage orders.notify orders.export payments.refund analytics.read
    devices.manage locations.read locations.update locations.qr
  ]).freeze
  MANAGER_GLOBAL_CAPABILITIES = %w[
    catalog.manage catalog.import stock.read seasonal.manage catering.manage
  ].freeze
  MANAGER_ALL_LOCATIONS_CAPABILITIES = %w[
    stock.manage homepage.manage payments.terminals.manage payments.reconcile catalog.offerings.manage
  ].freeze
  OWNER_CAPABILITIES = %w[
    users.manage settings.manage payment_settings.manage ordering.manage locations.manage
    payments.simulate payments.terminals.discover
  ].freeze
  CAPABILITIES = ([ "account.self" ] + MANAGER_OPERATIONAL_CAPABILITIES +
    MANAGER_GLOBAL_CAPABILITIES + MANAGER_ALL_LOCATIONS_CAPABILITIES + OWNER_CAPABILITIES).freeze

  attr_reader :user

  def initialize(user)
    @user = user
  end

  # Unknown/unclassified admin actions are owner-only. Manager global actions
  # intentionally do not depend on an operational assignment or selected location.
  # Individual order/POS amounts belong to orders.read/pos.sell; aggregate revenue
  # requires analytics.read, independently of orders.counts.
  def allowed?(capability, location_id: nil, device: nil)
    capability = capability.to_s
    granted = if user&.owner?
      true
    elsif capability == "account.self"
      user.present? && User::ROLES.include?(user.role)
    elsif user&.manager? && MANAGER_GLOBAL_CAPABILITIES.include?(capability)
      true
    elsif user&.manager? && MANAGER_ALL_LOCATIONS_CAPABILITIES.include?(capability)
      operational_scope == :all
    elsif operational_capabilities.include?(capability)
      operational_scope != :none
    else
      false
    end
    return false unless granted
    if MANAGER_OPERATIONAL_CAPABILITIES.include?(capability) && !location_id.nil?
      return false unless location_allowed?(location_id)
    end
    return owns_device?(device) if capability == "devices.self" && device

    true
  end

  # Known names only; unknown names still use the owner-only fallback above.
  def capabilities
    CAPABILITIES.select { |capability| allowed?(capability) }
  end

  # :all includes locationless operations; :specific excludes them; :none denies
  # every operational record. Device headers never participate in this decision.
  def operational_scope
    return :all if user&.owner?
    return :all if user&.manager? && user.assigned_location_id.nil?
    return :specific if (user&.manager? || user&.staff?) && valid_assignment?

    :none
  end

  def authorized_locations
    case operational_scope
    when :all then Location.all
    when :specific then Location.where(id: user.assigned_location_id)
    else Location.none
    end
  end

  def authorized_location_ids
    authorized_locations.order(:id).pluck(:id)
  end

  # Safe /me payload: never serialize operational notification contacts.
  def location_choices
    authorized_locations.order(:name, :id).pluck(:id, :name, :slug).map do |id, name, slug|
      { id: id, name: name, slug: slug }
    end
  end

  def location_allowed?(location_or_id)
    id = location_or_id.is_a?(Location) ? location_or_id.id : location_or_id
    return false unless id.to_s.match?(/\A[1-9]\d*\z/)

    authorized_locations.exists?(id: id)
  end

  # Pass an existing relation, e.g. Order.all or AdminDevice.active. The column
  # name is developer-owned, never request input. All-scope retains locationless
  # rows; specific/none scopes fail closed for nil/invalid assignments.
  def scope_relation(relation, location_column: :location_id)
    case operational_scope
    when :all then relation
    when :specific then relation.where(location_column => user.assigned_location_id)
    else relation.none
    end
  end

  def owns_device?(device)
    user&.persisted? == true && device.user_id == user.id && location_allowed?(device.location_id)
  end

  private

  def operational_capabilities
    return MANAGER_OPERATIONAL_CAPABILITIES if user&.manager?
    return STAFF_CAPABILITIES if user&.staff?

    []
  end

  def valid_assignment?
    user.assigned_location_id.present? && Location.exists?(id: user.assigned_location_id)
  end
end
