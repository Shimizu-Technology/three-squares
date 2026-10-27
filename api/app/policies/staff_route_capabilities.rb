# Explicit route inventory. A newly added admin action is denied until it is
# classified here; the route-enumeration spec makes omissions a CI failure.
class StaffRouteCapabilities
  ADMIN = {
    "dashboard" => { "stats" => "analytics.read", "chart_data" => "analytics.read" },
    "payment_reconciliation" => %w[index show import import_status export allocate review].index_with { "payments.reconcile" }
      .merge(%w[simulate_close advance_simulation simulated_funding simulate_void].index_with { "payments.simulate" }),
    "orders" => {
      "index" => "orders.read", "show" => "orders.read", "summary" => "orders.counts",
      "update" => "orders.status", "notify" => "orders.notify", "export" => "orders.export",
      "refund" => "payments.refund", "reconcile_refund" => "payments.refund"
    },
    "users" => %w[index show update].index_with { "users.manage" },
    "devices" => {
      "index" => "devices.manage", "update" => "devices.manage", "current" => "devices.self",
      "update_current" => "devices.self", "subscribe_current" => "devices.self", "unsubscribe_current" => "devices.self"
    },
    "catering" => %w[index show update destroy quote status stats].index_with { "catering.manage" },
    "site_settings" => %w[show update].index_with { "settings.manage" }.merge("payment_status" => "payment_settings.manage"),
    "settings" => %w[show update].index_with { "settings.manage" },
    "imports" => %w[index show create].index_with { "catalog.import" },
    "homepage_sections" => %w[index show create update destroy reorder].index_with { "homepage.manage" },
    # Blob deletion has no catalog-resource binding yet. Product image removal
    # uses its scoped nested endpoint; raw blob purge stays owner-only.
    "uploads" => { "create" => "catalog.manage", "destroy" => "settings.manage" },
    "collections" => %w[index show create update destroy].index_with { "catalog.manage" },
    "locations" => {
      "index" => "locations.read", "show" => "locations.read", "create" => "locations.manage",
      "update" => "locations.update", "destroy" => "locations.manage", "generate_qr" => "locations.qr"
    },
    "variant_presets" => %w[index show create update destroy duplicate].index_with { "catalog.manage" },
    "products" => %w[index show create update destroy duplicate archive unarchive].index_with { "catalog.manage" }
      .merge("import_csv" => "catalog.import", "availability" => "availability.manage"),
    "product_variants" => %w[index show create update destroy generate auto_detect_options].index_with { "catalog.manage" }
      .merge("adjust_stock" => "stock.manage"),
    "product_images" => %w[index show create update destroy set_primary reorder].index_with { "catalog.manage" },
    "inventory_audits" => %w[index show summary for_product for_variant for_order].index_with { "stock.read" },
    "pos_menu" => { "show" => "pos.sell" },
    "pos_orders" => { "create" => "pos.sell", "confirm_terminal_payment" => "payments.collect", "start_payment" => "payments.collect" },
    "payment_terminals" => {
      "index" => "payments.collect", "show" => "payments.terminals.manage", "status" => "payments.collect", "collect" => "payments.collect",
      "cancel" => "payments.collect", "create" => "payments.terminals.manage", "update" => "payments.terminals.manage",
      "pair" => "payments.terminals.manage", "destroy" => "payments.terminals.manage", "simulate" => "payments.simulate",
      "advance_simulation" => "payments.simulate"
    },
    "stripe_terminal" => %w[connection_token readers].index_with { "payments.terminals.discover" }
  }.transform_keys { |name| "api/v1/admin/#{name}" }.transform_values(&:freeze).freeze
  OTHER = {
    "api/v1/orders" => { "index" => "orders.read", "update" => "orders.manage" }
  }.transform_values(&:freeze).freeze

  def self.capability_for(controller, action)
    (ADMIN[controller] || OTHER[controller] || {})[action]
  end

  def self.protected?(controller, action)
    controller.start_with?("api/v1/admin/")
  end
end
