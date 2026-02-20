# frozen_string_literal: true

module Api
  module V1
    module Admin
      class AnalyticsController < ApplicationController
        include Authenticatable
        before_action :authenticate_request
        before_action :require_manager_or_above!

        # GET /api/v1/admin/analytics/dashboard
        # Params: period (today/week/month/year/all), location_id (optional)
        def dashboard
          base = base_order_scope
          paid = base.where(payment_status: "paid")
          active_paid = paid.where.not(status: "cancelled")

          render json: {
            summary: summary_data(active_paid),
            by_location: location_data(active_paid),
            by_order_type: group_breakdown(active_paid, :order_type),
            by_source: group_breakdown(active_paid, :source),
            by_payment_method: group_breakdown(active_paid, :payment_method),
            revenue_trend: revenue_trend_data(active_paid),
            top_products: top_products_data(active_paid),
            recent_orders: recent_orders_data(base)
          }
        end

        private

        def base_order_scope
          scope = if current_user.location_scoped?
                    Order.where(location_id: current_user.assigned_location_id)
                  else
                    Order.all
                  end

          scope = scope.where(location_id: params[:location_id].to_i) if params[:location_id].present?
          scope = apply_period_filter(scope)
          scope
        end

        def apply_period_filter(scope)
          case params[:period]
          when "today"
            scope.where("orders.created_at >= ?", Time.current.beginning_of_day)
          when "week"
            scope.where("orders.created_at >= ?", Time.current.beginning_of_week)
          when "month"
            scope.where("orders.created_at >= ?", Time.current.beginning_of_month)
          when "year"
            scope.where("orders.created_at >= ?", Time.current.beginning_of_year)
          else
            scope
          end
        end

        def summary_data(scope)
          total_revenue = scope.sum(:total_cents)
          total_orders = scope.count
          # Count unique customers by user_id OR customer_email for guests
          total_customers = scope.where.not(user_id: nil).distinct.count(:user_id) +
                            scope.where(user_id: nil).where.not(customer_email: [ nil, "" ]).distinct.count(:customer_email)

          {
            total_revenue: cents_to_dollars(total_revenue),
            total_orders: total_orders,
            average_order_value: total_orders > 0 ? cents_to_dollars(total_revenue / total_orders) : 0.0,
            total_customers: total_customers
          }
        end

        def location_data(scope)
          # Group by location in a single query
          location_stats = scope
            .left_joins(:location)
            .group("locations.id", "locations.name")
            .select(
              "locations.id as loc_id",
              "locations.name as loc_name",
              "SUM(orders.total_cents) as revenue_cents",
              "COUNT(orders.id) as order_count"
            )

          location_stats.map do |row|
            order_count = row.order_count.to_i
            revenue = row.revenue_cents.to_i
            {
              location_id: row.loc_id,
              location_name: row.loc_name || "Shipping / No Location",
              revenue: cents_to_dollars(revenue),
              orders: order_count,
              average_order_value: order_count > 0 ? cents_to_dollars(revenue / order_count) : 0.0
            }
          end.sort_by { |r| -r[:revenue] }
        end

        def group_breakdown(scope, column)
          counts = scope.group(column).count
          revenues = scope.group(column).sum(:total_cents)

          result = {}
          counts.each do |key, count|
            result[key] = {
              count: count,
              revenue: cents_to_dollars(revenues[key] || 0)
            }
          end
          result
        end

        def revenue_trend_data(scope)
          days = trend_days
          start_date = days.days.ago.beginning_of_day

          trend_scope = scope.where("orders.created_at >= ?", start_date)

          orders_by_day = trend_scope.group("DATE(orders.created_at)").count
          revenue_by_day = trend_scope.group("DATE(orders.created_at)").sum(:total_cents)

          (0...days).map do |i|
            date = (start_date + i.days).to_date
            {
              date: date.to_s,
              revenue: cents_to_dollars(revenue_by_day[date] || 0),
              orders: orders_by_day[date] || 0
            }
          end
        end

        def trend_days
          case params[:period]
          when "today" then 1
          when "week" then 7
          when "month" then 30
          when "year" then 365
          else 30
          end
        end

        def top_products_data(scope)
          OrderItem
            .joins(:order)
            .where(order_id: scope.select(:id))
            .where.not(product_id: nil)
            .group(:product_id, :product_name)
            .select(
              "order_items.product_id as id",
              "order_items.product_name as name",
              "SUM(order_items.quantity) as quantity_sold",
              "SUM(order_items.total_price_cents) as revenue_cents"
            )
            .order("quantity_sold DESC")
            .limit(10)
            .map do |row|
              {
                id: row.id,
                name: row.name,
                quantity_sold: row.quantity_sold.to_i,
                revenue: cents_to_dollars(row.revenue_cents.to_i)
              }
            end
        end

        def recent_orders_data(scope)
          scope
            .includes(:location)
            .order(created_at: :desc)
            .limit(10)
            .map do |order|
              {
                id: order.id,
                order_number: order.order_number,
                total: cents_to_dollars(order.total_cents),
                status: order.status,
                location_name: order.location&.name || "N/A",
                created_at: order.created_at.iso8601
              }
            end
        end

        def cents_to_dollars(cents)
          (cents.to_f / 100).round(2)
        end
      end
    end
  end
end
