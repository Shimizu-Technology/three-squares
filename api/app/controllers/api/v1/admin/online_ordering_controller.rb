module Api
  module V1
    module Admin
      class OnlineOrderingController < BaseController
        def show
          render json: state(SiteSetting.instance)
        end

        def update
          input = params.require(:online_ordering).permit(:paused, :customer_message)
          unless [true, false].include?(input[:paused])
            return render json: { error: "Paused must be true or false" }, status: :unprocessable_entity
          end
          settings = SiteSetting.instance
          settings.with_lock do
            settings.assign_attributes(online_ordering_paused: input[:paused], online_ordering_pause_message: input[:customer_message].to_s.strip.presence)
            if settings.changed?
              settings.save!
              OnlineOrderingChange.create!(actor: current_user, actor_label: current_user.name.presence || "Owner ##{current_user.id}",
                paused: settings.online_ordering_paused, customer_message: settings.online_ordering_pause_message)
            end
            render json: state(settings)
          end
        rescue ActiveRecord::RecordInvalid => error
          render json: { error: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
        end

        private

        def state(settings)
          { paused: settings.online_ordering_paused, customer_message: settings.online_ordering_pause_message,
            effective_message: OnlineOrderingAvailability.message(settings),
            history: OnlineOrderingChange.order(id: :desc).limit(10).map { |change|
              { id: change.id, actor: change.actor_label, paused: change.paused, customer_message: change.customer_message, changed_at: change.created_at.iso8601 }
            } }
        end
      end
    end
  end
end
