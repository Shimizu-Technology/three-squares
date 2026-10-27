class BindWorldpayAcceptorIdentity < ActiveRecord::Migration[8.1]
  def change
    # No guessed backfill. Legacy unassigned Worldpay identities fail dispatch
    # configuration until replaced with an explicitly assigned identity.
    add_column :payment_identities, :external_acceptor_id, :string
  end
end
