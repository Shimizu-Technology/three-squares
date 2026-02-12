module Api
  module V1
    module Admin
      class LocationsController < BaseController
        before_action :set_location, only: [ :show, :update, :destroy ]

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

        private

        def set_location
          @location = Location.find_by(id: params[:id])
          render_not_found("Location not found") unless @location
        end

        def location_params
          params.require(:location).permit(:name, :slug, :address, :phone, :active, hours_json: {})
        end

        def serialize_location(location)
          {
            id: location.id,
            name: location.name,
            slug: location.slug,
            address: location.address,
            phone: location.phone,
            active: location.active,
            hours_json: location.hours_json
          }
        end
      end
    end
  end
end

