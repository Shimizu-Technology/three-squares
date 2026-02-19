module Api
  module V1
    module Admin
      class VariantPresetsController < ApplicationController
        include Authenticatable
        before_action :require_owner!
        before_action :set_preset, only: [ :show, :update, :destroy, :duplicate ]

        # GET /api/v1/admin/variant_presets
        def index
          presets = VariantPreset.by_position

          # Group by option type for easier frontend consumption
          grouped = presets.group_by(&:option_type)

          render json: {
            success: true,
            data: {
              presets: presets.map { |p| preset_json(p) },
              grouped_by_type: grouped.transform_values { |ps| ps.map { |p| preset_json(p) } },
              option_types: grouped.keys.sort
            }
          }
        end

        # GET /api/v1/admin/variant_presets/:id
        def show
          render json: {
            success: true,
            data: preset_json(@preset)
          }
        end

        # POST /api/v1/admin/variant_presets
        def create
          preset = VariantPreset.new(preset_params)

          if preset.save
            render json: {
              success: true,
              message: "Preset '#{preset.name}' created successfully",
              data: preset_json(preset)
            }, status: :created
          else
            render json: {
              success: false,
              error: preset.errors.full_messages.join(", ")
            }, status: :unprocessable_entity
          end
        end

        # PATCH /api/v1/admin/variant_presets/:id
        def update
          if @preset.update(preset_params)
            render json: {
              success: true,
              message: "Preset '#{@preset.name}' updated successfully",
              data: preset_json(@preset)
            }
          else
            render json: {
              success: false,
              error: @preset.errors.full_messages.join(", ")
            }, status: :unprocessable_entity
          end
        end

        # DELETE /api/v1/admin/variant_presets/:id
        def destroy
          name = @preset.name
          @preset.destroy!

          render json: {
            success: true,
            message: "Preset '#{name}' deleted successfully"
          }
        end

        # POST /api/v1/admin/variant_presets/:id/duplicate
        def duplicate
          new_name = params[:name] || "#{@preset.name} (Copy)"

          # Check for duplicate name
          if VariantPreset.exists?(name: new_name)
            suffix = 1
            while VariantPreset.exists?(name: "#{new_name} #{suffix}")
              suffix += 1
            end
            new_name = "#{new_name} #{suffix}"
          end

          new_preset = @preset.duplicate!(new_name)

          render json: {
            success: true,
            message: "Preset duplicated as '#{new_preset.name}'",
            data: preset_json(new_preset)
          }, status: :created
        end

        private

        def set_preset
          @preset = VariantPreset.find(params[:id])
        rescue ActiveRecord::RecordNotFound
          render json: {
            success: false,
            error: "Preset not found"
          }, status: :not_found
        end

        def preset_params
          permitted = params.require(:variant_preset).permit(
            :name,
            :description,
            :option_type,
            :position,
            values: [ :name, :price_adjustment_cents ]
          )

          # Normalize values to plain hashes for JSONB storage
          if permitted[:values].present?
            permitted[:values] = permitted[:values].map do |v|
              if v.respond_to?(:to_unsafe_h)
                v.to_unsafe_h
              elsif v.respond_to?(:to_h)
                v.to_h
              else
                v
              end
            end
          end

          permitted
        end

        def preset_json(preset)
          {
            id: preset.id,
            name: preset.name,
            description: preset.description,
            option_type: preset.option_type,
            position: preset.position,
            values: preset.values,
            values_count: preset.values.length,
            value_names: preset.value_names,
            created_at: preset.created_at,
            updated_at: preset.updated_at
          }
        end
      end
    end
  end
end
