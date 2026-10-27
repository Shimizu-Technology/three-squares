class BindStripeReaders < ActiveRecord::Migration[8.1]
  def change
    add_column :payment_terminals, :stripe_reader_key, :string
    reversible do |direction|
      direction.up do
        # Fail on historical duplicates rather than silently choosing a reader
        # or discarding a payment/lane claim. Deployment remains gated on replay.
        execute <<~SQL
          UPDATE payment_terminals SET stripe_reader_key = terminal_id
          FROM payment_identities WHERE payment_identities.id = payment_terminals.payment_identity_id
          AND payment_identities.provider = 'stripe'
        SQL
      end
    end
    add_check_constraint :payment_terminals, 'stripe_reader_key IS NULL OR stripe_reader_key = terminal_id', name: 'stripe_reader_key_matches_terminal'
    add_index :payment_terminals, [:payment_identity_id, :stripe_reader_key], unique: true,
      where: 'stripe_reader_key IS NOT NULL', name: 'one_stripe_reader_per_identity'
  end
end
