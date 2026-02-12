# frozen_string_literal: true

module Api
  module V1
    module Admin
      class DashboardController < ApplicationController
        COOKIE_COLLECTION_SLUGS = %w[cookies cookie-boxes mini-cookies].freeze

        include Authenticatable
        before_action :authenticate_request
        before_action :require_admin!

        # GET /api/v1/admin/dashboard/stats
        def stats
          total_orders = Order.count
          total_revenue_cents = Order.where(payment_status: "paid").sum(:total_cents)
          pending_orders = Order.where(status: "pending").count
          total_products = Product.where(published: true).count
          business_line_breakdown = business_line_breakdown_data
          fulfillment_breakdown = Order.group(:fulfillment_type).count
          location_breakdown = location_breakdown_data

          render json: {
            total_orders: total_orders,
            total_revenue_cents: total_revenue_cents,
            pending_orders: pending_orders,
            total_products: total_products,
            business_line_breakdown: business_line_breakdown,
            fulfillment_breakdown: fulfillment_breakdown,
            location_breakdown: location_breakdown
          }
        end

        # GET /api/v1/admin/dashboard/chart_data
        # Returns daily order counts and revenue for the last 30 days
        def chart_data
          days = (params[:days] || 30).to_i.clamp(7, 90)
          start_date = days.days.ago.beginning_of_day

          # Orders per day
          orders_by_day = Order
            .where("created_at >= ?", start_date)
            .group("DATE(created_at)")
            .count

          # Revenue per day (paid orders only)
          revenue_by_day = Order
            .where("created_at >= ?", start_date)
            .where(payment_status: "paid")
            .group("DATE(created_at)")
            .sum(:total_cents)

          # Build complete series (fill in zero days)
          series = (0...days).map do |i|
            date = (start_date + i.days).to_date
            date_str = date.to_s
            {
              date: date_str,
              label: date.strftime("%b %d"),
              orders: orders_by_day[date] || 0,
              revenue_cents: revenue_by_day[date] || 0
            }
          end

          # Period comparison: this week vs last week
          this_week_start = Time.current.beginning_of_week
          last_week_start = 1.week.ago.beginning_of_week
          last_week_end = this_week_start

          this_week_revenue = Order.where(payment_status: "paid")
            .where("created_at >= ?", this_week_start).sum(:total_cents)
          last_week_revenue = Order.where(payment_status: "paid")
            .where("created_at >= ? AND created_at < ?", last_week_start, last_week_end).sum(:total_cents)

          this_week_orders = Order.where("created_at >= ?", this_week_start).count
          last_week_orders = Order.where("created_at >= ? AND created_at < ?", last_week_start, last_week_end).count

          render json: {
            series: series,
            comparison: {
              this_week: { orders: this_week_orders, revenue_cents: this_week_revenue },
              last_week: { orders: last_week_orders, revenue_cents: last_week_revenue }
            }
          }
        end

        private

        def business_line_breakdown_data
          retail_orders = Order.where(order_type: "retail")
          latte_stone_orders = retail_orders
            .joins(order_items: { product_variant: { product: :collections } })
            .where(collections: { slug: COOKIE_COLLECTION_SLUGS })
            .distinct
          three_squares_orders = retail_orders.where.not(id: latte_stone_orders.select(:id))

          {
            "three_squares" => {
              orders: three_squares_orders.count,
              revenue_cents: three_squares_orders.where(payment_status: "paid").sum(:total_cents)
            },
            "latte_stone" => {
              orders: latte_stone_orders.count,
              revenue_cents: latte_stone_orders.where(payment_status: "paid").sum(:total_cents)
            },
            "catering" => {
              orders: Order.where(order_type: "wholesale").count,
              revenue_cents: Order.where(order_type: "wholesale", payment_status: "paid").sum(:total_cents)
            }
          }
        end

        def location_breakdown_data
          grouped_orders = Order.left_joins(:location).group("locations.name").count
          grouped_revenue = Order.left_joins(:location).where(payment_status: "paid").group("locations.name").sum(:total_cents)

          grouped_orders.map do |location_name, count|
            label = location_name.presence || "Shipping / No Pickup Location"
            {
              name: label,
              orders: count,
              revenue_cents: grouped_revenue[location_name] || 0
            }
          end.sort_by { |entry| -entry[:orders] }
        end
      end
    end
  end
end
