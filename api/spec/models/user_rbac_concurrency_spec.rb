require "rails_helper"
require "timeout"

RSpec.describe User, "last-owner concurrent writes", type: :model do
  # Separate connections must see committed owners, rather than transactional
  # fixtures hidden in the main thread. Only these exact fixtures are cleaned.
  self.use_transactional_tests = false

  before do
    @owners = 2.times.map { create(:user, role: "owner") }
  end

  after do
    User.where(id: @owners.map(&:id)).delete_all
  end

  def write(user, action)
    action == :destroy ? !!user.destroy : user.update(role: "manager")
  end

  def exercise_race(first_action, second_action)
    first_holds_lock = Queue.new
    release_first = Queue.new
    second_pid = Queue.new
    results = Queue.new
    first = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do
        User.transaction do
          results << write(User.find(@owners.first.id), first_action)
          first_holds_lock << true
          Timeout.timeout(10) { release_first.pop }
        end
      end
    end
    Timeout.timeout(10) { first_holds_lock.pop }
    second = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do |connection|
        second_pid << connection.select_value("SELECT pg_backend_pid()")
        user = User.find(@owners.last.id)
        succeeded = write(user, second_action)
        results << [ succeeded, user.errors[:base] ]
      end
    end
    pid = Timeout.timeout(10) { second_pid.pop }
    # Prove overlapping transactions: the second write waits on the common DB
    # advisory lock while the first owner's demotion/deletion is uncommitted.
    Timeout.timeout(10) do
      loop do
        waiting = ActiveRecord::Base.connection.select_value(<<~SQL)
          SELECT EXISTS (SELECT 1 FROM pg_locks
            WHERE pid = #{Integer(pid)} AND locktype = 'advisory' AND NOT granted)
        SQL
        break if waiting
        sleep 0.01
      end
    end
    release_first << true
    [ first, second ].each { |thread| Timeout.timeout(10) { thread.value } }
    expect(results.pop).to be(true)
    expect(results.pop).to eq([ false, [ "Cannot remove the last owner" ] ])
    expect(User.where(id: @owners.map(&:id), role: "owner").count).to eq(1)
  ensure
    release_first << true
    [ first, second ].compact.each do |thread|
      thread.join(1)
      thread.kill if thread.alive?
    end
  end

  it "serializes two owner demotions" do
    exercise_race(:update, :update)
  end

  it "serializes two owner deletions" do
    exercise_race(:destroy, :destroy)
  end

  it "serializes a demotion racing a deletion" do
    exercise_race(:update, :destroy)
  end

  it "serializes a deletion racing a demotion" do
    exercise_race(:destroy, :update)
  end
end
