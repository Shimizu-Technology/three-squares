# frozen_string_literal: true

module Api
  module V1
    class AcaiController < ApplicationController
      include Authenticatable
      skip_before_action :authenticate_request # Skip required auth for all public actions
      before_action :authenticate_optional # Use optional auth instead

      # GET /api/v1/acai/config
      # Returns all configuration needed for the Acai ordering page
      def show_config
        settings = AcaiSetting.instance

        render json: {
          settings: {
            name: settings.name,
            description: settings.description,
            base_price_cents: settings.base_price_cents,
            formatted_price: settings.formatted_price,
            image_url: settings.image_url,
            pickup_location: settings.pickup_location,
            pickup_instructions: settings.pickup_instructions,
            pickup_phone: settings.pickup_phone,
            advance_hours: settings.advance_hours,
            minimum_order_date: settings.minimum_order_date.to_s,
            active: settings.active,
            placard_enabled: settings.placard_enabled,
            placard_price_cents: settings.placard_price_cents,
            toppings_info: settings.toppings_info
          },
          crust_options: AcaiCrustOption.for_display.map { |opt|
            {
              id: opt.id,
              name: opt.name,
              description: opt.description,
              price_cents: opt.price_cents,
              formatted_price: opt.formatted_price
            }
          },
          placard_options: AcaiPlacardOption.for_display.map { |opt|
            {
              id: opt.id,
              name: opt.name,
              description: opt.description,
              price_cents: opt.price_cents,
              formatted_price: opt.formatted_price
            }
          },
          pickup_windows: AcaiPickupWindow.active.by_day.map { |w|
            {
              id: w.id,
              day_of_week: w.day_of_week,
              day_name: w.day_name,
              start_time: w.start_time.to_s.split(":")[0..1].join(":"),  # "HH:MM" format
              end_time: w.end_time.to_s.split(":")[0..1].join(":"),      # "HH:MM" format
              display_name: w.display_name
            }
          },
          ordering_enabled: settings.ordering_enabled?
        }
      end

      # GET /api/v1/acai/available_dates
      # Returns dates that are available for pickup in the next N days
      def available_dates
        settings = AcaiSetting.instance
        days_ahead = (params[:days] || 30).to_i.clamp(1, 90)

        start_date = settings.minimum_order_date
        end_date = start_date + days_ahead.days

        # Get active pickup windows
        active_days = AcaiPickupWindow.active.pluck(:day_of_week)

        # Generate available dates
        available = []
        (start_date..end_date).each do |date|
          next unless active_days.include?(date.wday)

          # Check if entire day is blocked
          next if AcaiBlockedSlot.for_date(date).where(start_time: "00:00:00"..."23:59:59").exists?

          window = AcaiPickupWindow.active.find_by(day_of_week: date.wday)
          next unless window

          # Check if any slots are available
          slots = generate_slots_for_date(date, window, settings)
          available_slots_count = slots.count { |s| s[:available] }

          available << {
            date: date.to_s,
            day_of_week: date.wday,
            day_name: Date::DAYNAMES[date.wday],
            available_slots: available_slots_count,
            fully_booked: available_slots_count == 0
          }
        end

        render json: {
          dates: available,
          minimum_date: start_date.to_s,
          maximum_date: end_date.to_s
        }
      end

      # GET /api/v1/acai/available_slots
      # Returns available time slots for a specific date
      def available_slots
        date_str = params[:date]

        unless date_str.present?
          return render json: { error: "Date parameter is required" }, status: :bad_request
        end

        begin
          date = Date.parse(date_str)
        rescue ArgumentError
          return render json: { error: "Invalid date format. Use YYYY-MM-DD" }, status: :bad_request
        end

        settings = AcaiSetting.instance

        # Validate date is not in the past
        if date < settings.minimum_order_date
          return render json: {
            error: "Orders must be placed at least #{settings.advance_hours} hours in advance",
            minimum_date: settings.minimum_order_date.to_s
          }, status: :unprocessable_entity
        end

        # Find pickup window for this day
        window = AcaiPickupWindow.active.find_by(day_of_week: date.wday)

        unless window
          return render json: {
            error: "No pickup window available for this day",
            slots: []
          }, status: :ok
        end

        slots = generate_slots_for_date(date, window, settings)

        render json: {
          date: date.to_s,
          day_name: Date::DAYNAMES[date.wday],
          window: {
            start_time: format_time_string_12h(window.start_time),
            end_time: format_time_string_12h(window.end_time)
          },
          slots: slots
        }
      end

      # POST /api/v1/acai/orders
      # Create an Acai Cake order
      def create_order
        settings = AcaiSetting.instance

        unless settings.active
          return render json: { error: "Acai Cake ordering is currently unavailable" }, status: :unprocessable_entity
        end

        # HAF-13: Normalize customer fields - accept both canonical (customer_*) and short-form names
        resolved_name  = params[:customer_name].presence  || params[:name]
        resolved_email = params[:customer_email].presence || params[:email]
        resolved_phone = params[:customer_phone].presence || params[:phone]

        # Validate required parameters
        missing = []
        missing << "pickup_date" if params[:pickup_date].blank?
        missing << "pickup_time" if params[:pickup_time].blank?
        missing << "crust_option_id" if params[:crust_option_id].blank?
        missing << "customer_name" if resolved_name.blank?
        missing << "customer_email" if resolved_email.blank?
        missing << "customer_phone" if resolved_phone.blank?

        if missing.any?
          return render json: { error: "Missing required fields: #{missing.join(', ')}" }, status: :unprocessable_entity
        end

        # Parse and validate date
        begin
          pickup_date = Date.parse(params[:pickup_date])
        rescue ArgumentError
          return render json: { error: "Invalid pickup date format" }, status: :unprocessable_entity
        end

        # Validate time slot is available
        pickup_time = params[:pickup_time]

        # Parse the pickup time to validate the full datetime is at least advance_hours from now
        slot_time = pickup_time.split("-").first.strip
        time_parts = slot_time.split(":")
        pickup_datetime = Time.zone.local(
          pickup_date.year,
          pickup_date.month,
          pickup_date.day,
          time_parts[0].to_i,
          time_parts[1].to_i
        )

        min_allowed_time = Time.current + settings.advance_hours.hours
        if pickup_datetime <= min_allowed_time
          return render json: {
            error: "Orders must be placed at least #{settings.advance_hours} hours in advance. Please select a later time slot."
          }, status: :unprocessable_entity
        end
        window = AcaiPickupWindow.active.find_by(day_of_week: pickup_date.wday)

        unless window
          return render json: { error: "No pickup window available for this day" }, status: :unprocessable_entity
        end


        # HAF-5: Check if the requested date/slot is blocked
        if AcaiBlockedSlot.is_blocked?(pickup_date, slot_time)
          return render json: {
            error: %q(This date/time slot is currently unavailable. Please select a different date or time.)
          }, status: :unprocessable_entity
        end
        # Check slot availability (cast time to text for comparison)
        slot_time = pickup_time.split("-").first.strip
        orders_count = Order.acai
                            .where(acai_pickup_date: pickup_date)
                            .where("acai_pickup_time LIKE ?", "#{slot_time}%")
                            .where.not(status: "cancelled")
                            .count

        if orders_count >= settings.max_per_slot
          return render json: { error: "This time slot is fully booked" }, status: :unprocessable_entity
        end

        # Validate crust option
        crust_option = AcaiCrustOption.available.find_by(id: params[:crust_option_id])
        unless crust_option
          return render json: { error: "Invalid crust option" }, status: :unprocessable_entity
        end

        # Calculate total price
        quantity = (params[:quantity] || 1).to_i.clamp(1, 10)
        base_total = settings.base_price_cents * quantity
        crust_total = crust_option.price_cents * quantity
        placard_total = 0
        placard_option = nil

        placard_text = nil
        if params[:include_placard].to_s == "true" && settings.placard_enabled
          # Find placard option if provided
          if params[:placard_option_id].present?
            placard_option = AcaiPlacardOption.available.find_by(id: params[:placard_option_id])
            if placard_option
              placard_total = placard_option.price_cents * quantity
            end
          end
          placard_text = params[:placard_text]
        end

        subtotal_cents = base_total + crust_total + placard_total
        total_cents = subtotal_cents  # No shipping for pickup orders

        # Create the order
        ActiveRecord::Base.transaction do
          default_pickup_location = Location.active.find_by(slug: "three-squares-main") || Location.active.first

          @order = Order.new(
            order_type: "acai",
            fulfillment_type: "pickup",
            location: default_pickup_location,
            customer_name: resolved_name,
            customer_email: resolved_email,
            customer_phone: resolved_phone,
            user: current_user,
            status: "pending",
            payment_status: "pending",
            subtotal_cents: subtotal_cents,
            shipping_cost_cents: 0,
            tax_cents: 0,
            total_cents: total_cents,
            acai_pickup_date: pickup_date,
            acai_pickup_time: pickup_time,
            acai_crust_type: crust_option.name,
            acai_include_placard: params[:include_placard].to_s == "true",
            acai_placard_text: placard_text,
            shipping_method: "pickup",
            notes: params[:notes]
          )

          # Add order item (the acai cake)
          @order.order_items.build(
            product_id: nil,  # No product reference for Acai cakes (special order)
            product_variant_id: nil,
            quantity: quantity,
            unit_price_cents: settings.base_price_cents + crust_option.price_cents + (placard_total / quantity),
            total_price_cents: subtotal_cents,
            product_name: settings.name,
            product_sku: "ACAI-CAKE",
            variant_name: "#{crust_option.name}#{placard_text.present? ? ' + Placard' : ''}"
          )

          # Process payment (test mode or Stripe)
          site_settings = SiteSetting.instance

          if site_settings.test_mode?
            # Test mode - simulate successful payment
            @order.payment_status = "paid"
            @order.payment_intent_id = "test_pi_#{SecureRandom.hex(12)}"
            @order.status = "processing"
          else
            # Real payment - would integrate with Stripe here
            # For now, require payment method token
            unless params[:payment_token].present?
              return render json: { error: "Payment method required" }, status: :unprocessable_entity
            end

            begin
              payment_result = PaymentService.charge(
                amount_cents: total_cents,
                payment_token: params[:payment_token],
                description: "Acai Cake Order - #{settings.name}",
                metadata: { order_type: "acai", pickup_date: pickup_date.to_s }
              )

              @order.payment_status = "paid"
              @order.payment_intent_id = payment_result[:payment_intent_id]
              @order.status = "processing"
            rescue PaymentService::PaymentError => e
              return render json: { error: e.message }, status: :unprocessable_entity
            end
          end

          @order.save!

          # Send confirmation emails (use acai-specific setting)
          site_settings = SiteSetting.instance
          if site_settings.send_emails_for?("acai")
            SendOrderConfirmationEmailJob.perform_later(@order.id)
          end
          SendAdminNotificationEmailJob.perform_later(@order.id)

          render json: {
            success: true,
            order: {
              id: @order.id,
              order_number: @order.order_number,
              status: @order.status,
              payment_status: @order.payment_status,
              total_cents: @order.total_cents,
              formatted_total: "$#{'%.2f' % (@order.total_cents / 100.0)}",
              pickup_date: @order.acai_pickup_date.to_s,
              pickup_time: @order.acai_pickup_time,
              crust_type: @order.acai_crust_type,
              placard_text: @order.acai_placard_text,
              pickup_location: settings.pickup_location,
              pickup_phone: settings.pickup_phone
            }
          }, status: :created
        end

      rescue ActiveRecord::RecordInvalid => e
        render json: { error: e.message }, status: :unprocessable_entity
      rescue => e
        Rails.logger.error "Acai order error: #{e.message}"
        Rails.logger.error e.backtrace.first(10).join("\n")
        render json: { error: "Failed to create order. Please try again." }, status: :internal_server_error
      end

      private

      def generate_slots_for_date(date, window, settings, interval_minutes: 30)
        slots = []

        # Parse times from string format "HH:MM"
        start_parts = window.start_time.to_s.split(":")
        end_parts = window.end_time.to_s.split(":")

        start_hour = start_parts[0].to_i
        start_min = start_parts[1].to_i
        end_hour = end_parts[0].to_i
        end_min = end_parts[1].to_i

        # Create time objects for iteration (using arbitrary date, we only care about time)
        current_minutes = start_hour * 60 + start_min
        end_minutes = end_hour * 60 + end_min

        # Calculate the minimum allowed slot time (now + advance_hours)
        min_allowed_time = Time.current + settings.advance_hours.hours

        while current_minutes < end_minutes
          slot_hour = current_minutes / 60
          slot_min = current_minutes % 60

          slot_end_minutes = current_minutes + interval_minutes
          slot_end_hour = slot_end_minutes / 60
          slot_end_min = slot_end_minutes % 60

          # Format times for display
          slot_time_12h = format_time_12h(slot_hour, slot_min)
          slot_end_12h = format_time_12h(slot_end_hour, slot_end_min)
          slot_time_24h = format("%02d:%02d", slot_hour, slot_min)
          slot_end_24h = format("%02d:%02d", slot_end_hour, slot_end_min)

          slot_string = "#{slot_time_12h} - #{slot_end_12h}"
          slot_value = "#{slot_time_24h}-#{slot_end_24h}"

          # Check if slot is blocked
          is_blocked = AcaiBlockedSlot.blocks_slot?(date, slot_string)

          # Count orders for this slot
          orders_count = Order.acai
                              .where(acai_pickup_date: date)
                              .where("acai_pickup_time LIKE ?", "#{slot_time_24h}%")
                              .where.not(status: "cancelled")
                              .count

          is_available = !is_blocked && orders_count < settings.max_per_slot

          # Check if slot datetime is at least advance_hours from now
          # This applies to ALL dates, not just today
          slot_datetime = Time.zone.local(date.year, date.month, date.day, slot_hour, slot_min)
          if slot_datetime <= min_allowed_time
            is_available = false
          end

          slots << {
            time: slot_time_12h,
            time_value: slot_time_24h,
            slot_string: slot_string,
            slot_value: slot_value,
            available: is_available,
            remaining: [ settings.max_per_slot - orders_count, 0 ].max
          }

          current_minutes = slot_end_minutes
        end

        slots
      end

      def format_time_12h(hour, min)
        period = hour >= 12 ? "PM" : "AM"
        hour_12 = hour > 12 ? hour - 12 : (hour == 0 ? 12 : hour)
        format("%02d:%02d %s", hour_12, min, period)
      end

      def format_time_string_12h(time_str)
        parts = time_str.to_s.split(":")
        hour = parts[0].to_i
        min = parts[1].to_i
        format_time_12h(hour, min)
      end
    end
  end
end
