class MenuEligibility
  # Unscheduled regular associations preserve availability for shared products.
  # Publication only gates products once a scheduled/special association exists.
  def self.enabled?(product, at: Time.current)
    collections = product.collections.to_a
    !collections.any?(&:scheduled_or_special?) ||
      collections.any? { |collection| collection.ordering_available?(at: at) }
  end

  def self.scope(relation, at: Time.current)
    scheduled_products = ProductCollection.where(collection_id: Collection.scheduled_or_special.select(:id)).select(:product_id)
    orderable_products = ProductCollection.where(collection_id: Collection.ordering_at(at).select(:id)).select(:product_id)

    relation.where.not(id: scheduled_products).or(relation.where(id: orderable_products))
  end
end
