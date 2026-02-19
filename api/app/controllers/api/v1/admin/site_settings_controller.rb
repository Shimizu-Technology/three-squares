# frozen_string_literal: true

module Api
  module V1
    module Admin
      class SiteSettingsController < ApplicationController
        include Authenticatable
        before_action :authenticate_request
        before_action :require_owner!

        # GET /api/v1/admin/site_settings
        def show
          settings = SiteSetting.instance
          render json: {
            payment_test_mode: settings.payment_test_mode,
            payment_processor: settings.payment_processor,
            store_name: settings.store_name,
            store_email: settings.store_email,
            store_phone: settings.store_phone,
            placeholder_image_url: settings.placeholder_image_url,
            order_notification_emails: settings.order_notification_emails,
            shipping_origin_address: settings.shipping_origin_address,
            announcement_enabled: settings.announcement_enabled,
            announcement_text: settings.announcement_text,
            announcement_style: settings.announcement_style
          }
        end

        # PUT /api/v1/admin/site_settings
        def update
          settings = SiteSetting.instance

          if settings.update(site_settings_params)
            Rails.logger.info "✅ Site settings updated by #{current_user.email}: #{settings.changes.inspect}"
            render json: {
              message: "Settings updated successfully",
              payment_test_mode: settings.payment_test_mode,
              payment_processor: settings.payment_processor,
              store_name: settings.store_name,
              store_email: settings.store_email,
              store_phone: settings.store_phone,
              placeholder_image_url: settings.placeholder_image_url,
              order_notification_emails: settings.order_notification_emails,
              shipping_origin_address: settings.shipping_origin_address,
              announcement_enabled: settings.announcement_enabled,
              announcement_text: settings.announcement_text,
              announcement_style: settings.announcement_style
            }
          else
            render json: { errors: settings.errors.full_messages }, status: :unprocessable_entity
          end
        rescue StandardError => e
          Rails.logger.error "❌ Error updating site settings: #{e.message}"
          render json: { error: "Failed to update settings" }, status: :internal_server_error
        end

        private

        def site_settings_params
          params.require(:site_setting).permit(
            :payment_test_mode,
            :payment_processor,
            :store_name,
            :store_email,
            :store_phone,
            :placeholder_image_url,
            :announcement_enabled,
            :announcement_text,
            :announcement_style,
            order_notification_emails: [],
            shipping_origin_address: [
              :company, :street1, :street2, :city, :state, :zip, :country, :phone, :email
            ]
          )
        end
      end
    end
  end
end
