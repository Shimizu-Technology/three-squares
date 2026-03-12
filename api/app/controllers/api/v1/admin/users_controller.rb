# frozen_string_literal: true

module Api
  module V1
    module Admin
      class UsersController < ApplicationController
        include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!
        before_action :set_user, only: [ :show, :update ]

        # GET /api/v1/admin/users
        def index
          users = User.order(created_at: :desc)

          # Search by email or name
          if params[:search].present?
            search_term = "%#{params[:search].downcase}%"
            users = users.where("LOWER(email) LIKE ? OR LOWER(name) LIKE ?",
                               search_term, search_term)
          end

          # Filter by role
          if params[:role].present? && params[:role] != "all"
            users = users.where(role: params[:role])
          end

          render json: {
            users: users.map { |user| user_json(user) },
            stats: {
              total: User.count,
              admins: User.admins.count,
              customers: User.customers.count
            }
          }
        end

        # GET /api/v1/admin/users/:id
        def show
          render json: { user: user_json(@user) }
        end

        # PATCH /api/v1/admin/users/:id
        def update
          # Prevent removing your own admin access
          if @user.id == current_user.id && params[:user][:role] == "customer"
            return render json: { error: "You cannot remove your own admin access" }, status: :unprocessable_entity
          end

          if @user.update(user_params)
            render json: {
              user: user_json(@user),
              message: "User updated successfully"
            }
          else
            render json: { error: @user.errors.full_messages.join(", ") }, status: :unprocessable_entity
          end
        end

        private

        def set_user
          @user = User.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "User not found" }, status: :not_found
        end

        def user_params
          params.require(:user).permit(:role, :assigned_location_id)
        end

        def user_json(user)
          {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            role: user.role,
            is_admin: user.admin?,
            clerk_id: user.clerk_id,
            assigned_location_id: user.assigned_location_id,
            assigned_location_name: user.assigned_location&.name,
            location_scoped: user.location_scoped?,
            created_at: user.created_at.iso8601,
            updated_at: user.updated_at.iso8601
          }
        end
      end
    end
  end
end
