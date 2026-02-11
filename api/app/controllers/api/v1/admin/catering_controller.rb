# frozen_string_literal: true

module Api
  module V1
    module Admin
      # Admin endpoint for managing catering inquiries.
      class CateringController < BaseController
        before_action :set_inquiry, only: [:show, :update, :destroy]

        # GET /api/v1/admin/catering
        def index
          inquiries = CateringInquiry.order(created_at: :desc)
          
          # Filter by status
          if params[:status].present?
            inquiries = inquiries.where(status: params[:status])
          end

          # Filter by date range
          if params[:from_date].present?
            inquiries = inquiries.where("event_date >= ?", params[:from_date])
          end
          if params[:to_date].present?
            inquiries = inquiries.where("event_date <= ?", params[:to_date])
          end

          # Pagination
          page = (params[:page] || 1).to_i
          per_page = (params[:per_page] || 20).to_i.clamp(1, 100)
          total = inquiries.count
          inquiries = inquiries.offset((page - 1) * per_page).limit(per_page)

          render json: {
            inquiries: inquiries.map { |i| serialize_inquiry(i) },
            meta: {
              page: page,
              per_page: per_page,
              total: total,
              total_pages: (total.to_f / per_page).ceil
            }
          }
        end

        # GET /api/v1/admin/catering/:id
        def show
          render json: { inquiry: serialize_inquiry(@inquiry, full: true) }
        end

        # PATCH /api/v1/admin/catering/:id
        def update
          if @inquiry.update(inquiry_params)
            render json: { inquiry: serialize_inquiry(@inquiry, full: true) }
          else
            render json: { errors: @inquiry.errors.full_messages }, status: :unprocessable_entity
          end
        end

        # DELETE /api/v1/admin/catering/:id
        def destroy
          @inquiry.destroy
          head :no_content
        end

        # POST /api/v1/admin/catering/:id/quote
        def quote
          @inquiry = CateringInquiry.find(params[:id])
          
          unless params[:quoted_amount].present?
            return render json: { error: "quoted_amount is required" }, status: :unprocessable_entity
          end

          @inquiry.mark_quoted!(
            amount: params[:quoted_amount].to_d,
            admin: current_user,
            notes: params[:admin_notes]
          )

          # TODO: Send quote email to customer

          render json: { inquiry: serialize_inquiry(@inquiry, full: true) }
        end

        # POST /api/v1/admin/catering/:id/status
        def status
          @inquiry = CateringInquiry.find(params[:id])
          
          case params[:status]
          when "accepted"
            @inquiry.mark_accepted!
          when "declined"
            @inquiry.mark_declined!
          when "completed"
            @inquiry.mark_completed!
          when "cancelled"
            @inquiry.update!(status: "cancelled")
          else
            return render json: { error: "Invalid status" }, status: :unprocessable_entity
          end

          render json: { inquiry: serialize_inquiry(@inquiry, full: true) }
        end

        # GET /api/v1/admin/catering/stats
        def stats
          render json: {
            total: CateringInquiry.count,
            pending: CateringInquiry.pending.count,
            quoted: CateringInquiry.quoted.count,
            active: CateringInquiry.active.count,
            upcoming_this_week: CateringInquiry.upcoming.where("event_date <= ?", 1.week.from_now).count,
            urgent: CateringInquiry.active.select(&:urgent?).count
          }
        end

        private

        def set_inquiry
          @inquiry = CateringInquiry.find(params[:id])
        end

        def inquiry_params
          params.require(:inquiry).permit(
            :status, :admin_notes, :quoted_amount
          )
        end

        def serialize_inquiry(inquiry, full: false)
          data = {
            id: inquiry.id,
            contact_name: inquiry.contact_name,
            contact_email: inquiry.contact_email,
            contact_phone: inquiry.contact_phone,
            company_name: inquiry.company_name,
            event_type: inquiry.event_type,
            event_date: inquiry.event_date,
            event_time: inquiry.event_time,
            guest_count: inquiry.guest_count,
            budget_range: inquiry.budget_range,
            status: inquiry.status,
            days_until_event: inquiry.days_until_event,
            urgent: inquiry.urgent?,
            created_at: inquiry.created_at.iso8601
          }

          if full
            data.merge!(
              venue_address: inquiry.venue_address,
              menu_preferences: inquiry.menu_preferences,
              special_requests: inquiry.special_requests,
              dietary_restrictions: inquiry.dietary_restrictions,
              admin_notes: inquiry.admin_notes,
              quoted_amount: inquiry.quoted_amount&.to_f,
              quoted_at: inquiry.quoted_at&.iso8601,
              responded_by_id: inquiry.responded_by_id,
              updated_at: inquiry.updated_at.iso8601
            )
          end

          data
        end
      end
    end
  end
end
