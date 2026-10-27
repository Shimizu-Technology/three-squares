class SimulationClock < ApplicationRecord
  belongs_to :payment_identity
  def self.for(identity)
    Payments::Simulation::Guard.validate!(identity)
    find_or_create_by!(payment_identity: identity) { |clock| clock.now = Time.current }
  end

  def advance!(seconds)
    Payments::Simulation::Guard.validate!(payment_identity)
    raise Payments::Error, 'Advance must be 1–604800 seconds' unless seconds.is_a?(Integer) && seconds.between?(1, 604800)
    with_lock { update!(now: now + seconds) }
    Payments::Simulation::Events.deliver_due(payment_identity)
  end
end
