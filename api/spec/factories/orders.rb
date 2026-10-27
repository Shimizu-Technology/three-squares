FactoryBot.define do
  factory :order do
    sequence(:order_number) { |n| "HAF-R-20250101-#{n.to_s.rjust(4, '0')}" }
    order_type { "retail" }
    fulfillment_type { "shipping" }
    source { "online" }
    status { "pending" }
    payment_status { "pending" }
    subtotal_cents { 1000 }
    shipping_cost_cents { 500 }
    tax_cents { 0 }
    total_cents { 1500 }
    customer_name { "Test Customer" }
    customer_email { "test@example.com" }
    customer_phone { "555-1234" }

    # Guest order (no user)
    trait :guest do
      user { nil }
    end

    # Authenticated order (has user)
    trait :authenticated do
      user
    end
  end
end
