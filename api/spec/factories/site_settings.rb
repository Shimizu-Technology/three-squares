FactoryBot.define do
  factory :site_setting do
    payment_test_mode { true }
    payment_processor { 'stripe' }
    store_name { 'Three Squares' }
    store_email { 'sales@bgpacific.com' }
    store_phone { '671-646-2652' }
    order_notification_emails { ['sales@bgpacific.com'] }
    shipping_origin_address do
      {
        company: 'B&G Pacific LLC',
        street1: '416 Chalan San Antonio',
        city: 'Tamuning',
        state: 'GU',
        zip: '96913',
        country: 'US',
        phone: '671-646-2652'
      }
    end
    send_customer_emails { false }
  end
end
