module Api
  module V1
    class LocationsController < ApplicationController
      def index
        locations = Location.customer_visible.by_name

        render json: {
          locations: locations.map do |location|
            serialize_public_location(location)
          end
        }
      end

      def show
        location = Location.customer_visible.find_by(slug: params[:id]) ||
                   Location.customer_visible.find_by(id: params[:id])

        if location
          render json: serialize_public_location(location)
        else
          render json: { error: "Location not found" }, status: :not_found
        end
      end

      private

      def serialize_public_location(location)
        data = {
          id: location.id,
          name: location.name,
          slug: location.slug,
          address: location.address,
          phone: location.phone,
          hours_json: location.hours_json,
          location_type: location.location_type,
          starts_at: location.starts_at,
          ends_at: location.ends_at,
          description: location.description
        }

        if location.menu_collection.present?
          data[:menu_collection] = {
            id: location.menu_collection.id,
            name: location.menu_collection.name,
            slug: location.menu_collection.slug
          }
        end

        data
      end
    end
  end
end
