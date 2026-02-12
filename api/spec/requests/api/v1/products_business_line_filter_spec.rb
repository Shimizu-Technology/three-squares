require 'rails_helper'

RSpec.describe 'Products business line filters', type: :request do
  let!(:cookies_collection) { Collection.find_or_create_by!(slug: 'cookies') { |c| c.name = 'Cookies' } }
  let!(:catering_collection) { Collection.find_or_create_by!(slug: 'catering-platters') { |c| c.name = 'Catering Platters' } }
  let!(:main_collection) { Collection.find_or_create_by!(slug: 'mains') { |c| c.name = 'Mains' } }

  let!(:latte_stone_product) do
    create(:product, name: 'Latte Stone Box', slug: "latte-stone-#{SecureRandom.hex(3)}", published: true, archived: false).tap do |product|
      create(:product_collection, product: product, collection: cookies_collection)
    end
  end

  let!(:catering_product) do
    create(:product, name: 'Party Tray', slug: "party-tray-#{SecureRandom.hex(3)}", published: true, archived: false).tap do |product|
      create(:product_collection, product: product, collection: catering_collection)
    end
  end

  let!(:three_squares_product) do
    create(:product, name: 'Fried Chicken Plate', slug: "fried-chicken-#{SecureRandom.hex(3)}", published: true, archived: false).tap do |product|
      create(:product_collection, product: product, collection: main_collection)
    end
  end

  def product_names_from_response
    JSON.parse(response.body).fetch('products', []).map { |p| p['name'] }
  end

  it 'returns only Latte Stone cookie products for latte_stone filter' do
    get '/api/v1/products', params: { business_line: 'latte_stone' }

    expect(response).to have_http_status(:ok)
    names = product_names_from_response
    expect(names).to include(latte_stone_product.name)
    expect(names).not_to include(catering_product.name)
    expect(names).not_to include(three_squares_product.name)
  end

  it 'returns only catering collection products for catering filter' do
    get '/api/v1/products', params: { business_line: 'catering' }

    expect(response).to have_http_status(:ok)
    names = product_names_from_response
    expect(names).to include(catering_product.name)
    expect(names).not_to include(latte_stone_product.name)
    expect(names).not_to include(three_squares_product.name)
  end

  it 'excludes cookie and catering collections for three_squares filter' do
    get '/api/v1/products', params: { business_line: 'three_squares' }

    expect(response).to have_http_status(:ok)
    names = product_names_from_response
    expect(names).to include(three_squares_product.name)
    expect(names).not_to include(latte_stone_product.name)
    expect(names).not_to include(catering_product.name)
  end
end

