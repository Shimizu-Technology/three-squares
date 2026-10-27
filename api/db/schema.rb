# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_27_080000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "acai_blocked_slots", force: :cascade do |t|
    t.date "blocked_date"
    t.datetime "created_at", null: false
    t.string "end_time"
    t.string "reason"
    t.string "start_time"
    t.datetime "updated_at", null: false
  end

  create_table "acai_crust_options", force: :cascade do |t|
    t.boolean "available", default: true, null: false
    t.datetime "created_at", null: false
    t.string "description"
    t.string "name", null: false
    t.integer "position", default: 0, null: false
    t.integer "price_cents", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["available"], name: "index_acai_crust_options_on_available"
    t.index ["position"], name: "index_acai_crust_options_on_position"
  end

  create_table "acai_pickup_windows", force: :cascade do |t|
    t.boolean "active"
    t.integer "capacity"
    t.datetime "created_at", null: false
    t.integer "day_of_week"
    t.string "end_time"
    t.string "start_time"
    t.datetime "updated_at", null: false
  end

  create_table "acai_placard_options", force: :cascade do |t|
    t.boolean "available", default: true, null: false
    t.datetime "created_at", null: false
    t.string "description"
    t.string "name", null: false
    t.integer "position", default: 0, null: false
    t.integer "price_cents", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["available"], name: "index_acai_placard_options_on_available"
    t.index ["position"], name: "index_acai_placard_options_on_position"
  end

  create_table "acai_settings", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.integer "advance_hours", default: 24, null: false
    t.integer "base_price_cents", default: 4500, null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.string "image_url"
    t.integer "max_per_slot", default: 5, null: false
    t.string "name", default: "Heart-Shaped Açaí Cake", null: false
    t.text "pickup_instructions"
    t.string "pickup_location", default: "955 Pale San Vitores Rd, Tumon, Blue Lagoon Plaza"
    t.string "pickup_phone", default: "671-989-3444"
    t.boolean "placard_enabled", default: true, null: false
    t.integer "placard_price_cents", default: 0, null: false
    t.text "toppings_info"
    t.datetime "updated_at", null: false
  end

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "admin_devices", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.string "browser"
    t.datetime "created_at", null: false
    t.string "device_uuid", null: false
    t.datetime "last_seen_at"
    t.bigint "location_id"
    t.string "name", null: false
    t.string "platform"
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.bigint "user_id"
    t.index ["active"], name: "index_admin_devices_on_active"
    t.index ["device_uuid"], name: "index_admin_devices_on_device_uuid", unique: true
    t.index ["location_id"], name: "index_admin_devices_on_location_id"
    t.index ["user_id"], name: "index_admin_devices_on_user_id"
  end

  create_table "admin_push_subscriptions", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.bigint "admin_device_id", null: false
    t.text "auth_key", null: false
    t.datetime "created_at", null: false
    t.text "endpoint", null: false
    t.datetime "last_sent_at"
    t.text "p256dh_key", null: false
    t.datetime "updated_at", null: false
    t.index ["active"], name: "index_admin_push_subscriptions_on_active"
    t.index ["admin_device_id"], name: "index_admin_push_subscriptions_on_admin_device_id"
    t.index ["endpoint"], name: "index_admin_push_subscriptions_on_endpoint", unique: true
  end

  create_table "cart_items", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "product_variant_id", null: false
    t.integer "quantity", default: 1, null: false
    t.string "session_id"
    t.datetime "updated_at", null: false
    t.bigint "user_id"
    t.index ["product_variant_id"], name: "index_cart_items_on_product_variant_id"
    t.index ["session_id", "product_variant_id"], name: "index_cart_items_on_session_and_variant", unique: true, where: "(session_id IS NOT NULL)"
    t.index ["user_id", "product_variant_id"], name: "index_cart_items_on_user_and_variant", unique: true, where: "(user_id IS NOT NULL)"
    t.index ["user_id"], name: "index_cart_items_on_user_id"
  end

  create_table "catering_inquiries", force: :cascade do |t|
    t.text "admin_notes"
    t.string "budget_range"
    t.string "company_name"
    t.string "contact_email", null: false
    t.string "contact_name", null: false
    t.string "contact_phone"
    t.datetime "created_at", null: false
    t.text "dietary_restrictions"
    t.date "event_date", null: false
    t.string "event_time"
    t.string "event_type", null: false
    t.integer "guest_count", null: false
    t.text "menu_preferences"
    t.decimal "quoted_amount", precision: 10, scale: 2
    t.datetime "quoted_at"
    t.bigint "responded_by_id"
    t.text "special_requests"
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.text "venue_address"
    t.index ["event_date"], name: "index_catering_inquiries_on_event_date"
    t.index ["responded_by_id"], name: "index_catering_inquiries_on_responded_by_id"
    t.index ["status"], name: "index_catering_inquiries_on_status"
  end

  create_table "checkout_sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "amount_cents", null: false
    t.string "caller_idempotency_key", null: false
    t.string "channel", default: "online", null: false
    t.datetime "consumed_at"
    t.datetime "created_at", null: false
    t.string "currency", default: "USD", null: false
    t.datetime "expires_at", null: false
    t.string "guest_capability_digest", null: false
    t.bigint "location_id"
    t.bigint "order_id", null: false
    t.string "owner_key", null: false
    t.uuid "payment_identity_id", null: false
    t.jsonb "snapshot", default: {}, null: false
    t.string "snapshot_digest", null: false
    t.string "state", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.bigint "user_id"
    t.index ["location_id"], name: "index_checkout_sessions_on_location_id"
    t.index ["order_id"], name: "index_checkout_sessions_on_order_id", unique: true
    t.index ["owner_key", "caller_idempotency_key"], name: "unique_checkout_request", unique: true
    t.index ["payment_identity_id"], name: "index_checkout_sessions_on_payment_identity_id"
    t.index ["user_id"], name: "index_checkout_sessions_on_user_id"
    t.check_constraint "amount_cents > 0", name: "checkout_positive_amount"
    t.check_constraint "user_id IS NULL AND guest_capability_digest::text <> ''::text OR user_id IS NOT NULL AND guest_capability_digest::text = ''::text", name: "checkout_owner_authority"
  end

  create_table "collections", force: :cascade do |t|
    t.boolean "auto_hide", default: false, null: false
    t.string "banner_text"
    t.string "collection_type", default: "standard", null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.datetime "ends_at"
    t.boolean "featured"
    t.string "image_url"
    t.boolean "is_featured", default: false, null: false
    t.text "meta_description"
    t.string "meta_title"
    t.string "name"
    t.boolean "published", default: false
    t.string "slug"
    t.integer "sort_order"
    t.datetime "starts_at"
    t.datetime "updated_at", null: false
    t.index ["collection_type"], name: "index_collections_on_collection_type"
    t.index ["is_featured"], name: "index_collections_on_is_featured"
    t.index ["slug"], name: "index_collections_on_slug", unique: true
    t.index ["starts_at", "ends_at"], name: "index_collections_on_starts_at_and_ends_at"
  end

  create_table "contact_submissions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.text "message", null: false
    t.string "name", null: false
    t.string "status", default: "new", null: false
    t.string "subject", null: false
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_contact_submissions_on_created_at"
    t.index ["status"], name: "index_contact_submissions_on_status"
  end

  create_table "fundraiser_order_items", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "fundraiser_order_id", null: false
    t.bigint "fundraiser_product_variant_id", null: false
    t.integer "price_cents", null: false
    t.string "product_name"
    t.integer "quantity", default: 1, null: false
    t.datetime "updated_at", null: false
    t.string "variant_name"
    t.index ["fundraiser_order_id", "fundraiser_product_variant_id"], name: "idx_fundraiser_order_items_order_variant"
    t.index ["fundraiser_order_id"], name: "index_fundraiser_order_items_on_fundraiser_order_id"
    t.index ["fundraiser_product_variant_id"], name: "index_fundraiser_order_items_on_fundraiser_product_variant_id"
  end

  create_table "fundraiser_orders", force: :cascade do |t|
    t.text "admin_notes"
    t.datetime "created_at", null: false
    t.string "customer_email"
    t.string "customer_name"
    t.string "customer_phone"
    t.bigint "fundraiser_id", null: false
    t.text "notes"
    t.string "order_number", null: false
    t.bigint "participant_id"
    t.string "payment_status", default: "pending", null: false
    t.string "shipping_address_line1"
    t.string "shipping_address_line2"
    t.integer "shipping_cents", default: 0, null: false
    t.string "shipping_city"
    t.string "shipping_country", default: "US"
    t.string "shipping_state"
    t.string "shipping_zip"
    t.string "status", default: "pending", null: false
    t.string "stripe_payment_intent_id"
    t.integer "subtotal_cents", default: 0, null: false
    t.integer "tax_cents", default: 0, null: false
    t.integer "total_cents", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["fundraiser_id", "payment_status"], name: "index_fundraiser_orders_on_fundraiser_id_and_payment_status"
    t.index ["fundraiser_id", "status"], name: "index_fundraiser_orders_on_fundraiser_id_and_status"
    t.index ["fundraiser_id"], name: "index_fundraiser_orders_on_fundraiser_id"
    t.index ["order_number"], name: "index_fundraiser_orders_on_order_number", unique: true
    t.index ["participant_id", "payment_status"], name: "index_fundraiser_orders_on_participant_id_and_payment_status"
    t.index ["participant_id"], name: "index_fundraiser_orders_on_participant_id"
    t.index ["stripe_payment_intent_id"], name: "index_fundraiser_orders_on_stripe_payment_intent_id"
  end

  create_table "fundraiser_product_images", force: :cascade do |t|
    t.string "alt_text"
    t.datetime "created_at", null: false
    t.bigint "fundraiser_product_id", null: false
    t.integer "position", default: 0, null: false
    t.boolean "primary", default: false, null: false
    t.string "s3_key", null: false
    t.datetime "updated_at", null: false
    t.index ["fundraiser_product_id", "position"], name: "idx_on_fundraiser_product_id_position_821f73a80a"
    t.index ["fundraiser_product_id", "primary"], name: "idx_on_fundraiser_product_id_primary_fc61fab104"
    t.index ["fundraiser_product_id"], name: "index_fundraiser_product_images_on_fundraiser_product_id"
  end

  create_table "fundraiser_product_variants", force: :cascade do |t|
    t.boolean "available", default: true, null: false
    t.string "color"
    t.integer "compare_at_price_cents"
    t.datetime "created_at", null: false
    t.bigint "fundraiser_product_id", null: false
    t.boolean "is_default", default: false, null: false
    t.integer "low_stock_threshold", default: 5
    t.string "material"
    t.jsonb "options", default: {}
    t.integer "price_cents", null: false
    t.string "size"
    t.string "sku", null: false
    t.integer "stock_quantity", default: 0
    t.datetime "updated_at", null: false
    t.string "variant_key"
    t.string "variant_name"
    t.decimal "weight_oz", precision: 8, scale: 2
    t.index ["fundraiser_product_id", "available"], name: "idx_on_fundraiser_product_id_available_54f539defd"
    t.index ["fundraiser_product_id"], name: "index_fundraiser_product_variants_on_fundraiser_product_id"
    t.index ["sku"], name: "index_fundraiser_product_variants_on_sku", unique: true
  end

  create_table "fundraiser_products", force: :cascade do |t|
    t.integer "base_price_cents"
    t.datetime "created_at", null: false
    t.text "description"
    t.boolean "featured", default: false, null: false
    t.bigint "fundraiser_id", null: false
    t.string "inventory_level", default: "none", null: false
    t.string "name", null: false
    t.integer "position", default: 0
    t.integer "product_stock_quantity", default: 0
    t.boolean "published", default: true, null: false
    t.string "sku_prefix"
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.decimal "weight_oz", precision: 8, scale: 2
    t.index ["fundraiser_id", "position"], name: "index_fundraiser_products_on_fundraiser_id_and_position"
    t.index ["fundraiser_id", "published"], name: "index_fundraiser_products_on_fundraiser_id_and_published"
    t.index ["fundraiser_id"], name: "index_fundraiser_products_on_fundraiser_id"
    t.index ["slug"], name: "index_fundraiser_products_on_slug", unique: true
  end

  create_table "fundraisers", force: :cascade do |t|
    t.boolean "allow_shipping", default: false, null: false
    t.string "contact_email"
    t.string "contact_name"
    t.string "contact_phone"
    t.datetime "created_at", null: false
    t.text "description"
    t.date "end_date"
    t.integer "goal_amount_cents"
    t.string "image_url"
    t.string "name"
    t.string "organization_name"
    t.decimal "payout_percentage", precision: 5, scale: 2, default: "0.0"
    t.text "pickup_instructions"
    t.string "pickup_location"
    t.text "public_message"
    t.boolean "published", default: true, null: false
    t.integer "raised_amount_cents"
    t.text "shipping_note"
    t.string "slug"
    t.date "start_date"
    t.string "status"
    t.text "thank_you_message"
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_fundraisers_on_slug", unique: true
  end

  create_table "homepage_sections", force: :cascade do |t|
    t.boolean "active", default: true
    t.string "background_image_url"
    t.string "button_link"
    t.string "button_text"
    t.datetime "created_at", null: false
    t.string "image_url"
    t.integer "position", default: 0
    t.string "section_type", null: false
    t.jsonb "settings", default: {}
    t.text "subtitle"
    t.string "title"
    t.datetime "updated_at", null: false
    t.index ["active"], name: "index_homepage_sections_on_active"
    t.index ["position"], name: "index_homepage_sections_on_position"
    t.index ["section_type"], name: "index_homepage_sections_on_section_type"
  end

  create_table "imports", force: :cascade do |t|
    t.integer "collections_count", default: 0
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.string "current_step"
    t.text "error_messages"
    t.string "filename"
    t.integer "images_count", default: 0
    t.string "inventory_filename"
    t.datetime "last_progress_at"
    t.integer "processed_products", default: 0
    t.integer "products_count", default: 0
    t.integer "progress_percent", default: 0
    t.integer "skipped_count", default: 0
    t.datetime "started_at"
    t.string "status", default: "pending", null: false
    t.integer "total_products", default: 0
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.integer "variants_count", default: 0
    t.integer "variants_skipped_count", default: 0
    t.text "warnings"
    t.index ["created_at"], name: "index_imports_on_created_at"
    t.index ["status"], name: "index_imports_on_status"
    t.index ["user_id"], name: "index_imports_on_user_id"
  end

  create_table "inventory_audits", force: :cascade do |t|
    t.string "audit_type", null: false
    t.datetime "created_at", null: false
    t.jsonb "metadata", default: {}
    t.integer "new_quantity", default: 0, null: false
    t.bigint "order_id"
    t.integer "previous_quantity", default: 0, null: false
    t.bigint "product_id"
    t.bigint "product_variant_id"
    t.integer "quantity_change", default: 0, null: false
    t.text "reason"
    t.datetime "updated_at", null: false
    t.bigint "user_id"
    t.index ["audit_type"], name: "index_inventory_audits_on_audit_type"
    t.index ["created_at"], name: "index_inventory_audits_on_created_at"
    t.index ["order_id"], name: "idx_audits_on_order"
    t.index ["order_id"], name: "index_inventory_audits_on_order_id"
    t.index ["product_id", "created_at"], name: "idx_audits_on_product_and_date"
    t.index ["product_id"], name: "index_inventory_audits_on_product_id"
    t.index ["product_variant_id", "created_at"], name: "idx_audits_on_variant_and_date"
    t.index ["product_variant_id"], name: "index_inventory_audits_on_product_variant_id"
    t.index ["user_id", "created_at"], name: "idx_audits_on_user_and_date"
    t.index ["user_id"], name: "index_inventory_audits_on_user_id"
  end

  create_table "inventory_commitments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "order_id", null: false
    t.string "snapshot_digest", null: false
    t.datetime "updated_at", null: false
    t.index ["order_id"], name: "index_inventory_commitments_on_order_id", unique: true
  end

  create_table "inventory_reservations", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.jsonb "item_quantities", default: {}, null: false
    t.bigint "order_id", null: false
    t.bigint "pool_id", null: false
    t.string "pool_type", null: false
    t.integer "quantity", null: false
    t.jsonb "restored_quantities", default: {}, null: false
    t.string "state", default: "held", null: false
    t.datetime "updated_at", null: false
    t.index ["order_id", "pool_type", "pool_id"], name: "unique_order_inventory_pool", unique: true
    t.index ["order_id"], name: "index_inventory_reservations_on_order_id"
    t.index ["pool_type", "pool_id", "state", "expires_at"], name: "active_inventory_reservations"
    t.check_constraint "quantity > 0 AND (pool_type::text = ANY (ARRAY['Product'::character varying, 'ProductVariant'::character varying]::text[])) AND (state::text = ANY (ARRAY['held'::character varying, 'committed'::character varying, 'released'::character varying]::text[]))", name: "valid_inventory_reservation"
  end

  create_table "legacy_capture_bindings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "amount_cents", null: false
    t.string "consumption_reference", null: false
    t.datetime "created_at", null: false
    t.string "currency", null: false
    t.string "environment", null: false
    t.string "external_account_id", null: false
    t.bigint "order_id", null: false
    t.string "original_reference", null: false
    t.uuid "payment_identity_id", null: false
    t.string "provider", null: false
    t.datetime "updated_at", null: false
    t.datetime "verified_at", null: false
    t.index ["order_id"], name: "index_legacy_capture_bindings_on_order_id"
    t.index ["payment_identity_id"], name: "index_legacy_capture_bindings_on_payment_identity_id"
    t.index ["provider", "environment", "external_account_id", "consumption_reference"], name: "unique_legacy_capture_owner", unique: true
    t.check_constraint "amount_cents > 0 AND currency::text = 'USD'::text", name: "legacy_capture_positive_usd"
  end

  create_table "locations", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.string "address"
    t.string "admin_email"
    t.jsonb "admin_sms_phones", default: [], null: false
    t.datetime "created_at", null: false
    t.jsonb "hours_json", default: {}, null: false
    t.string "name", null: false
    t.string "phone"
    t.string "qr_code_url"
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.index ["active"], name: "index_locations_on_active"
    t.index ["slug"], name: "index_locations_on_slug", unique: true
  end

  create_table "order_items", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "order_id", null: false
    t.bigint "product_id"
    t.string "product_name"
    t.string "product_sku"
    t.bigint "product_variant_id"
    t.integer "quantity"
    t.text "special_instructions"
    t.integer "total_price_cents"
    t.integer "unit_price_cents"
    t.datetime "updated_at", null: false
    t.string "variant_name"
    t.index ["order_id"], name: "index_order_items_on_order_id"
    t.index ["product_id"], name: "index_order_items_on_product_id"
    t.index ["product_variant_id"], name: "index_order_items_on_product_variant_id"
  end

  create_table "orders", force: :cascade do |t|
    t.string "acai_crust_type"
    t.boolean "acai_include_placard"
    t.date "acai_pickup_date"
    t.string "acai_pickup_time"
    t.string "acai_placard_text"
    t.text "admin_notes"
    t.integer "cash_change_cents"
    t.integer "cash_received_cents"
    t.uuid "checkout_session_id"
    t.boolean "confirmation_email_sent", default: false, null: false
    t.boolean "confirmation_sms_sent", default: false, null: false
    t.datetime "created_at", null: false
    t.integer "created_by_user_id"
    t.string "customer_email"
    t.string "customer_name"
    t.string "customer_phone"
    t.string "easypost_shipment_id"
    t.string "fulfillment_type", default: "shipping", null: false
    t.bigint "fundraiser_id"
    t.string "guest_access_digest"
    t.datetime "guest_access_expires_at"
    t.uuid "inventory_commitment_id"
    t.datetime "inventory_committed_at"
    t.integer "last_email_seq", default: 0, null: false
    t.integer "last_sms_seq", default: 0, null: false
    t.bigint "location_id"
    t.jsonb "metadata", default: {}, null: false
    t.text "notes"
    t.string "order_number"
    t.string "order_type"
    t.bigint "participant_id"
    t.uuid "payment_attempt_id"
    t.string "payment_environment"
    t.uuid "payment_identity_id"
    t.string "payment_intent_id"
    t.jsonb "payment_metadata", default: {}, null: false
    t.string "payment_method"
    t.string "payment_provider"
    t.string "payment_reference"
    t.string "payment_session_id"
    t.jsonb "payment_snapshot", default: {}, null: false
    t.string "payment_status"
    t.string "shipping_address_line1"
    t.string "shipping_address_line2"
    t.string "shipping_city"
    t.integer "shipping_cost_cents"
    t.string "shipping_country"
    t.string "shipping_method"
    t.string "shipping_state"
    t.string "shipping_zip"
    t.boolean "simulated", default: false, null: false
    t.string "source", default: "online", null: false
    t.boolean "staff_created", default: false, null: false
    t.string "status"
    t.integer "subtotal_cents"
    t.integer "tax_cents"
    t.integer "total_cents"
    t.string "tracking_number"
    t.datetime "updated_at", null: false
    t.bigint "user_id"
    t.index ["checkout_session_id"], name: "index_orders_on_checkout_session_id", unique: true
    t.index ["created_at"], name: "index_orders_on_created_at"
    t.index ["customer_email"], name: "index_orders_on_customer_email"
    t.index ["fulfillment_type"], name: "index_orders_on_fulfillment_type"
    t.index ["fundraiser_id"], name: "index_orders_on_fundraiser_id"
    t.index ["inventory_commitment_id"], name: "index_orders_on_inventory_commitment_id", unique: true
    t.index ["location_id"], name: "index_orders_on_location_id"
    t.index ["order_number"], name: "index_orders_on_order_number", unique: true
    t.index ["order_type"], name: "index_orders_on_order_type"
    t.index ["participant_id"], name: "index_orders_on_participant_id"
    t.index ["payment_status"], name: "index_orders_on_payment_status"
    t.index ["source"], name: "index_orders_on_source"
    t.index ["staff_created"], name: "index_orders_on_staff_created"
    t.index ["status"], name: "index_orders_on_status"
    t.index ["user_id"], name: "index_orders_on_user_id"
  end

  create_table "pages", force: :cascade do |t|
    t.text "content"
    t.datetime "created_at", null: false
    t.text "meta_description"
    t.string "meta_title"
    t.boolean "published"
    t.string "slug"
    t.string "title"
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_pages_on_slug", unique: true
  end

  create_table "participants", force: :cascade do |t|
    t.boolean "active"
    t.datetime "created_at", null: false
    t.string "email"
    t.bigint "fundraiser_id", null: false
    t.integer "goal_amount_cents"
    t.string "name"
    t.text "notes"
    t.string "participant_number"
    t.string "phone"
    t.string "unique_code"
    t.datetime "updated_at", null: false
    t.index ["fundraiser_id"], name: "index_participants_on_fundraiser_id"
    t.index ["unique_code"], name: "index_participants_on_unique_code", unique: true
  end

  create_table "payment_attempts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "approved_cents", default: 0, null: false
    t.integer "captured_cents", default: 0, null: false
    t.uuid "checkout_session_id", null: false
    t.jsonb "collection_config", default: {}, null: false
    t.datetime "compensation_claimed_at"
    t.datetime "compensation_dispatched_at"
    t.datetime "compensation_lease_until"
    t.uuid "compensation_operation_key"
    t.string "compensation_provider_id"
    t.string "compensation_status"
    t.datetime "created_at", null: false
    t.string "currency", default: "USD", null: false
    t.datetime "dispatched_at"
    t.string "error_classification"
    t.string "hosted_url"
    t.string "last_error"
    t.datetime "last_queried_at"
    t.datetime "next_recovery_at"
    t.string "operation", default: "sale", null: false
    t.uuid "operation_key", default: -> { "gen_random_uuid()" }, null: false
    t.bigint "order_id", null: false
    t.string "payload_digest", null: false
    t.uuid "payment_identity_id", null: false
    t.jsonb "provider_metadata", default: {}, null: false
    t.string "raw_provider_id"
    t.integer "recovery_count", default: 0, null: false
    t.datetime "recovery_deadline_at"
    t.bigint "reference_number", null: false
    t.integer "requested_cents", null: false
    t.integer "retry_count", default: 0, null: false
    t.string "setup_id"
    t.jsonb "snapshot", default: {}, null: false
    t.string "state", default: "created", null: false
    t.datetime "updated_at", null: false
    t.index ["checkout_session_id"], name: "index_payment_attempts_on_checkout_session_id"
    t.index ["checkout_session_id"], name: "one_active_collection_per_session", unique: true, where: "(((operation)::text = 'sale'::text) AND ((state)::text <> ALL ((ARRAY['failed'::character varying, 'cancelled'::character varying, 'compensated'::character varying])::text[])))"
    t.index ["id", "order_id"], name: "index_payment_attempts_on_id_and_order_id", unique: true
    t.index ["next_recovery_at"], name: "index_payment_attempts_on_next_recovery_at"
    t.index ["order_id"], name: "index_payment_attempts_on_order_id"
    t.index ["payment_identity_id", "operation_key"], name: "idx_on_payment_identity_id_operation_key_7304b18f9d", unique: true
    t.index ["payment_identity_id", "raw_provider_id"], name: "idx_on_payment_identity_id_raw_provider_id_00e8d6929f", unique: true
    t.index ["payment_identity_id"], name: "index_payment_attempts_on_payment_identity_id"
    t.check_constraint "requested_cents > 0 AND approved_cents >= 0 AND captured_cents >= 0 AND captured_cents <= approved_cents AND approved_cents <= requested_cents", name: "payment_attempt_amount_bounds"
  end

  create_table "payment_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "environment", null: false
    t.string "external_account_id", null: false
    t.string "external_event_id", null: false
    t.jsonb "facts", default: {}, null: false
    t.string "payload_digest", null: false
    t.uuid "payment_identity_id"
    t.datetime "processed_at"
    t.string "provider", null: false
    t.datetime "updated_at", null: false
    t.index ["payment_identity_id"], name: "index_payment_events_on_payment_identity_id"
    t.index ["provider", "external_account_id", "environment", "external_event_id"], name: "unique_external_payment_event", unique: true
  end

  create_table "payment_identities", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "credential_reference", null: false
    t.string "currency", default: "USD", null: false
    t.string "environment", null: false
    t.string "external_acceptor_id"
    t.string "external_account_id", null: false
    t.string "profile_key", null: false
    t.string "provider", null: false
    t.datetime "updated_at", null: false
    t.index ["profile_key"], name: "index_payment_identities_on_profile_key", unique: true
    t.check_constraint "(provider::text = ANY (ARRAY['stripe'::character varying, 'worldpay'::character varying]::text[])) AND (environment::text = ANY (ARRAY['simulated'::character varying, 'sandbox'::character varying, 'production'::character varying]::text[])) AND currency::text = 'USD'::text", name: "valid_payment_identity"
  end

  create_table "payment_operation_numbers", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "payment_outboxes", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "delivered_at"
    t.string "effect_key", null: false
    t.string "kind", null: false
    t.string "last_error"
    t.uuid "lease_token"
    t.datetime "lease_until"
    t.datetime "next_attempt_at", default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.jsonb "payload", default: {}, null: false
    t.integer "retry_count", default: 0, null: false
    t.string "state", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.index ["effect_key"], name: "index_payment_outboxes_on_effect_key", unique: true
    t.index ["state", "next_attempt_at"], name: "index_payment_outboxes_on_state_and_next_attempt_at"
  end

  create_table "payment_profiles", force: :cascade do |t|
    t.jsonb "capabilities", default: {}, null: false
    t.string "channel", null: false
    t.datetime "created_at", null: false
    t.boolean "enabled", default: false, null: false
    t.bigint "location_id"
    t.uuid "payment_identity_id", null: false
    t.string "presentation", null: false
    t.string "provider", null: false
    t.datetime "updated_at", null: false
    t.index ["channel", "provider"], name: "one_enabled_default_payment_profile", unique: true, where: "(enabled AND (location_id IS NULL))"
    t.index ["location_id", "channel", "provider"], name: "one_enabled_payment_profile_per_location_channel", unique: true, where: "enabled"
    t.index ["location_id"], name: "index_payment_profiles_on_location_id"
    t.index ["payment_identity_id"], name: "index_payment_profiles_on_payment_identity_id"
  end

  create_table "payment_terminals", force: :cascade do |t|
    t.jsonb "configuration", default: {}, null: false
    t.datetime "created_at", null: false
    t.string "label", null: false
    t.string "lane_id", null: false
    t.datetime "leased_at"
    t.uuid "leased_attempt_id"
    t.bigint "location_id", null: false
    t.uuid "payment_identity_id", null: false
    t.datetime "retired_at"
    t.string "status", default: "ready", null: false
    t.string "terminal_id", null: false
    t.datetime "updated_at", null: false
    t.index ["leased_attempt_id"], name: "index_payment_terminals_on_leased_attempt_id"
    t.index ["location_id"], name: "index_payment_terminals_on_location_id"
    t.index ["payment_identity_id", "lane_id"], name: "index_payment_terminals_on_payment_identity_id_and_lane_id", unique: true
    t.index ["payment_identity_id"], name: "index_payment_terminals_on_payment_identity_id"
  end

  create_table "payment_transactions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "amount_cents", null: false
    t.datetime "created_at", null: false
    t.string "currency", null: false
    t.datetime "first_observed_at", null: false
    t.datetime "last_observed_at", null: false
    t.jsonb "metadata", default: {}, null: false
    t.bigint "order_id"
    t.uuid "payment_attempt_id", null: false
    t.uuid "payment_identity_id", null: false
    t.string "provider", null: false
    t.string "raw_provider_id", null: false
    t.string "reference", null: false
    t.string "settlement_state", default: "unknown", null: false
    t.string "state", null: false
    t.datetime "updated_at", null: false
    t.index ["order_id"], name: "index_payment_transactions_on_order_id"
    t.index ["order_id"], name: "one_consumed_charge_per_order", unique: true, where: "(order_id IS NOT NULL)"
    t.index ["payment_attempt_id"], name: "index_payment_transactions_on_payment_attempt_id"
    t.index ["payment_identity_id", "raw_provider_id"], name: "unique_identity_transaction", unique: true
    t.index ["payment_identity_id"], name: "index_payment_transactions_on_payment_identity_id"
    t.index ["provider", "reference"], name: "index_payment_transactions_on_provider_and_reference", unique: true
    t.check_constraint "amount_cents > 0", name: "transaction_positive_amount"
  end

  create_table "product_collections", force: :cascade do |t|
    t.bigint "collection_id", null: false
    t.datetime "created_at", null: false
    t.integer "position"
    t.bigint "product_id", null: false
    t.datetime "updated_at", null: false
    t.index ["collection_id"], name: "index_product_collections_on_collection_id"
    t.index ["product_id"], name: "index_product_collections_on_product_id"
  end

  create_table "product_images", force: :cascade do |t|
    t.string "alt_text"
    t.datetime "created_at", null: false
    t.integer "position"
    t.boolean "primary"
    t.bigint "product_id", null: false
    t.string "s3_key"
    t.string "shopify_image_id"
    t.datetime "updated_at", null: false
    t.string "url"
    t.index ["product_id"], name: "index_product_images_on_product_id"
  end

  create_table "product_locations", force: :cascade do |t|
    t.boolean "available", default: true, null: false
    t.datetime "created_at", null: false
    t.bigint "location_id", null: false
    t.integer "price_override_cents"
    t.bigint "product_id", null: false
    t.datetime "updated_at", null: false
    t.index ["available"], name: "index_product_locations_on_available"
    t.index ["location_id"], name: "index_product_locations_on_location_id"
    t.index ["product_id", "location_id"], name: "index_product_locations_on_product_id_and_location_id", unique: true
    t.index ["product_id"], name: "index_product_locations_on_product_id"
  end

  create_table "product_variants", force: :cascade do |t|
    t.boolean "available"
    t.string "barcode"
    t.string "color"
    t.integer "compare_at_price_cents"
    t.integer "cost_cents"
    t.datetime "created_at", null: false
    t.boolean "is_default", default: false, null: false
    t.integer "low_stock_threshold", default: 5, null: false
    t.string "material"
    t.jsonb "options", default: {}, null: false
    t.integer "price_cents"
    t.bigint "product_id", null: false
    t.string "shopify_variant_id"
    t.string "size"
    t.string "sku"
    t.integer "stock_quantity"
    t.datetime "updated_at", null: false
    t.string "variant_key"
    t.string "variant_name"
    t.decimal "weight_oz"
    t.index ["options"], name: "index_product_variants_on_options", using: :gin
    t.index ["product_id", "is_default"], name: "index_product_variants_on_product_id_and_is_default"
    t.index ["product_id"], name: "index_product_variants_on_product_id"
    t.index ["sku"], name: "index_product_variants_on_sku", unique: true
  end

  create_table "products", force: :cascade do |t|
    t.boolean "allow_pickup", default: true, null: false
    t.boolean "allow_shipping", default: false, null: false
    t.boolean "archived", default: false, null: false
    t.integer "base_price_cents"
    t.datetime "created_at", null: false
    t.text "description"
    t.boolean "featured"
    t.text "import_notes"
    t.string "inventory_level", default: "none", null: false
    t.text "meta_description"
    t.string "meta_title"
    t.string "name"
    t.boolean "needs_attention", default: false, null: false
    t.boolean "new_product", default: false, null: false
    t.integer "product_low_stock_threshold", default: 5
    t.integer "product_stock_quantity"
    t.string "product_type"
    t.boolean "published", default: true
    t.integer "sale_price_cents"
    t.string "shopify_product_id"
    t.string "sku_prefix"
    t.string "slug"
    t.boolean "track_inventory"
    t.datetime "updated_at", null: false
    t.string "vendor"
    t.decimal "weight_oz"
    t.index ["allow_pickup"], name: "index_products_on_allow_pickup"
    t.index ["allow_shipping"], name: "index_products_on_allow_shipping"
    t.index ["archived"], name: "index_products_on_archived"
    t.index ["slug"], name: "index_products_on_slug", unique: true
  end

  create_table "refund_effects", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "delivered_at"
    t.string "kind", null: false
    t.jsonb "payload", default: {}, null: false
    t.uuid "refund_operation_id", null: false
    t.datetime "updated_at", null: false
    t.index ["refund_operation_id", "kind"], name: "index_refund_effects_on_refund_operation_id_and_kind", unique: true
    t.index ["refund_operation_id"], name: "index_refund_effects_on_refund_operation_id"
  end

  create_table "refund_observations", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "event_key", null: false
    t.string "observed_state", null: false
    t.string "payload_digest", null: false
    t.uuid "refund_operation_id", null: false
    t.datetime "updated_at", null: false
    t.index ["refund_operation_id", "event_key"], name: "unique_refund_observation", unique: true
    t.index ["refund_operation_id"], name: "index_refund_observations_on_refund_operation_id"
  end

  create_table "refund_operations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "amount_cents", null: false
    t.string "caller_idempotency_key", null: false
    t.integer "captured_cents", null: false
    t.datetime "created_at", null: false
    t.string "currency", null: false
    t.datetime "dispatched_at"
    t.string "environment", null: false
    t.string "kind", default: "return", null: false
    t.string "last_error"
    t.datetime "last_queried_at"
    t.jsonb "metadata", default: {}, null: false
    t.datetime "next_recovery_at"
    t.uuid "operation_key", default: -> { "gen_random_uuid()" }, null: false
    t.bigint "order_id", null: false
    t.uuid "original_charge_id"
    t.string "original_reference", null: false
    t.string "payload_digest", null: false
    t.uuid "payment_attempt_id"
    t.uuid "payment_identity_id"
    t.string "provider", null: false
    t.string "raw_provider_id"
    t.string "reason"
    t.datetime "recovery_deadline_at"
    t.bigint "reference_number", null: false
    t.jsonb "restoration_request", default: {}, null: false
    t.integer "retry_count", default: 0, null: false
    t.string "state", default: "reserved", null: false
    t.datetime "succeeded_at"
    t.datetime "updated_at", null: false
    t.bigint "user_id"
    t.index ["operation_key"], name: "index_refund_operations_on_operation_key", unique: true
    t.index ["order_id", "caller_idempotency_key"], name: "unique_refund_request", unique: true
    t.index ["order_id"], name: "index_refund_operations_on_order_id"
    t.index ["original_charge_id"], name: "index_refund_operations_on_original_charge_id"
    t.index ["payment_attempt_id"], name: "index_refund_operations_on_payment_attempt_id"
    t.index ["payment_identity_id", "raw_provider_id"], name: "unique_identity_refund", unique: true
    t.index ["payment_identity_id"], name: "index_refund_operations_on_payment_identity_id"
    t.index ["state", "next_recovery_at"], name: "index_refund_operations_on_state_and_next_recovery_at"
    t.index ["user_id"], name: "index_refund_operations_on_user_id"
    t.check_constraint "(kind::text = ANY (ARRAY['return'::character varying, 'void'::character varying, 'reversal'::character varying]::text[])) AND (state::text = ANY (ARRAY['reserved'::character varying, 'dispatching'::character varying, 'pending'::character varying, 'unknown'::character varying, 'succeeded'::character varying, 'failed'::character varying]::text[]))", name: "refund_valid_state_kind"
    t.check_constraint "amount_cents > 0 AND captured_cents >= amount_cents", name: "refund_positive_bounded_amount"
    t.check_constraint "currency::text = 'USD'::text AND (environment::text = ANY (ARRAY['simulated'::character varying, 'sandbox'::character varying, 'production'::character varying]::text[])) AND (provider::text = 'cash'::text AND payment_identity_id IS NULL AND payment_attempt_id IS NULL AND original_charge_id IS NULL OR (provider::text = ANY (ARRAY['stripe'::character varying, 'worldpay'::character varying]::text[])) AND payment_identity_id IS NOT NULL)", name: "refund_identity_authority"
  end

  create_table "refunds", force: :cascade do |t|
    t.integer "amount_cents", null: false
    t.datetime "created_at", null: false
    t.boolean "email_sent", default: false, null: false
    t.jsonb "metadata", default: {}
    t.text "notes"
    t.bigint "order_id", null: false
    t.string "reason"
    t.uuid "refund_operation_id"
    t.boolean "sms_sent", default: false, null: false
    t.string "status", default: "pending"
    t.string "stripe_refund_id"
    t.datetime "updated_at", null: false
    t.bigint "user_id"
    t.index ["order_id"], name: "index_refunds_on_order_id"
    t.index ["refund_operation_id"], name: "index_refunds_on_refund_operation_id", unique: true
    t.index ["status"], name: "index_refunds_on_status"
    t.index ["stripe_refund_id"], name: "index_refunds_on_stripe_refund_id"
    t.index ["user_id"], name: "index_refunds_on_user_id"
  end

  create_table "rejected_payment_requests", force: :cascade do |t|
    t.string "caller_idempotency_key", null: false
    t.datetime "created_at", null: false
    t.string "owner_key", null: false
    t.string "payload_digest", null: false
    t.string "reason", null: false
    t.datetime "updated_at", null: false
    t.index ["owner_key", "caller_idempotency_key"], name: "unique_rejected_payment_request", unique: true
  end

  create_table "simulated_payment_records", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "amount_cents", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at"
    t.jsonb "facts", default: {}, null: false
    t.string "handle_digest"
    t.string "kind", null: false
    t.string "operation_key", null: false
    t.string "original_reference"
    t.string "payload_digest", null: false
    t.uuid "payment_attempt_id"
    t.uuid "payment_identity_id", null: false
    t.string "raw_id", null: false
    t.datetime "redeemed_at"
    t.string "scenario", default: "approve", null: false
    t.string "state", default: "collecting", null: false
    t.datetime "updated_at", null: false
    t.index ["payment_attempt_id"], name: "index_simulated_payment_records_on_payment_attempt_id"
    t.index ["payment_identity_id", "operation_key"], name: "simulation_operation_identity", unique: true
    t.index ["payment_identity_id", "raw_id"], name: "simulation_raw_identity", unique: true
    t.index ["payment_identity_id"], name: "index_simulated_payment_records_on_payment_identity_id"
  end

  create_table "simulation_clocks", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "now", null: false
    t.uuid "payment_identity_id", null: false
    t.datetime "updated_at", null: false
    t.index ["payment_identity_id"], name: "index_simulation_clocks_on_payment_identity_id", unique: true
  end

  create_table "site_settings", force: :cascade do |t|
    t.string "acai_gallery_heading"
    t.string "acai_gallery_image_a_url"
    t.string "acai_gallery_image_b_url"
    t.boolean "acai_gallery_show_image_a", default: true, null: false
    t.boolean "acai_gallery_show_image_b", default: true, null: false
    t.string "acai_gallery_subtext"
    t.jsonb "admin_sms_phones", default: [], null: false
    t.boolean "announcement_enabled", default: false, null: false
    t.string "announcement_style", default: "gold", null: false
    t.string "announcement_text"
    t.datetime "created_at", null: false
    t.boolean "enable_admin_sms", default: true, null: false
    t.boolean "enable_order_emails", default: true, null: false
    t.boolean "enable_order_sms", default: true, null: false
    t.boolean "enable_storefront_catering", default: true, null: false
    t.boolean "enable_storefront_latte_stone", default: false, null: false
    t.boolean "enable_storefront_three_squares", default: true, null: false
    t.jsonb "fallback_shipping_rates", default: {"domestic"=>[{"rate_cents"=>800, "max_weight_oz"=>16}, {"rate_cents"=>1500, "max_weight_oz"=>48}, {"rate_cents"=>2000, "max_weight_oz"=>80}, {"rate_cents"=>3000, "max_weight_oz"=>160}, {"rate_cents"=>5000, "max_weight_oz"=>nil}], "international"=>[{"rate_cents"=>2500, "max_weight_oz"=>16}, {"rate_cents"=>4000, "max_weight_oz"=>48}, {"rate_cents"=>6000, "max_weight_oz"=>80}, {"rate_cents"=>9000, "max_weight_oz"=>160}, {"rate_cents"=>15000, "max_weight_oz"=>nil}]}, null: false
    t.text "order_notification_emails", default: [], array: true
    t.string "payment_processor", default: "stripe", null: false
    t.boolean "payment_test_mode", default: true, null: false
    t.string "placeholder_image_url"
    t.boolean "send_acai_emails", default: false, null: false
    t.boolean "send_customer_emails", default: false, null: false
    t.boolean "send_retail_emails", default: false, null: false
    t.boolean "send_wholesale_emails", default: false, null: false
    t.jsonb "shipping_origin_address", default: {}
    t.string "store_email"
    t.string "store_name", default: "Hafaloha"
    t.string "store_phone"
    t.datetime "updated_at", null: false
  end

  create_table "users", force: :cascade do |t|
    t.bigint "assigned_location_id"
    t.string "clerk_id"
    t.datetime "created_at", null: false
    t.string "email"
    t.string "name"
    t.string "phone"
    t.string "role"
    t.datetime "updated_at", null: false
    t.index ["assigned_location_id"], name: "index_users_on_assigned_location_id"
    t.index ["clerk_id"], name: "index_users_on_clerk_id", unique: true
    t.index ["email"], name: "index_users_on_email"
    t.index ["role"], name: "index_users_on_role"
  end

  create_table "variant_presets", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "description"
    t.string "name", null: false
    t.string "option_type", null: false
    t.integer "position", default: 0, null: false
    t.datetime "updated_at", null: false
    t.jsonb "values", default: [], null: false
    t.index ["name"], name: "index_variant_presets_on_name", unique: true
    t.index ["option_type"], name: "index_variant_presets_on_option_type"
    t.index ["position"], name: "index_variant_presets_on_position"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "admin_devices", "locations"
  add_foreign_key "admin_devices", "users"
  add_foreign_key "admin_push_subscriptions", "admin_devices"
  add_foreign_key "cart_items", "product_variants"
  add_foreign_key "cart_items", "users"
  add_foreign_key "catering_inquiries", "users", column: "responded_by_id"
  add_foreign_key "checkout_sessions", "locations"
  add_foreign_key "checkout_sessions", "orders"
  add_foreign_key "checkout_sessions", "payment_identities"
  add_foreign_key "checkout_sessions", "users"
  add_foreign_key "fundraiser_order_items", "fundraiser_orders"
  add_foreign_key "fundraiser_order_items", "fundraiser_product_variants"
  add_foreign_key "fundraiser_orders", "fundraisers"
  add_foreign_key "fundraiser_orders", "participants"
  add_foreign_key "fundraiser_product_images", "fundraiser_products"
  add_foreign_key "fundraiser_product_variants", "fundraiser_products"
  add_foreign_key "fundraiser_products", "fundraisers"
  add_foreign_key "imports", "users"
  add_foreign_key "inventory_audits", "orders"
  add_foreign_key "inventory_audits", "product_variants"
  add_foreign_key "inventory_audits", "products"
  add_foreign_key "inventory_audits", "users"
  add_foreign_key "inventory_commitments", "orders"
  add_foreign_key "inventory_reservations", "orders"
  add_foreign_key "legacy_capture_bindings", "orders"
  add_foreign_key "legacy_capture_bindings", "payment_identities"
  add_foreign_key "order_items", "orders"
  add_foreign_key "order_items", "product_variants"
  add_foreign_key "order_items", "products"
  add_foreign_key "orders", "checkout_sessions"
  add_foreign_key "orders", "fundraisers"
  add_foreign_key "orders", "locations"
  add_foreign_key "orders", "participants"
  add_foreign_key "orders", "payment_attempts"
  add_foreign_key "orders", "payment_identities"
  add_foreign_key "orders", "users"
  add_foreign_key "participants", "fundraisers"
  add_foreign_key "payment_attempts", "checkout_sessions"
  add_foreign_key "payment_attempts", "orders"
  add_foreign_key "payment_attempts", "payment_identities"
  add_foreign_key "payment_events", "payment_identities"
  add_foreign_key "payment_profiles", "locations"
  add_foreign_key "payment_profiles", "payment_identities"
  add_foreign_key "payment_terminals", "locations"
  add_foreign_key "payment_terminals", "payment_attempts", column: "leased_attempt_id"
  add_foreign_key "payment_terminals", "payment_identities"
  add_foreign_key "payment_transactions", "orders"
  add_foreign_key "payment_transactions", "payment_attempts"
  add_foreign_key "payment_transactions", "payment_attempts", column: ["payment_attempt_id", "order_id"], primary_key: ["id", "order_id"], name: "charge_consumption_matches_original_order"
  add_foreign_key "payment_transactions", "payment_identities"
  add_foreign_key "product_collections", "collections"
  add_foreign_key "product_collections", "products"
  add_foreign_key "product_images", "products"
  add_foreign_key "product_locations", "locations"
  add_foreign_key "product_locations", "products"
  add_foreign_key "product_variants", "products"
  add_foreign_key "refund_effects", "refund_operations"
  add_foreign_key "refund_observations", "refund_operations"
  add_foreign_key "refund_operations", "orders"
  add_foreign_key "refund_operations", "payment_attempts"
  add_foreign_key "refund_operations", "payment_identities"
  add_foreign_key "refund_operations", "payment_transactions", column: "original_charge_id"
  add_foreign_key "refund_operations", "users"
  add_foreign_key "refunds", "orders"
  add_foreign_key "refunds", "refund_operations"
  add_foreign_key "refunds", "users"
  add_foreign_key "simulated_payment_records", "payment_attempts"
  add_foreign_key "simulated_payment_records", "payment_identities"
  add_foreign_key "simulation_clocks", "payment_identities"
  add_foreign_key "users", "locations", column: "assigned_location_id"
end
