module Api
  module V1
    module Admin
      class ImportsController < BaseController
        before_action :require_owner!

        # GET /api/v1/admin/imports
        def index
          imports = current_user.admin? ? Import.all : current_user.imports
          imports = imports.recent.limit(50)

          # Auto-fail stale processing imports (server restarted, job halted, etc.)
          imports.each { |imp| imp.mark_stale_processing! }

          render json: {
            data: imports.map { |import| serialize_import(import) }
          }
        end

        # GET /api/v1/admin/imports/:id
        def show
          import = Import.find(params[:id])

          # Auto-fail stale processing imports (server restarted, job halted, etc.)
          import.mark_stale_processing!

          render json: {
            data: serialize_import_full(import)
          }
        end

        # POST /api/v1/admin/imports
        def create
          unless params[:products_file].present?
            return render json: { error: "Products CSV file is required" }, status: :unprocessable_entity
          end

          # Save uploaded files temporarily
          products_file = params[:products_file]
          products_path = save_temp_file(products_file, "products")

          inventory_path = nil
          if params[:inventory_file].present?
            inventory_file = params[:inventory_file]
            inventory_path = save_temp_file(inventory_file, "inventory")
          end

          # Create import record
          import = current_user.imports.create!(
            status: "pending",
            filename: products_file.original_filename,
            inventory_filename: params[:inventory_file]&.original_filename
          )

          # Queue background job
          ProcessImportJob.perform_later(import.id, products_path, inventory_path)

          Rails.logger.info "📤 Import ##{import.id} queued by #{current_user.email}"

          render json: {
            data: serialize_import(import),
            message: "Import started successfully"
          }, status: :created

        rescue => e
          Rails.logger.error "❌ Import creation failed: #{e.message}"
          render json: { error: e.message }, status: :unprocessable_entity
        end

        private

        def save_temp_file(uploaded_file, prefix)
          temp_path = Rails.root.join("tmp", "#{prefix}_#{Time.current.to_i}_#{uploaded_file.original_filename}")
          File.open(temp_path, "wb") do |file|
            file.write(uploaded_file.read)
          end
          temp_path.to_s
        end

        def serialize_import(import)
          {
            id: import.id,
            status: import.status,
            filename: import.filename,
            inventory_filename: import.inventory_filename,
            products_count: import.products_count,
            variants_count: import.variants_count,
            variants_skipped_count: import.variants_skipped_count || 0,
            images_count: import.images_count,
            collections_count: import.collections_count,
            skipped_count: import.skipped_count,
            total_products: import.total_products || 0,
            processed_products: import.processed_products || 0,
            progress_percent: import.progress_percent || 0,
            current_step: import.current_step,
            eta_seconds: import.eta_seconds,
            started_at: import.started_at,
            completed_at: import.completed_at,
            duration: import.duration,
            created_at: import.created_at,
            user: {
              id: import.user.id,
              name: import.user.name,
              email: import.user.email
            }
          }
        end

        def serialize_import_full(import)
          serialize_import(import).merge(
            warnings: import.warnings&.split("\n") || [],
            error_messages: import.error_messages
          )
        end
      end
    end
  end
end
