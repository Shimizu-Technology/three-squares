require 'rails_helper'

RSpec.describe Order, 'number assignment', type: :model do
  include ActiveSupport::Testing::TimeHelpers
  def new_order(**attrs)
    build(:order, order_number: nil, fulfillment_type: 'shipping', **attrs)
  end

  around do |example|
    travel_to(Time.utc(2026, 10, 28, 2)) { example.run }
  end

  it 'selects POS before order type and keeps separate retail and wholesale sequences' do
    numbers = [ new_order(source: 'pos', order_type: 'wholesale'), new_order, new_order(order_type: 'wholesale'), new_order(source: 'pos') ].map do |order|
      order.save!
      order.order_number
    end
    expect(numbers).to eq(%w[TSQ-P-20261028-0001 TSQ-R-20261028-0001 TSQ-W-20261028-0001 TSQ-P-20261028-0002])
  end

  it 'uses the numeric maximum beyond four digits and ignores malformed suffixes' do
    %w[9999 10000 invalid 10001-extra].each do |suffix|
      create(:order, fulfillment_type: 'shipping', order_number: "TSQ-R-20261028-#{suffix}")
    end
    order = new_order
    order.save!
    expect(order.order_number).to eq('TSQ-R-20261028-10001')
  end

  it 'starts a new sequence at midnight in Guam even though UTC is still the previous day' do
    travel_to Time.utc(2026, 10, 27, 13, 59, 59)
    first = new_order.tap(&:save!)
    second = new_order.tap(&:save!)
    travel_to Time.utc(2026, 10, 27, 14)
    third = new_order.tap(&:save!)
    expect([ first, second, third ].map(&:order_number)).to eq(%w[TSQ-R-20261027-0001 TSQ-R-20261027-0002 TSQ-R-20261028-0001])
  end

  it 'regenerates a standalone validation candidate inside save, even with query caching' do
    Order.cache do
      first = new_order
      second = new_order
      expect(first).to be_valid
      expect(second).to be_valid
      expect(first.order_number).to eq(second.order_number)
      expect(first.save).to be(true)
      second.save!
      expect([ first, second ].map(&:order_number)).to eq(%w[TSQ-R-20261028-0001 TSQ-R-20261028-0002])
    end
  end

  it 'refreshes a validation candidate when saving on the next Guam day' do
    order = new_order
    expect(order).to be_valid
    travel_to Time.utc(2026, 10, 28, 14)
    order.save!
    expect(order.order_number).to eq('TSQ-R-20261029-0001')
  end

  it 'preserves supplied numbers and does not renumber persisted orders' do
    supplied = new_order(order_number: 'TSQ-R-20250101-1234')
    supplied.save!
    generated = new_order.tap(&:save!)
    travel_to Time.utc(2026, 10, 29, 2)
    [ supplied, generated ].each { |order| order.update!(notes: 'Updated') }
    expect(supplied.reload.order_number).to eq('TSQ-R-20250101-1234')
    expect(generated.reload.order_number).to eq('TSQ-R-20261028-0001')
  end

  it 'does not overwrite an explicitly replaced validation candidate' do
    order = new_order
    expect(order).to be_valid
    order.order_number = 'TSQ-R-20250101-4321'
    order.save!
    expect(order.reload.order_number).to eq('TSQ-R-20250101-4321')
  end

  it 'rejects a blank number on a persisted order instead of renumbering it' do
    order = new_order.tap(&:save!)
    expect(order.update(order_number: nil)).to be(false)
    expect(order.reload.order_number).to eq('TSQ-R-20261028-0001')
  end
end
