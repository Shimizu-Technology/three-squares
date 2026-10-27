require 'spec_helper'
require 'tmpdir'
load File.expand_path('../../bin/demo', __dir__)

RSpec.describe Demo do
  around do |example|
    original = ENV.to_h
    %w[CLERK_SECRET_KEY CLERK_PUBLISHABLE_KEY VITE_CLERK_PUBLISHABLE_KEY DEMO_OWNER_EMAIL DEMO_PG_PORT DEMO_API_PORT DEMO_WEB_PORT].each { |key| ENV.delete(key) }
    example.run
  ensure
    ENV.replace(original)
  end

  before do
    # Keep checkout discovery independent of the host worktree's .git pointer.
    allow(Open3).to receive(:capture2).and_call_original
    allow(Open3).to receive(:capture2).with('git', '-C', described_class::ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir')
      .and_return(["/fictional/.git\n", instance_double(Process::Status, success?: true)])
    # Never read developer keys in specs.
    allow(File).to receive(:file?).and_call_original
    allow(File).to receive(:file?).with(/\.env/).and_return(false)
  end

  def keys
    ENV['CLERK_SECRET_KEY'] = 'sk_test_fictional'
    ENV['CLERK_PUBLISHABLE_KEY'] = 'pk_test_fictional'
    ENV['VITE_CLERK_PUBLISHABLE_KEY'] = 'pk_test_fictional'
    ENV['DEMO_OWNER_EMAIL'] = 'presenter@example.test'
  end

  it 'rejects unsafe names before reading environment or touching a database' do
    %w[three_squares_development three_squares_test postgres tsq_demo_prod tsq_live_sim ../tsq_demo tsq_demo_test].each do |name|
      launcher = described_class.new(['reset', '--db', name])
      expect(launcher).not_to receive(:configure)
      expect { launcher.run }.to raise_error(/Refusing database name/)
    end
  end

  it 'accepts the documented reserved demo names' do
    %w[three_squares_demo tsq_demo tsq_demo_launcher tsq_rehearsal_sim].each do |name|
      expect(DemoDatabase.valid_name?(name)).to be(true)
    end
    expect(DemoDatabase.valid_name?('tsq_demo_' + 'x' * 64)).to be(false)
  end

  it 'fails clearly when dev Clerk keys or presenter email are missing' do
    launcher = described_class.new(['start'])
    expect { launcher.configure }.to raise_error(/Missing Clerk dev keys/)
    keys
    ENV.delete('DEMO_OWNER_EMAIL')
    expect { launcher.configure }.to raise_error(/Set DEMO_OWNER_EMAIL/)
  end

  it 'rejects live keys and mismatched Clerk instances' do
    launcher = described_class.new(['start'])
    keys
    ENV['CLERK_SECRET_KEY'] = 'sk_live_fictional'
    expect { launcher.configure }.to raise_error(/Missing Clerk dev keys/)
    keys
    ENV['VITE_CLERK_PUBLISHABLE_KEY'] = 'pk_test_other'
    expect { launcher.configure }.to raise_error(/publishable keys differ/)
  end

  it 'forces matching safe origins and excludes inherited provider credentials' do
    keys
    ENV['DATABASE_URL'] = 'postgresql://production.invalid/live'
    ENV['STRIPE_SECRET_KEY'] = 'never-forward-this'
    ENV['RESEND_API_KEY'] = 'never-forward-this'
    ENV['WORLDPAY_TRANSPORT_ENABLED'] = 'true'
    launcher = described_class.new(['start', '--db', 'tsq_demo', '--api-port', '3100', '--web-port', '5174'])
    launcher.configure
    env = launcher.instance_variable_get(:@env)
    expect(env).to include('DATABASE_URL' => 'postgresql://127.0.0.1:5432/tsq_demo',
      'FRONTEND_URL' => 'http://localhost:5174', 'ALLOWED_ORIGINS' => 'http://localhost:5174',
      'VITE_API_BASE_URL' => 'http://localhost:3100', 'WORLDPAY_TRANSPORT_ENABLED' => 'false',
      'WORLDPAY_TRIPOS_TRANSPORT_ENABLED' => 'false', 'APP_MODE' => 'test', 'DEMO_QUEUE' => '1',
      'ADMIN_EMAILS' => 'presenter@example.test')
    expect(env.keys).not_to include('STRIPE_SECRET_KEY', 'RESEND_API_KEY')
  end
  it 'treats an exited but unreaped supervisor as stopped' do
    Dir.mktmpdir('demo-stop-spec') do |directory|
      stub_const('Demo::STATE', File.join(directory, 'pids.json'))
      pid = Process.spawn(RbConfig.ruby, '-e', 'exit 0')
      launcher = described_class.new(['stop'])
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
      loop do
        state, = Open3.capture2('ps', '-p', pid.to_s, '-o', 'stat=')
        break if state.strip.start_with?('Z')
        raise 'Child did not exit' if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
        sleep 0.01
      end
      File.write(Demo::STATE, JSON.generate('supervisor' => { 'pid' => pid, 'started' => launcher.identity(pid) }, 'children' => []))
      expect { launcher.stop }.to output(/Demo processes stopped/).to_stdout
      expect(File.exist?(Demo::STATE)).to be(false)
    ensure
      Process.waitpid(pid) if pid
    end
  end

  it 'reaps an exited child group without signaling a zombie-only group' do
    launcher = described_class.new(['stop'])
    pid = Process.spawn(RbConfig.ruby, '-e', 'exit 0', pgroup: true)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
    loop do
      state, = Open3.capture2('ps', '-p', pid.to_s, '-o', 'stat=')
      break if state.strip.start_with?('Z')
      raise 'Child did not exit' if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
      sleep 0.01
    end
    child = { 'pid' => pid, 'started' => launcher.identity(pid), 'label' => 'fixture' }
    expect { launcher.cleanup([child]) }.not_to raise_error
    expect(launcher.identity(pid)).to be_nil
  ensure
    begin
      Process.waitpid(pid) if pid
    rescue Errno::ECHILD
      nil
    end
  end

end
