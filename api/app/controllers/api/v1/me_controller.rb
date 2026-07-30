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
      role_level: current_user.role_level,
      admin: current_user.admin?,
      manager: current_user.manager?,
      staff: current_user.staff?,
      staff_or_above: current_user.staff_or_above?,
      assigned_location_id: current_user.assigned_location_id,
      assigned_location_name: current_user.assigned_location&.name,
      location_scoped: current_user.location_scoped?
    }
  end
end
