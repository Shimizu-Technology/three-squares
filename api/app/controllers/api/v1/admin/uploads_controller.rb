module Api
  module V1
    module Admin
      class UploadsController < BaseController
        before_action :require_owner!

        # POST /api/v1/admin/uploads
        # Upload a file and return the signed URL
        def create
          unless params[:file].present?
            return render_error("No file provided", status: :bad_request)
          end

          file = params[:file]

          # Validate file type
          allowed_types = [ "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp" ]
          unless allowed_types.include?(file.content_type)
            return render_error("Invalid file type. Only images are allowed.", status: :unprocessable_entity)
          end

          # Validate file size (max 10MB)
          max_size = 10.megabytes
          if file.size > max_size
            return render_error("File too large. Maximum size is #{max_size / 1.megabyte}MB.", status: :unprocessable_entity)
          end

          # Upload to Active Storage
          blob = ActiveStorage::Blob.create_and_upload!(
            io: file.tempfile,
            filename: sanitize_filename(file.original_filename),
            content_type: file.content_type
          )

          # Return the S3 key (permanent identifier) instead of a signed URL
          # The frontend will store this key, and we'll generate signed URLs on-demand when serving
          render_success({
            id: blob.id,
            filename: blob.filename.to_s,
            content_type: blob.content_type,
            byte_size: blob.byte_size,
            s3_key: blob.key,  # The permanent S3 key
            signed_id: blob.signed_id
          }, message: "File uploaded successfully")
        end

        # DELETE /api/v1/admin/uploads/:id
        def destroy
          blob = ActiveStorage::Blob.find(params[:id])
          blob.purge

          render_success(nil, message: "File deleted successfully")
        rescue ActiveRecord::RecordNotFound
          render_not_found("File not found")
        end

        private

        def sanitize_filename(filename)
          # Remove any non-alphanumeric characters except dots, dashes, and underscores
          name = File.basename(filename, ".*")
          ext = File.extname(filename)

          # Replace spaces and special characters
          name = name.gsub(/[^0-9A-Za-z.\-_]/, "_")

          # Add timestamp to avoid conflicts
          timestamp = Time.current.to_i

          "#{name}_#{timestamp}#{ext}"
        end
      end
    end
  end
end
