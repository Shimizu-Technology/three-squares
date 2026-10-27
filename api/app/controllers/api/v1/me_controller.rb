class Api::V1::MeController < ApplicationController
  include Authenticatable

  def show
    render json: {
      id: current_user.id,
      clerk_id: current_user.clerk_id,
      email: current_user.email,
      name: current_user.name,
      phone: current_user.phone,
      role: current_user.role,
      admin: current_user.admin?,
      assigned_location_id: current_user.assigned_location_id,
      assigned_location_name: current_user.assigned_location&.name,
      location_scoped: current_user.location_scoped?,
      capabilities: staff_access_policy.capabilities,
      operational_scope: staff_access_policy.operational_scope,
      authorized_locations: staff_access_policy.location_choices
    }
  end
end
