require 'rails_helper'

RSpec.describe SiteSetting, type: :model do
  describe 'validations' do
    it 'is valid with factory defaults' do
      expect(build(:site_setting)).to be_valid
    end

    it 'restricts payment_processor to stripe/paypal' do
      setting = build(:site_setting, payment_processor: 'square')

      expect(setting).not_to be_valid
      expect(setting.errors[:payment_processor]).to include('is not included in the list')
    end

    it 'requires complete shipping_origin_address fields' do
      setting = build(:site_setting, shipping_origin_address: { company: 'Three Squares' })

      expect(setting).not_to be_valid
      expect(setting.errors[:shipping_origin_address].first).to include('missing required fields')
    end
  end

  describe 'mode helpers' do
    it 'reports test and production mode correctly' do
      test_setting = build(:site_setting, payment_test_mode: true)
      prod_setting = build(:site_setting, payment_test_mode: false)

      expect(test_setting.test_mode?).to be(true)
      expect(test_setting.production_mode?).to be(false)
      expect(prod_setting.test_mode?).to be(false)
      expect(prod_setting.production_mode?).to be(true)
    end

    it 'reports payment processor correctly' do
      stripe_setting = build(:site_setting, payment_processor: 'stripe')
      paypal_setting = build(:site_setting, payment_processor: 'paypal')

      expect(stripe_setting.using_stripe?).to be(true)
      expect(stripe_setting.using_paypal?).to be(false)
      expect(paypal_setting.using_paypal?).to be(true)
      expect(paypal_setting.using_stripe?).to be(false)
    end
  end

  describe '#send_customer_emails' do
    it 'can be toggled' do
      setting = build(:site_setting, send_customer_emails: true)
      expect(setting.send_customer_emails).to be(true)
      
      setting.send_customer_emails = false
      expect(setting.send_customer_emails).to be(false)
    end
  end

  describe '#shipping_origin_complete?' do
    it 'returns true when required fields are present' do
      setting = build(:site_setting)
      expect(setting.shipping_origin_complete?).to be(true)
    end

    it 'returns false when required fields are missing' do
      setting = build(:site_setting, shipping_origin_address: {})
      expect(setting.shipping_origin_complete?).to be(false)
    end
  end

  describe '.instance' do
    it 'returns a singleton record' do
      first = described_class.instance
      second = described_class.instance

      expect(first.id).to eq(second.id)
    end
  end

  describe 'destroy protection' do
    it 'prevents destroying the singleton record' do
      setting = create(:site_setting)

      expect { setting.destroy! }.to raise_error(ActiveRecord::RecordNotDestroyed)
    end
  end
end
