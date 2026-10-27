# frozen_string_literal: true

module Api
  module V1
    module Admin
      # Admin endpoint for managing catering inquiries.
      class CateringController < BaseController
        before_action :set_inquiry, only: [ :show, :update, :destroy, :quote, :status ]

        # GET /api/v1/admin/catering
        def index
          filter = params[:status].presence || "all"
          unless ([ "active", "all" ] + CateringInquiry::STATUSES).include?(filter)
            return render json: { error: "Invalid status" }, status: :unprocessable_entity
          end

          inquiries = CateringInquiry.order(event_date: :asc, created_at: :asc, id: :asc)
          inquiries = inquiries.active if filter == "active"
          inquiries = inquiries.where(status: filter) if CateringInquiry::STATUSES.include?(filter)
          inquiries = inquiries.where("event_date >= ?", params[:from_date]) if params[:from_date].present?
          inquiries = inquiries.where("event_date <= ?", params[:to_date]) if params[:to_date].present?

          per_page = 20
          total = inquiries.count
          total_pages = (total.to_f / per_page).ceil
          page = (Integer(params[:page], exception: false) || 1).clamp(1, [ total_pages, 1 ].max)
          inquiries = inquiries.offset((page - 1) * per_page).limit(per_page)

          render json: {
            inquiries: inquiries.map { |i| serialize_inquiry(i) },
            meta: {
              page: page,
              per_page: per_page,
              total: total,
              total_pages: total_pages
            }
          }
        end

        # GET /api/v1/admin/catering/:id
        def show
          render json: { inquiry: serialize_inquiry(@inquiry, full: true) }
        end

        # PATCH /api/v1/admin/catering/:id
        def update
          attributes = params[:inquiry]
          unless attributes.is_a?(ActionController::Parameters) &&
              (attributes.keys - [ "admin_notes" ]).empty? &&
              !params.key?(:status) && !params.key?(:quoted_amount)
            return render json: { error: "Only admin_notes may be updated" }, status: :unprocessable_entity
          end

          with_current_inquiry do
            @inquiry.update!(attributes.permit(:admin_notes))
            render json: { inquiry: serialize_inquiry(@inquiry, full: true) }
          end
        end

        # DELETE /api/v1/admin/catering/:id
        def destroy
          @inquiry.destroy
          head :no_content
        end

        # POST /api/v1/admin/catering/:id/quote
        def quote
          with_current_inquiry do
            options = { amount: params[:quoted_amount], admin: current_user }
            options[:notes] = params[:admin_notes] if params.key?(:admin_notes)
            @inquiry.mark_quoted!(**options)

            render json: {
              inquiry: serialize_inquiry(@inquiry, full: true),
              message: "Quote recorded. No email was sent by this app."
            }
          end
        end

        # POST /api/v1/admin/catering/:id/status
        def status
          with_current_inquiry do
            @inquiry.transition_to!(params[:status])
            render json: { inquiry: serialize_inquiry(@inquiry, full: true) }
          end
        end

        # GET /api/v1/admin/catering/stats
        def stats
          render json: {
            total: CateringInquiry.count,
            pending: CateringInquiry.pending.count,
            quoted: CateringInquiry.quoted.count,
            active: CateringInquiry.active.count,
            upcoming_this_week: CateringInquiry.urgent.count,
            urgent: CateringInquiry.urgent.count
          }
        end

        private

        def set_inquiry
          @inquiry = CateringInquiry.find(params[:id])
        end

        # Compare after reloading under the row lock so concurrent edits cannot
        # overwrite a newer quote, status, or note with a stale detail version.
        def with_current_inquiry
          @inquiry.with_lock do
            version = params[:expected_updated_at]
            unless version.is_a?(String) &&
                version.match?(/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})\z/)
              return render json: { error: "expected_updated_at must be an ISO 8601 timestamp string" }, status: :unprocessable_entity
            end

            begin
              Date.iso8601(version[0, 10])
              expected = Time.iso8601(version)
            rescue ArgumentError
              return render json: { error: "expected_updated_at must be a valid timestamp" }, status: :unprocessable_entity
            end

            unless expected == @inquiry.updated_at
              return render json: { error: "This inquiry has changed. Reload it before saving again." }, status: :conflict
            end

            yield
          end
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
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
              updated_at: inquiry.updated_at.iso8601(6)
            )
          end

          data
        end
      end
    end
  end
end
