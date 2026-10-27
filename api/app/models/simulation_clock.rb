class SimulationClock < ApplicationRecord
  belongs_to :payment_identity
  def self.for(identity)
    Payments::Simulation::Guard.validate!(identity)
    create_or_find_by!(payment_identity: identity) { |clock| clock.now = Time.current }
  end

  # Browser controls move only their saved attempt. The identity clock remains
  # an internal fixture/batch clock, never an authority available to checkout.
  def self.for_attempt(attempt)
    Payments::Simulation::Guard.validate!(attempt.payment_identity)
    AttemptClock.new(attempt)
  end

  class AttemptClock
    def initialize(attempt)
      @attempt = attempt
    end

    def now
      SimulationClock.for(@attempt.payment_identity).now + @attempt.reload.simulation_offset_seconds.seconds
    end

    def advance!(seconds)
      raise Payments::Error, 'Advance must be 1–604800 seconds' unless seconds.is_a?(Integer) && seconds.between?(1, 604800)
      Payments::Simulation::Guard.validate!(@attempt.payment_identity)
      Payments::AttemptLock.call(@attempt) do |session, current, _, order|
        Payments::AttemptLock.validate!(session, current, order)
        total = current.simulation_offset_seconds + seconds
        raise Payments::Error, 'Simulation time limit reached' if total > 31_536_000
        current.update!(simulation_offset_seconds: total)
      end
      Payments::Simulation::Events.deliver_due(@attempt.payment_identity, attempt: @attempt)
    end
  end

  def advance!(seconds)
    Payments::Simulation::Guard.validate!(payment_identity)
    raise Payments::Error, 'Advance must be 1–604800 seconds' unless seconds.is_a?(Integer) && seconds.between?(1, 604800)
    with_lock { update!(now: now + seconds) }
    Payments::Simulation::Events.deliver_due(payment_identity)
  end
end
