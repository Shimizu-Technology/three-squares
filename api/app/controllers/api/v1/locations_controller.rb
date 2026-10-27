module Api
  module V1
    class LocationsController < ApplicationController
      def index
        render json: { locations: Location.active.by_name.map { |location| serialize_location(location) } }
      end

      def show
        location = Location.active.find_by(slug: params[:id])
        return render json: { error: "Location not found" }, status: :not_found unless location

        render json: serialize_location(location)
      end

      private

      def serialize_location(location)
        {
          id: location.id, name: location.name, slug: location.slug,
          address: location.address, phone: location.phone,
          hours_json: location.normalized_hours,
          accepting_orders_now: location.accepting_orders_now?
        }
      end
    end
  end
end
