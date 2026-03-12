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

ActiveRecord::Schema[8.1].define(version: 2026_03_11_214656) do
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

  create_table "collections", force: :cascade do |t|
    t.boolean "auto_hide", default: false, null: false
    t.string "banner_text"
    t.string "business_line", default: "three_squares", null: false
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
    t.index ["business_line"], name: "index_collections_on_business_line"
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

  create_table "locations", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.string "address"
    t.string "admin_email"
    t.jsonb "admin_sms_phones", default: [], null: false
    t.boolean "auto_deactivate", default: false, null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.datetime "ends_at"
    t.jsonb "hours_json", default: {}, null: false
    t.string "location_type", default: "permanent", null: false
    t.bigint "menu_collection_id"
    t.string "name", null: false
    t.string "phone"
    t.string "qr_code_url"
    t.string "slug", null: false
    t.datetime "starts_at"
    t.datetime "updated_at", null: false
    t.index ["active", "location_type"], name: "index_locations_on_active_and_location_type"
    t.index ["active"], name: "index_locations_on_active"
    t.index ["location_type"], name: "index_locations_on_location_type"
    t.index ["menu_collection_id"], name: "index_locations_on_menu_collection_id"
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
    t.integer "last_email_seq", default: 0, null: false
    t.integer "last_sms_seq", default: 0, null: false
    t.bigint "location_id"
    t.jsonb "metadata", default: {}, null: false
    t.text "notes"
    t.string "order_number"
    t.string "order_type"
    t.bigint "participant_id"
    t.string "payment_intent_id"
    t.string "payment_method"
    t.string "payment_status"
    t.boolean "refund_email_sent", default: false, null: false
    t.boolean "refund_sms_sent", default: false, null: false
    t.string "shipping_address_line1"
    t.string "shipping_address_line2"
    t.string "shipping_city"
    t.integer "shipping_cost_cents"
    t.string "shipping_country"
    t.string "shipping_method"
    t.string "shipping_state"
    t.string "shipping_zip"
    t.string "source", default: "online", null: false
    t.boolean "staff_created", default: false, null: false
    t.string "status"
    t.integer "subtotal_cents"
    t.integer "tax_cents"
    t.integer "total_cents"
    t.string "tracking_number"
    t.datetime "updated_at", null: false
    t.bigint "user_id"
    t.index ["created_at"], name: "index_orders_on_created_at"
    t.index ["customer_email"], name: "index_orders_on_customer_email"
    t.index ["fulfillment_type"], name: "index_orders_on_fulfillment_type"
    t.index ["fundraiser_id"], name: "index_orders_on_fundraiser_id"
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
    t.string "business_line", default: "three_squares", null: false
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
    t.index ["business_line"], name: "index_products_on_business_line"
    t.index ["slug"], name: "index_products_on_slug", unique: true
  end

  create_table "refunds", force: :cascade do |t|
    t.integer "amount_cents", null: false
    t.datetime "created_at", null: false
    t.boolean "email_sent", default: false, null: false
    t.jsonb "metadata", default: {}
    t.text "notes"
    t.bigint "order_id", null: false
    t.string "reason"
    t.boolean "sms_sent", default: false, null: false
    t.string "status", default: "pending"
    t.string "stripe_refund_id"
    t.datetime "updated_at", null: false
    t.bigint "user_id"
    t.index ["order_id"], name: "index_refunds_on_order_id"
    t.index ["status"], name: "index_refunds_on_status"
    t.index ["stripe_refund_id"], name: "index_refunds_on_stripe_refund_id", unique: true
    t.index ["user_id"], name: "index_refunds_on_user_id"
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
  add_foreign_key "cart_items", "product_variants"
  add_foreign_key "cart_items", "users"
  add_foreign_key "catering_inquiries", "users", column: "responded_by_id"
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
  add_foreign_key "locations", "collections", column: "menu_collection_id"
  add_foreign_key "order_items", "orders"
  add_foreign_key "order_items", "product_variants"
  add_foreign_key "order_items", "products"
  add_foreign_key "orders", "fundraisers"
  add_foreign_key "orders", "locations"
  add_foreign_key "orders", "participants"
  add_foreign_key "orders", "users"
  add_foreign_key "participants", "fundraisers"
  add_foreign_key "product_collections", "collections"
  add_foreign_key "product_collections", "products"
  add_foreign_key "product_images", "products"
  add_foreign_key "product_locations", "locations"
  add_foreign_key "product_locations", "products"
  add_foreign_key "product_variants", "products"
  add_foreign_key "refunds", "orders"
  add_foreign_key "refunds", "users"
  add_foreign_key "users", "locations", column: "assigned_location_id"
end
