# frozen_string_literal: true

module Api
  module V1
    # Public endpoint for submitting catering inquiries.
    class CateringController < ApplicationController
      # POST /api/v1/catering
      def create
        inquiry = CateringInquiry.new(inquiry_params)

        if inquiry.save
          # TODO: Send notification email to restaurant
          # TODO: Send confirmation email to customer
          render json: {
            message: "Thank you! We'll get back to you within 24-48 hours.",
            inquiry: inquiry_json(inquiry)
          }, status: :created
        else
          render json: { errors: inquiry.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # GET /api/v1/catering/info
      def info
        render json: {
          event_types: CateringInquiry::EVENT_TYPES,
          budget_ranges: CateringInquiry::BUDGET_RANGES,
          minimum_lead_days: 3
        }
      end

      private

      def inquiry_params
        params.require(:inquiry).permit(
          :contact_name, :contact_email, :contact_phone, :company_name,
          :event_type, :event_date, :event_time, :guest_count,
          :budget_range, :venue_address, :menu_preferences,
          :special_requests, :dietary_restrictions
        )
      end

      def inquiry_json(inquiry)
        {
          id: inquiry.id,
          contact_name: inquiry.contact_name,
          event_type: inquiry.event_type,
          event_date: inquiry.event_date,
          guest_count: inquiry.guest_count,
          status: inquiry.status,
          created_at: inquiry.created_at.iso8601
        }
      end
    end
  end
end
