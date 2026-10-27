module Api
  module V1
    class LocationsController < ApplicationController
      def index
        locations = Location.active.by_name

        render json: {
          locations: locations.map do |location|
            {
              id: location.id,
              name: location.name,
              slug: location.slug,
              address: location.address,
              phone: location.phone,
              hours_json: location.normalized_hours,
              accepting_orders_now: location.accepting_orders_now?
            }
          end
        }
      end
    end
  end
end

