require "rails_helper"

RSpec.describe "Admin catering manual recording", type: :request do
  let(:actor) { create(:user, :owner) }
  let(:headers) { { "Authorization" => "Bearer catering-spec" } }
  let(:base_path) { "/api/v1/admin/catering" }
  let!(:inquiry) { build_inquiry }

  before do
    @actor = actor
    users = double("Clerk users")
    client = double("Clerk client", users: users)
    allow(Clerk::SDK).to receive(:new).and_return(client)
    allow(client).to receive(:verify_token) { { "sub" => @actor.clerk_id } }
    allow(users).to receive(:find) do |id|
      raise "Unexpected Clerk subject" unless id == @actor.clerk_id
      { "primary_email_address_id" => "email", "email_addresses" => [ { "id" => "email", "email_address" => @actor.email } ] }
    end
    allow_any_instance_of(Net::HTTP).to receive(:request) { raise "External HTTP forbidden in catering specs" }
    @previous_adapter = ActiveJob::Base.queue_adapter
    ActiveJob::Base.queue_adapter = :test
    @jobs_before = ActiveJob::Base.queue_adapter.enqueued_jobs.dup
    @mail_before = ActionMailer::Base.deliveries.dup
  end

  after do
    expect(ActiveJob::Base.queue_adapter.enqueued_jobs).to eq(@jobs_before)
    expect(ActionMailer::Base.deliveries).to eq(@mail_before)
    ActiveJob::Base.queue_adapter = @previous_adapter
  end

  def build_inquiry(**attributes)
    CateringInquiry.create!({ contact_name: "Catering fixture", contact_email: "catering@example.test",
      event_type: "corporate", event_date: Date.current + 10, guest_count: 25,
      admin_notes: "Existing follow-up" }.merge(attributes))
  end

  def version
    inquiry.reload.updated_at.iso8601(6)
  end

  def write(action, attributes = {}, expected: version, **fields)
    method = action == :notes ? :patch : :post
    path = action == :notes ? "#{base_path}/#{inquiry.id}" : "#{base_path}/#{inquiry.id}/#{action}"
    public_send(method, path, params: { expected_updated_at: expected }.merge(attributes).merge(fields), headers: headers, as: :json)
  end

  def expect_unchanged(status)
    original = inquiry.reload.attributes
    yield
    expect(response).to have_http_status(status), response.body
    expect(inquiry.reload.attributes).to eq(original)
  end

  it "records the amount, operator, quote time and notes and explicitly says no email was sent" do
    write(:quote, quoted_amount: "1234.56", admin_notes: "Call customer manually")
    expect(response).to have_http_status(:ok), response.body
    expect(response.parsed_body.fetch("message")).to eq("Quote recorded. No email was sent by this app.")
    expect(inquiry.reload).to have_attributes(status: "quoted", quoted_amount: BigDecimal("1234.56"),
      responded_by_id: actor.id, admin_notes: "Call customer manually")
    expect(inquiry.quoted_at).to be_within(5.seconds).of(Time.current)
    expect(response.parsed_body.fetch("inquiry")).to include("status" => "quoted", "quoted_amount" => 1234.56,
      "responded_by_id" => actor.id, "updated_at" => inquiry.updated_at.iso8601(6))
    get "#{base_path}/#{inquiry.id}", headers: headers
    expect(response.parsed_body.dig("inquiry", "admin_notes")).to eq("Call customer manually")
  end

  it "preserves omitted notes when first quoting or revising and allows an explicit notes clear" do
    write(:quote, quoted_amount: "10")
    expect(response).to have_http_status(:ok)
    expect(inquiry.reload.admin_notes).to eq("Existing follow-up")
    write(:quote, quoted_amount: "20.50")
    expect(response).to have_http_status(:ok)
    expect(inquiry.reload).to have_attributes(quoted_amount: BigDecimal("20.50"), admin_notes: "Existing follow-up")
    write(:quote, quoted_amount: "30.00", admin_notes: "")
    expect(response).to have_http_status(:ok)
    expect(inquiry.reload.admin_notes).to eq("")
  end

  [ "0.01", "99999999.99", 12, 12.34 ].each do |amount|
    it "accepts the valid decimal amount #{amount.inspect}" do
      write(:quote, quoted_amount: amount)
      expect(response).to have_http_status(:ok), response.body
      expect(inquiry.reload.quoted_amount).to eq(amount.to_d)
    end
  end

  [ nil, "", " ", "garbage", "12oops", " 12.00", "12.00 ", "1,000.00", "$1", "+1", "1e2",
    ".50", "1.", "0", "0.00", 0, "-1", -1, "-0.01", "1.001", "99999999.999", "100000000",
    "NaN", "Infinity", "-Infinity", {}, [], true ].each do |amount|
    it "rejects invalid quote amount #{amount.inspect} without saving" do
      expect_unchanged(422) { write(:quote, quoted_amount: amount, admin_notes: "Must not save") }
    end
  end

  it "rejects a missing quote amount" do
    expect_unchanged(422) { write(:quote) }
  end

  %w[accepted declined completed cancelled].each do |state|
    it "cannot reopen a #{state} inquiry by recording a quote" do
      inquiry.update_columns(status: state)
      expect_unchanged(422) { write(:quote, quoted_amount: "99.99") }
    end
  end

  allowed = { "pending" => %w[cancelled], "quoted" => %w[accepted declined cancelled],
    "accepted" => %w[completed cancelled], "declined" => %w[cancelled], "completed" => [], "cancelled" => [] }
  allowed.each do |from, destinations|
    (CateringInquiry::STATUSES + [ "unknown", nil ]).each do |to|
      it "#{destinations.include?(to) ? 'allows' : 'rejects'} status #{from} → #{to.inspect}" do
        inquiry.update_columns(status: from, quoted_amount: 150, quoted_at: 1.day.ago)
        if destinations.include?(to)
          write(:status, status: to)
          expect(response).to have_http_status(:ok), response.body
          expect(inquiry.reload.status).to eq(to)
          expect(inquiry.quoted_amount).to eq(150)
        else
          expect_unchanged(422) { write(:status, status: to) }
        end
      end
    end
  end

  it "saves only notes, including on a historical bad-amount row" do
    inquiry.update_columns(quoted_amount: -12, status: "quoted")
    write(:notes, inquiry: { admin_notes: "Legacy row follow-up" })
    expect(response).to have_http_status(:ok), response.body
    expect(inquiry.reload).to have_attributes(admin_notes: "Legacy row follow-up", quoted_amount: -12, status: "quoted")
    expect(response.parsed_body.dig("inquiry", "updated_at")).to eq(version)
  end

  [ { status: "quoted" }, { quoted_amount: "0.01" }, { quoted_at: Time.utc(2026).iso8601 },
    { responded_by_id: 1 }, { contact_name: "Bypass" } ].each do |bypass|
    it "rejects nested PATCH bypass #{bypass.keys.first} without even saving accompanying notes" do
      expect_unchanged(422) { write(:notes, inquiry: { admin_notes: "Must not save" }.merge(bypass)) }
    end
  end

  it "rejects top-level PATCH status and amount bypasses" do
    [ { status: "accepted" }, { quoted_amount: "1.00" } ].each do |bypass|
      expect_unchanged(422) { write(:notes, { inquiry: { admin_notes: "Must not save" } }.merge(bypass)) }
    end
  end

  { quote: { quoted_amount: "50" }, status: { status: "cancelled" }, notes: { inquiry: { admin_notes: "Updated" } } }.each do |action, attributes|
    [ nil, "", "bad", 123, {}, [], "2026-99-01T00:00:00Z", "2026-02-30T00:00:00Z" ].each do |bad_version|
      it "rejects missing/malformed #{action} expected_updated_at #{bad_version.inspect}" do
        expect_unchanged(422) { write(action, attributes, expected: bad_version) }
      end
    end

    it "requires the version at the top level for #{action}" do
      path = action == :notes ? "#{base_path}/#{inquiry.id}" : "#{base_path}/#{inquiry.id}/#{action}"
      nested = action == :notes ? { inquiry: { admin_notes: "Updated", expected_updated_at: version } } : attributes.merge(inquiry: { expected_updated_at: version })
      expect_unchanged(422) do
        public_send(action == :notes ? :patch : :post, path, params: nested, headers: headers, as: :json)
      end
    end

    it "rejects a #{action} version differing by one microsecond, with reload guidance and no change" do
      inquiry.update_columns(updated_at: Time.utc(2026, 10, 27, 12, 0, 0, 123457))
      stale = (inquiry.reload.updated_at - Rational(1, 1_000_000)).iso8601(6)
      expect_unchanged(:conflict) { write(action, attributes, expected: stale) }
      expect(response.parsed_body.fetch("error")).to match(/reload/i)
    end

    it "rechecks #{action} version inside the lock after a concurrent edit" do
      old_version = version
      # Persist a racing edit between the controller's find and with_lock reload.
      allow_any_instance_of(CateringInquiry).to receive(:with_lock).and_wrap_original do |original, *args, &block|
        inquiry.update_columns(admin_notes: "Concurrent edit", updated_at: inquiry.updated_at + Rational(1, 1_000_000))
        original.call(*args, &block)
      end
      write(action, attributes, expected: old_version)
      expect(response).to have_http_status(:conflict), response.body
      expect(inquiry.reload).to have_attributes(status: "pending", quoted_amount: nil, quoted_at: nil,
        responded_by_id: nil, admin_notes: "Concurrent edit")
      expect(inquiry.updated_at.iso8601(6)).not_to eq(old_version)
    end
  end

  it "returns and accepts the precise microsecond version, then rejects its replay" do
    inquiry.update_columns(updated_at: Time.utc(2026, 10, 27, 12, 0, 0, 123456))
    get "#{base_path}/#{inquiry.id}", headers: headers
    token = response.parsed_body.dig("inquiry", "updated_at")
    expect(token).to eq(version)
    expect(token).to match(/\.123456(?:Z|[+-]\d{2}:\d{2})\z/)
    expect(Time.iso8601(token)).to eq(Time.utc(2026, 10, 27, 12, 0, 0, 123456))
    write(:quote, { quoted_amount: "55.55" }, expected: token)
    expect(response).to have_http_status(:ok), response.body
    expect(response.parsed_body.dig("inquiry", "updated_at")).to eq(version)
    expect_unchanged(:conflict) { write(:notes, { inquiry: { admin_notes: "Stale overwrite" } }, expected: token) }
  end

  describe "global catering capability" do
    [ nil, :assigned ].each do |assignment|
      it "allows a #{assignment || 'global'} manager to read all inquiries and save quote, notes and status" do
        @actor = create(:user, :manager, assigned_location: assignment ? create(:location) : nil)
        get base_path, headers: headers, params: { location_id: -1 }
        expect(response).to have_http_status(:ok), response.body
        expect(response.parsed_body.fetch("inquiries").pluck("id")).to include(inquiry.id)
        write(:quote, quoted_amount: "100")
        expect(response).to have_http_status(:ok), response.body
        expect(inquiry.reload.responded_by).to eq(@actor)
        write(:notes, inquiry: { admin_notes: "Manager follow-up" })
        expect(response).to have_http_status(:ok)
        write(:status, status: "accepted")
        expect(response).to have_http_status(:ok)
        expect(inquiry.reload).to have_attributes(status: "accepted", admin_notes: "Manager follow-up")
        get "#{base_path}/stats", headers: headers
        expect(response).to have_http_status(:ok)
      end
    end

    %w[staff customer].each do |role|
      it "denies #{role} every catering route with no saved changes" do
        @actor = create(:user, role: role, assigned_location: role == "staff" ? create(:location) : nil)
        expect_unchanged(:forbidden) { get base_path, headers: headers }
        expect_unchanged(:forbidden) { get "#{base_path}/stats", headers: headers }
        expect_unchanged(:forbidden) { get "#{base_path}/#{inquiry.id}", headers: headers }
        expect_unchanged(:forbidden) { write(:quote, quoted_amount: "100") }
        expect_unchanged(:forbidden) { write(:status, status: "cancelled") }
        expect_unchanged(:forbidden) { write(:notes, inquiry: { admin_notes: "Forged" }) }
        expect_unchanged(:forbidden) { delete "#{base_path}/#{inquiry.id}", headers: headers }
      end
    end
  end

  describe "worklist and urgency" do
    it "paginates more than 20 active rows in stable event/creation/id order, clamping page and keeping metadata" do
      inquiry.destroy!
      rows = 25.times.map { build_inquiry }
      same_time = Time.utc(2026, 10, 20)
      CateringInquiry.update_all(created_at: same_time)
      rows.last.update_columns(event_date: Date.current + 9)
      closed = build_inquiry(status: "completed")
      ordered = [ rows.last.id ] + rows.first(24).map(&:id)
      get base_path, params: { status: "active", page: -1, per_page: 100 }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(response.parsed_body.fetch("inquiries").pluck("id")).to eq(ordered.first(20))
      expect(response.parsed_body.fetch("meta")).to eq("page" => 1, "per_page" => 20, "total" => 25, "total_pages" => 2)
      get base_path, params: { status: "active", page: 999 }, headers: headers
      expect(response.parsed_body.fetch("inquiries").pluck("id")).to eq(ordered.last(5))
      expect(response.parsed_body.fetch("meta")).to include("page" => 2, "total" => 25)
      expect(response.parsed_body.fetch("inquiries").pluck("id")).not_to include(closed.id)
    end

    it "supports blank/all and each existing status, rejects invalid statuses, and returns empty metadata" do
      records = CateringInquiry::STATUSES.map { |state| state == "pending" ? inquiry : build_inquiry(status: state) }
      [ nil, "", "all" ].each do |filter|
        get base_path, params: { status: filter }, headers: headers
        expect(response).to have_http_status(:ok)
        expect(response.parsed_body.fetch("meta")).to include("total" => 6)
      end
      records.each do |row|
        get base_path, params: { status: row.status }, headers: headers
        expect(response.parsed_body.fetch("inquiries").pluck("id")).to eq([ row.id ])
      end
      get base_path, params: { status: "bogus" }, headers: headers
      expect(response).to have_http_status(422)
      CateringInquiry.delete_all
      get base_path, params: { status: "active", page: 50 }, headers: headers
      expect(response.parsed_body).to include("inquiries" => [], "meta" => { "page" => 1, "per_page" => 20, "total" => 0, "total_pages" => 0 })
    end

    it "marks only active events today through seven days urgent and keeps stats consistent" do
      inquiry.destroy!
      rows = []
      CateringInquiry::STATUSES.each do |state|
        [ -1, 0, 7, 8 ].each do |days|
          row = build_inquiry(status: state)
          row.update_columns(event_date: Date.current + days)
          rows << row
        end
      end
      expected_ids = rows.select { |row| %w[pending quoted accepted].include?(row.status) && [ 0, 7 ].include?((row.event_date - Date.current).to_i) }.map(&:id)
      returned = []
      [ 1, 2 ].each do |page|
        get base_path, params: { status: "all", page: page }, headers: headers
        returned.concat(response.parsed_body.fetch("inquiries"))
      end
      expect(returned.select { |row| row.fetch("urgent") }.pluck("id")).to match_array(expected_ids)
      get "#{base_path}/stats", headers: headers
      expect(response.parsed_body).to eq("total" => 24, "pending" => 4, "quoted" => 4, "active" => 12,
        "upcoming_this_week" => 6, "urgent" => 6)
    end
  end
end
