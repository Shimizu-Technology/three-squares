# frozen_string_literal: true

class Api::V1::MeController < ApplicationController
  include Authenticatable

  def show
    render json: {
      id: current_user.id,
      clerk_id: current_user.clerk_id,
      email: current_user.email,
      name: current_user.name,
      role: current_user.role,
      admin: current_user.admin?,
      assigned_location_id: current_user.assigned_location_id,
      assigned_location_name: current_user.assigned_location&.name,
      location_scoped: current_user.location_scoped?,
      permissions: {
        can_manage_settings: current_user.owner?,
        can_manage_products: current_user.owner?,
        can_manage_users: current_user.owner?,
        can_view_analytics: current_user.manager_or_above?,
        can_manage_inventory: current_user.manager_or_above?,
        can_refund: current_user.manager_or_above?,
        can_export: current_user.manager_or_above?,
        can_fulfill_orders: current_user.staff_or_above?,
        can_use_pos: current_user.staff_or_above?
      }
    }
  end
end
