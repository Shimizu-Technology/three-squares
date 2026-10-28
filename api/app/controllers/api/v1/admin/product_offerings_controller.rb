module Api
  module V1
    module Admin
      class ProductOfferingsController < BaseController
        def show
          product = find_product!
          rows = product.product_locations.to_a
          render_success({ product_id: product.id, locations: Location.by_name.map do |location|
            row = rows.find { |entry| entry.location_id == location.id }
            { id: location.id, name: location.name, slug: location.slug,
              offered: rows.empty? || row&.offered? == true,
              available: rows.empty? || row&.available? == true,
              can_manage_availability: staff_access_policy.allowed?("availability.manage", location_id: location.id) }
          end })
        end

        def update
          attrs = params.require(:offering)
          unless attrs.is_a?(ActionController::Parameters) && (attrs.keys - %w[location_id offered]).empty? &&
              attrs[:location_id].to_s.match?(/\A[1-9]\d*\z/) && [true, false].include?(attrs[:offered])
            return render_error("Supply only a location and a boolean offered value", status: :unprocessable_entity)
          end
          location = Location.find(attrs[:location_id])
          row = LocationOffering.set!(product: find_product!, location: location, offered: attrs[:offered])
          render_success({ product_id: row.product_id, location_id: row.location_id, offered: row.offered, available: row.available })
        end
        private

        def find_product!
          Product.find_by(id: params[:product_id]) || Product.find_by!(slug: params[:product_id])
        end
      end
    end
  end
end
