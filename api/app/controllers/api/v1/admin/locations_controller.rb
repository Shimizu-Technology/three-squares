module Api
  module V1
    module Admin
      class LocationsController < BaseController
        before_action :set_location, only: [ :show, :update, :destroy, :generate_qr ]

        def index
          render_success(staff_access_policy.authorized_locations.by_name.map { |location| serialize_location(location) })
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
          if !current_user.owner? && (params.require(:location).keys - %w[hours_json active]).any?
            return render_error("Managers can edit hours and active/temporarily-closed state only", status: :forbidden)
          end
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

        def generate_qr
          begin
            service = QrCodeService.new(@location, base_url: params[:base_url])
            svg = service.to_svg
          rescue ArgumentError => error
            return render_error(error.message)
          end

          if @location.update(qr_code_url: service.menu_url)
            render_success({ menu_url: service.menu_url, svg: svg })
          else
            render_error("Failed to save the location menu URL", errors: @location.errors.full_messages)
          end
        end

        private

        def set_location
          @location = staff_access_policy.authorized_locations.find_by(id: params[:id])
          render_not_found("Location not found") unless @location
        end

        def location_params
          params.require(:location).permit(:name, :slug, :address, :phone, :active, :admin_email, hours_json: {}, admin_sms_phones: [])
        end

        def serialize_location(location)
          data = {
            id: location.id,
            name: location.name,
            slug: location.slug,
            address: location.address,
            phone: location.phone,
            active: location.active,
            hours_json: location.normalized_hours,
            qr_code_url: location.qr_code_url
          }
          data.merge!(admin_sms_phones: location.admin_sms_phones, admin_email: location.admin_email) if current_user.owner?
          data
        end
      end
    end
  end
end

