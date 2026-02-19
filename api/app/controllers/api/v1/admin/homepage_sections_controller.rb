# frozen_string_literal: true

module Api
  module V1
    module Admin
      class HomepageSectionsController < ApplicationController
        include Authenticatable
        before_action :authenticate_request
        before_action :require_owner!
        before_action :set_section, only: %i[show update destroy]

        def index
          sections = HomepageSection.ordered

          render json: {
            sections: sections.map { |s| section_json(s) },
            section_types: HomepageSection::SECTION_TYPES
          }
        end

        def show
          render json: { section: section_json(@section) }
        end

        def create
          section = HomepageSection.new(section_params)

          if section.save
            render json: { section: section_json(section) }, status: :created
          else
            render json: { errors: section.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def update
          if @section.update(section_params)
            render json: { section: section_json(@section) }
          else
            render json: { errors: @section.errors.full_messages }, status: :unprocessable_entity
          end
        end

        def destroy
          @section.destroy
          head :no_content
        end

        # Bulk update positions
        def reorder
          sections_data = params[:sections]

          if sections_data.blank?
            return render json: { error: "Missing 'sections' parameter. Expected: [{id: 1, position: 0}, ...]" },
                          status: :unprocessable_entity

          end

          begin
            ActiveRecord::Base.transaction do
              sections_data.each do |section_data|
                section = HomepageSection.find(section_data[:id])
                section.update!(position: section_data[:position])
              end
            end

            render json: { success: true }
          rescue ActiveRecord::RecordNotFound, ActiveRecord::RecordInvalid => e
            render json: { error: e.message }, status: :unprocessable_entity
          end
        end

        private

        def set_section
          @section = HomepageSection.find(params[:id])
        end

        def section_params
          key = if params.key?(:section)
                  :section
          elsif params.key?(:homepage_section)
                  :homepage_section
          else
                  :section
          end

          params.require(key).permit(
            :section_type,
            :position,
            :active,
            :title,
            :subtitle,
            :button_text,
            :button_link,
            :image_url,
            :background_image_url,
            settings: {}
          )
        end

        def section_json(section)
          {
            id: section.id,
            section_type: section.section_type,
            position: section.position,
            title: section.title,
            subtitle: section.subtitle,
            button_text: section.button_text,
            button_link: section.button_link,
            image_url: section.image_url,
            background_image_url: section.background_image_url,
            settings: section.settings,
            active: section.active,
            created_at: section.created_at,
            updated_at: section.updated_at
          }
        end
      end
    end
  end
end
