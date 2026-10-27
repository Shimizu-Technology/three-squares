# frozen_string_literal: true

module Payments
  # Reporting reads verified captures; an order's display status is not capture proof.
  # Refunds are counted from their single succeeded ledger row, never observations.
  module Revenue
    CAPTURE_SQL = <<~SQL.squish.freeze
      COALESCE(
        (SELECT SUM(t.amount_cents) FROM payment_transactions t
          JOIN payment_identities i ON i.id = t.payment_identity_id
          WHERE t.order_id = orders.id AND t.state = 'captured' AND t.currency = 'USD'
          AND i.environment = 'production' AND i.currency = 'USD'
          AND t.payment_identity_id = orders.payment_identity_id),
        (SELECT CASE WHEN COUNT(*) = 1 THEN MAX(b.amount_cents) END FROM legacy_capture_bindings b
          JOIN payment_identities i ON i.id = b.payment_identity_id
          WHERE b.order_id = orders.id AND b.environment = 'production' AND b.currency = 'USD'
          AND i.environment = 'production' AND b.verified_at IS NOT NULL
          AND (orders.payment_identity_id IS NULL OR b.payment_identity_id = orders.payment_identity_id)),
        CASE WHEN orders.source = 'pos' AND orders.staff_created = TRUE AND orders.payment_method = 'cash'
          AND orders.payment_status IN ('paid', 'refunded') AND orders.payment_identity_id IS NULL
          AND EXISTS (SELECT 1 FROM inventory_commitments c WHERE c.order_id = orders.id)
          THEN orders.total_cents ELSE 0 END)
    SQL
    REFUND_SQL = <<~SQL.squish.freeze
      CASE WHEN (#{CAPTURE_SQL}) > 0 THEN COALESCE(
        (SELECT SUM(r.amount_cents) FROM refunds r WHERE r.order_id = orders.id AND r.status = 'succeeded'
          AND (r.refund_operation_id IS NULL OR EXISTS (
            SELECT 1 FROM refund_operations o WHERE o.id = r.refund_operation_id AND o.state = 'succeeded'
            AND o.environment = 'production' AND (o.payment_identity_id = orders.payment_identity_id
              OR (o.provider = 'cash' AND orders.payment_identity_id IS NULL))))), 0) ELSE 0 END
    SQL
    NET_SQL = "(#{CAPTURE_SQL}) - (#{REFUND_SQL})".freeze
    GUAM_DAY_SQL = "DATE(orders.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Pacific/Guam')".freeze

    def self.scope(orders)
      # A subquery deduplicates orders reached through several matching items.
      Order.where(id: orders.except(:includes, :order).select("orders.id"))
        .where(simulated: false, payment_environment: "production")
    end

    def self.total(orders) = scope(orders).sum(Arel.sql(NET_SQL)).to_i
    def self.by_day(orders) = scope(orders).group(Arel.sql(GUAM_DAY_SQL)).sum(Arel.sql(NET_SQL)).transform_values(&:to_i)
    def self.by_location(orders) = scope(orders).left_joins(:location).group("locations.name").sum(Arel.sql(NET_SQL)).transform_values(&:to_i)

    def self.by_order(orders)
      scope(orders).pluck(:id, Arel.sql(CAPTURE_SQL), Arel.sql(REFUND_SQL), Arel.sql(NET_SQL))
        .to_h { |id, capture, refund, net| [ id, { captured_cents: capture.to_i, succeeded_refunds_cents: refund.to_i, net_revenue_cents: net.to_i } ] }
    end
  end
end
