# frozen_string_literal: true

module Api
  module V1
    module Admin
      class SettingsController < ApplicationController
        include Authenticatable
        before_action :require_admin!

        # GET /api/v1/admin/settings
        def show
          settings = SiteSetting.instance

          render json: {
            settings: settings_json(settings)
          }
        end

        # PUT /api/v1/admin/settings
        def update
          settings = SiteSetting.instance

          if settings.update(settings_params)
            render json: {
              success: true,
              message: "Settings updated successfully",
              settings: settings_json(settings)
            }
          else
            render json: {
              success: false,
              errors: settings.errors.full_messages
            }, status: :unprocessable_entity
          end
        end

        private

        def settings_json(settings)
          {
            payment_test_mode: settings.payment_test_mode,
            payment_processor: settings.payment_processor,
            # Per-order-type email settings
            send_retail_emails: settings.send_retail_emails,
            send_wholesale_emails: settings.send_wholesale_emails,
            # Legacy field (kept for backwards compatibility)
            send_customer_emails: settings.send_customer_emails,
            store_name: settings.store_name,
            store_email: settings.store_email,
            store_phone: settings.store_phone,
            placeholder_image_url: settings.placeholder_image_url,
            order_notification_emails: settings.order_notification_emails,
            shipping_origin_address: settings.shipping_origin_address,
            # Notification channel toggles
            enable_order_emails: settings.enable_order_emails,
            enable_order_sms: settings.enable_order_sms,
            # SMS configuration
            send_sms_notifications: settings.send_sms_notifications,
            sms_order_updates: settings.sms_order_updates,
            admin_sms_phones: settings.admin_sms_phones,
            sms_configured: ENV["CLICKSEND_USERNAME"].present? && ENV["CLICKSEND_API_KEY"].present?,
            email_configured: ENV["RESEND_API_KEY"].present?
          }
        end

        def settings_params
          params.require(:settings).permit(
            :payment_test_mode,
            :payment_processor,
            :send_customer_emails,
            :send_retail_emails,
            :send_wholesale_emails,
            :store_name,
            :store_email,
            :store_phone,
            :placeholder_image_url,
            :enable_order_emails,
            :enable_order_sms,
            :send_sms_notifications,
            :sms_order_updates,
            order_notification_emails: [],
            admin_sms_phones: [],
            shipping_origin_address: [
              :company, :street1, :street2, :city, :state, :zip, :country, :phone
            ]
          )
        end
      end
    end
  end
end
