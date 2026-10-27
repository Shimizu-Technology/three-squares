require 'rails_helper'

RSpec.describe User, type: :model do
  describe 'validations' do
    it 'is valid with factory defaults' do
      expect(build(:user)).to be_valid
    end

    it 'requires a unique clerk_id' do
      create(:user, clerk_id: 'clerk_unique_1')
      duplicate = build(:user, clerk_id: 'clerk_unique_1')

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:clerk_id]).to include('has already been taken')
    end

    it 'requires valid email format' do
      user = build(:user, email: 'not-an-email')

      expect(user).not_to be_valid
      expect(user.errors[:email]).to be_present
    end

    it 'rejects obsolete or unknown roles' do
      user = build(:user, role: 'admin')

      expect(user).not_to be_valid
      expect(user.errors[:role]).to include('is not included in the list')
    end
  end

  describe 'defaults and helpers' do
    it 'defaults role to customer for new records' do
      user = User.new(clerk_id: 'clerk_default_role', email: 'default-role@example.com')

      expect(user.role).to eq('customer')
      expect(user.customer?).to be(true)
      expect(user.admin?).to be(false)
    end

    it 'reports admin role correctly' do
      user = build(:user, :admin)

      expect(user.admin?).to be(true)
      expect(user.customer?).to be(false)
    end
  end

  describe 'scopes' do
    it 'returns users by role' do
      customer = create(:user, role: 'customer')
      admin = create(:user, role: 'owner')

      expect(User.customers).to include(customer)
      expect(User.customers).not_to include(admin)
      expect(User.admins).to include(admin)
      expect(User.admins).not_to include(customer)
    end
  end
end
