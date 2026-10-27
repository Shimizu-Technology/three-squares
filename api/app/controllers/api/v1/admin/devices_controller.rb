# frozen_string_literal: true

module Api
  module V1
    module Admin
      class DevicesController < ApplicationController
        include Authenticatable

        before_action :authenticate_request
        before_action :require_admin!
        before_action :require_device_uuid!, only: [ :current, :update_current, :subscribe_current, :unsubscribe_current ]
        before_action :set_device, only: [ :update ]

        rescue_from ActiveRecord::RecordInvalid do |error|
          render json: { error: error.record.errors.full_messages.join(", ") }, status: :unprocessable_entity
        end

        rescue_from ActiveRecord::RecordNotUnique do
          render json: { error: "This device or push endpoint is already registered. Refresh and try again." }, status: :unprocessable_entity
        end

        # GET /api/v1/admin/devices
        def index
          devices = scoped_devices.includes(:location, :user, :admin_push_subscriptions).recent

          render json: {
            devices: devices.map { |device| device_json(device) },
            push: push_json
          }
        end

        # GET /api/v1/admin/devices/current
        def current
          device = AdminDevice.includes(:location, :user, :admin_push_subscriptions).find_by(device_uuid: admin_device_uuid)
          return render json: { error: "Device not found" }, status: :not_found if device && !accessible_current_device?(device)

          render json: {
            device: device ? device_json(device) : unregistered_device_json,
            push: push_json
          }
        end

        # PUT /api/v1/admin/devices/current
        def update_current
          device = AdminDevice.find_or_initialize_by(device_uuid: admin_device_uuid)
          return render json: { error: "Device not found" }, status: :not_found unless accessible_current_device?(device)

          assign_device_attributes(device, current_device_params)
          device.user = current_user
          device.active = true
          device.last_seen_at = Time.current

          if device.save
            render json: {
              device: device_json(device),
              push: push_json,
              message: "Device saved successfully"
            }
          else
            render json: { error: device.errors.full_messages.join(", ") }, status: :unprocessable_entity
          end
        end

        # PATCH /api/v1/admin/devices/:id
        def update
          assign_device_attributes(@device, managed_device_params)

          if @device.save
            render json: {
              device: device_json(@device),
              message: "Device updated successfully"
            }
          else
            render json: { error: @device.errors.full_messages.join(", ") }, status: :unprocessable_entity
          end
        end

        # POST /api/v1/admin/devices/current/push_subscription
        def subscribe_current
          device = AdminDevice.find_by(device_uuid: admin_device_uuid)
          return render json: { error: "Register this device before enabling push notifications" }, status: :unprocessable_entity unless device

          return render json: { error: "Device not found" }, status: :not_found unless accessible_current_device?(device)

          # Enforce again here: an old/blank registration must never broaden a scoped user's alerts.
          device.update!(location_id: current_user.assigned_location_id) if current_user.location_scoped?
          if device.location_id.blank? || !device.active?
            return render json: { error: "Assign an active device to a location before enabling push notifications" }, status: :unprocessable_entity
          end

          unless WebPushConfig.configured?
            return render json: { error: "Web push is not configured" }, status: :unprocessable_entity
          end

          attrs = push_subscription_params
          if attrs[:endpoint].blank? || attrs[:keys].blank? || attrs[:keys][:p256dh].blank? || attrs[:keys][:auth].blank?
            return render json: { error: "Push subscription keys are incomplete" }, status: :unprocessable_entity
          end

          subscription = device.admin_push_subscriptions.find_or_initialize_by(endpoint: attrs[:endpoint])

          subscription.assign_attributes(
            p256dh_key: attrs[:keys][:p256dh],
            auth_key: attrs[:keys][:auth],
            active: true
          )

          if subscription.save
            render json: {
              subscription: {
                id: subscription.id,
                endpoint: subscription.endpoint,
                active: subscription.active
              },
              message: "Push notifications enabled"
            }
          else
            render json: {
              error: subscription.errors.full_messages.join(", "),
              code: subscription.errors.of_kind?(:endpoint, :taken) ? "push_endpoint_conflict" : "invalid_subscription"
            }, status: :unprocessable_entity
          end
        end

        # DELETE /api/v1/admin/devices/current/push_subscription
        def unsubscribe_current
          device = AdminDevice.find_by(device_uuid: admin_device_uuid)
          return render json: { error: "Device not found" }, status: :not_found if device && !accessible_current_device?(device)
          return render json: { message: "Push notifications disabled" } unless device

          subscriptions = device.admin_push_subscriptions
          subscriptions = subscriptions.where(endpoint: params[:endpoint].to_s) if params[:endpoint].present?
          subscriptions.update_all(active: false, updated_at: Time.current)

          render json: { message: "Push notifications disabled" }
        end

        private

        def scoped_devices
          return AdminDevice.none unless current_user

          staff_scope(AdminDevice.all)
        end

        def set_device
          @device = scoped_devices.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Device not found" }, status: :not_found
        end

        def require_device_uuid!
          return if admin_device_uuid.present? && admin_device_uuid.length <= 128

          render json: { error: "Missing or invalid X-Admin-Device-Id header" }, status: :unprocessable_entity
        end

        def admin_device_uuid
          request.headers["X-Admin-Device-Id"].to_s.strip
        end

        def current_device_params
          params.require(:device).permit(:name, :location_id, :platform, :browser, :user_agent)
        end

        def managed_device_params
          params.require(:device).permit(:name, :location_id, :active)
        end

        def push_subscription_params
          params.require(:subscription).permit(:endpoint, keys: [ :p256dh, :auth ])
        end

        def assign_device_attributes(device, attrs)
          if attrs[:location_id].present? && !staff_access_policy.location_allowed?(attrs[:location_id])
            device.errors.add(:location_id, "is outside your authorized locations")
            raise ActiveRecord::RecordInvalid, device
          end
          location_id = if current_user.location_scoped?
            current_user.assigned_location_id
          elsif attrs.key?(:location_id)
            attrs[:location_id].presence
          else
            device.location_id
          end
          if location_id.present? && (!location_id.to_s.match?(/\A[0-9]+\z/) || !Location.exists?(id: location_id))
            device.errors.add(:location_id, "must identify an existing location")
            raise ActiveRecord::RecordInvalid, device
          end

          device.assign_attributes(attrs.slice(:name, :platform, :browser, :user_agent, :active))
          device.name = default_device_name if device.name.blank?
          device.location_id = location_id
        end

        def accessible_current_device?(device)
          device.new_record? || device.user_id == current_user.id
        end

        def default_device_name
          "Admin Device #{admin_device_uuid.first(8)}"
        end

        def push_json
          {
            configured: WebPushConfig.configured?,
            public_key: WebPushConfig.configured? ? WebPushConfig.public_key : nil,
            subject: WebPushConfig.configured? ? WebPushConfig.subject : nil
          }
        end

        def unregistered_device_json
          {
            id: nil,
            device_uuid: admin_device_uuid,
            name: default_device_name,
            location_id: current_user&.assigned_location_id,
            location_name: current_user&.assigned_location&.name,
            location_locked: current_user.location_scoped?,
            active: true,
            push_enabled: false,
            active_subscription_count: 0
          }
        end

        def device_json(device)
          {
            id: device.id,
            device_uuid: device.device_uuid,
            name: device.name,
            location_id: device.location_id,
            location_name: device.location&.name,
            user_id: device.user_id,
            user_email: device.user&.email,
            platform: device.platform,
            browser: device.browser,
            location_locked: current_user.location_scoped?,
            active: device.active,
            last_seen_at: device.last_seen_at&.iso8601,
            push_enabled: device.push_enabled?,
            active_subscription_count: device.admin_push_subscriptions.active.count
          }
        end
      end
    end
  end
end
