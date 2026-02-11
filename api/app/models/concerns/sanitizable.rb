# frozen_string_literal: true

require "cgi"

# Strips dangerous HTML/script tags from text fields before saving.
# Include in any model with user-facing text fields.
#
# Usage:
#   class Product < ApplicationRecord
#     include Sanitizable
#     sanitize_fields :name, :description, :meta_title, :meta_description
#   end
module Sanitizable
  extend ActiveSupport::Concern

  included do
    class_attribute :_sanitizable_fields, default: []
    before_save :sanitize_text_fields
  end

  class_methods do
    # Declare which fields should be sanitized
    def sanitize_fields(*fields)
      self._sanitizable_fields = fields.map(&:to_sym)
    end
  end

  private

  def sanitize_text_fields
    self.class._sanitizable_fields.each do |field|
      value = send(field)
      next if value.blank?

      # Strip all HTML tags (including <script>, <iframe>, event handlers, etc.)
      clean = ActionController::Base.helpers.sanitize(value, tags: [], attributes: [])
      # Also collapse any leftover whitespace from stripped tags
      clean = clean.gsub(/\s+/, " ").strip
      # Decode HTML entities (e.g., &amp; -> &) since we're storing plain text
      clean = CGI.unescapeHTML(clean)
      send("#{field}=", clean)
    end
  end
end
