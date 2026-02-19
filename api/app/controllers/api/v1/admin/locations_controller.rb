module Api
  module V1
    module Admin
      class LocationsController < BaseController
        before_action :require_owner!
        before_action :set_location, only: [ :show, :update, :destroy, :toggle_active ]

        def index
          render_success(Location.by_name.map { |location| serialize_location(location) })
        end

        def show
          render_success(serialize_location(@location))
        end

        def create
          location = Location.new(location_params)
          if location.save
            render_created(serialize_location(location))
          else
            render_error("Failed to create location", errors: location.errors.full_messages)
          end
        end

        def update
          if @location.update(location_params)
            render_success(serialize_location(@location), message: "Location updated successfully")
          else
            render_error("Failed to update location", errors: @location.errors.full_messages)
          end
        end

        def destroy
          if @location.destroy
            render_success(nil, message: "Location deleted successfully")
          else
            render_error("Failed to delete location", errors: @location.errors.full_messages)
          end
        end

        def toggle_active
          if @location.active?
            @location.deactivate!
          else
            @location.activate!
          end
          render_success(serialize_location(@location), message: "Location #{@location.active? ? 'activated' : 'deactivated'} successfully")
        end

        def auto_deactivate_expired
          count = Location.where(auto_deactivate: true, active: true).where("ends_at < ?", Time.current).count
          Location.auto_deactivate_expired!
          render_success({ deactivated_count: count }, message: "#{count} location(s) deactivated")
        end

        private

        def set_location
          @location = Location.find_by(id: params[:id])
          render_not_found("Location not found") unless @location
        end

        def location_params
          params.require(:location).permit(
            :name, :slug, :address, :phone, :active, :admin_email,
            :location_type, :starts_at, :ends_at, :auto_deactivate,
            :description, :qr_code_url, :menu_collection_id,
            hours_json: {}, admin_sms_phones: []
          )
        end

        def serialize_location(location)
          {
            id: location.id,
            name: location.name,
            slug: location.slug,
            address: location.address,
            phone: location.phone,
            active: location.active,
            hours_json: location.hours_json,
            admin_sms_phones: location.admin_sms_phones,
            admin_email: location.admin_email,
            location_type: location.location_type,
            starts_at: location.starts_at,
            ends_at: location.ends_at,
            auto_deactivate: location.auto_deactivate,
            description: location.description,
            qr_code_url: location.qr_code_url,
            menu_collection_id: location.menu_collection_id,
            menu_collection: location.menu_collection.present? ? {
              id: location.menu_collection.id,
              name: location.menu_collection.name,
              slug: location.menu_collection.slug
            } : nil
          }
        end
      end
    end
  end
end
