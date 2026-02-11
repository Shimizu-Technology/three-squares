Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Custom health check with more details
  get "health" => "health#show"

  # API routes
  namespace :api do
    namespace :v1 do
      # Auth
      get "me", to: "me#show"

      # Admin routes (require admin authentication)
      namespace :admin do
        # Dashboard
        get "dashboard/stats", to: "dashboard#stats"
        get "dashboard/chart_data", to: "dashboard#chart_data"

        # Orders (admin management)
        resources :orders, only: [ :index, :show, :update ] do
          member do
            post :notify  # Resend notification email
            post :refund  # Process refund
          end
        end

        # Users (admin management)
        resources :users, only: [ :index, :show, :update ]

        # Catering inquiries (admin management)
        resources :catering, only: [ :index, :show, :update, :destroy ] do
          member do
            post :quote
            post :status
          end
          collection do
            get :stats
          end
        end

        # Site Settings (singleton resource)
        resource :site_settings, only: [ :show, :update ]
        resource :settings, only: [ :show, :update ] # New settings endpoint

        # Imports
        resources :imports, only: [ :index, :show, :create ]

        # Homepage Sections (for configurable homepage)
        resources :homepage_sections, except: [ :new, :edit ] do
          collection do
            post :reorder
          end
        end

        # File uploads
        resources :uploads, only: [ :create, :destroy ]

        # Collections
        resources :collections, except: [ :new, :edit ]

        # Acai Management
        namespace :acai do
          resource :settings, only: [ :show, :update ]
          resources :crust_options, except: [ :new, :edit ]
          resources :placard_options, except: [ :new, :edit ]
          resources :pickup_windows, except: [ :new, :edit ]
          resources :blocked_slots, except: [ :new, :edit ]
          get "orders", to: "orders#index"
        end

        # Fundraiser Management
        resources :fundraisers, except: [ :new, :edit ] do
          member do
            get :stats
          end

          # Nested participants
          resources :participants, controller: "fundraisers/participants", except: [ :new, :edit ] do
            collection do
              post :bulk_create
              post :bulk_import
            end
          end

          # Nested fundraiser products (standalone products for this fundraiser)
          resources :products, controller: "fundraisers/products", except: [ :new, :edit ] do
            collection do
              post :reorder
            end

            # Nested variants for fundraiser products
            resources :variants, controller: "fundraisers/product_variants", except: [ :new, :edit ] do
              member do
                post :adjust_stock
              end
              collection do
                post :generate
              end
            end

            # Nested images for fundraiser products
            resources :images, controller: "fundraisers/product_images", except: [ :new, :edit ] do
              member do
                post :set_primary
              end
              collection do
                post :reorder
              end
            end
          end

          # Fundraiser orders (admin management)
          resources :orders, controller: "fundraisers/orders", only: [ :index, :show, :update ]
        end

        # Variant Presets (for flexible variant system)
        resources :variant_presets, except: [ :new, :edit ] do
          member do
            post :duplicate
          end
        end

        # Products
        resources :products, except: [ :new, :edit ] do
          member do
            post :duplicate
            post :archive
            post :unarchive
          end

          # Nested variants
          resources :variants, controller: "product_variants", except: [ :new, :edit ] do
            member do
              post :adjust_stock
            end
            collection do
              post :generate
              post :auto_detect_options
            end
          end

          # Nested images
          resources :images, controller: "product_images", except: [ :new, :edit ] do
            member do
              post :set_primary
            end
            collection do
              post :reorder
            end
          end

          # Nested inventory audits for a product
          resources :inventory_audits, only: [ :index ], controller: "inventory_audits", action: :for_product
        end

        # Product variant inventory audits
        resources :product_variants, only: [] do
          resources :inventory_audits, only: [ :index ], controller: "inventory_audits", action: :for_variant
        end

        # Order inventory audits
        resources :orders, only: [] do
          resources :inventory_audits, only: [ :index ], controller: "inventory_audits", action: :for_order
        end

        # Inventory Audits (standalone)
        resources :inventory_audits, only: [ :index, :show ] do
          collection do
            get :summary
          end
        end
      end

      # Public routes (no authentication required)
      resources :products, only: [ :index, :show ]
      resources :collections, only: [ :index, :show ]

      # Catering inquiries
      resources :catering, only: [ :create ] do
        collection do
          get :info
        end
      end

      # Public fundraiser routes (by slug)
      resources :fundraisers, only: [ :index, :show ], param: :slug do
        scope module: :fundraisers do
          resources :products, only: [ :index, :show ]
          resource :cart, only: [ :show, :update, :destroy ]
          resources :orders, only: [ :create, :show ]
          resources :payment_intents, only: [ :create ]
        end
        member do
          post :create_order  # Legacy route for backward compatibility
        end
      end

      resources :homepage_sections, only: [ :index ]

      # Cart routes (authentication optional - supports guest carts)
      get "cart", to: "cart#show"
      delete "cart", to: "cart#clear"
      post "cart/validate", to: "cart#validate"
      post "cart/items", to: "cart#add_item"
      put "cart/items/:id", to: "cart#update_item"
      delete "cart/items/:id", to: "cart#destroy_item"

      # Shipping routes (authentication optional)
      post "shipping/rates", to: "shipping#calculate_rates"
      post "shipping/validate_address", to: "shipping#validate_address"

      # Payment intents (for Stripe checkout)
      resources :payment_intents, only: [ :create ]

      # Config endpoint (public)
      get "config", to: "config#show"

      # Contact form (public)
      post "contact", to: "contact_submissions#create"

      # Acai Cakes routes (public ordering)
      get "acai/config", to: "acai#show_config"
      get "acai/available_dates", to: "acai#available_dates"
      get "acai/available_slots", to: "acai#available_slots"
      post "acai/orders", to: "acai#create_order"

      # Orders
      resources :orders, only: [ :create, :show, :index, :update ] do
        collection do
          get :my, action: :my_orders  # GET /api/v1/orders/my - customer's order history
        end
      end
    end
  end

  # Admin routes
  namespace :admin do
    # Admin product management will go here
    # resources :products
  end

  # Webhooks
  namespace :webhooks do
    # Stripe webhook
    post "stripe", to: "stripe#create"

    # EasyPost webhook
    # post 'easypost', to: 'easypost#create'
  end

  # Defines the root path route ("/")
  root to: proc { [ 200, {}, [ "Three Squares API v1.0" ] ] }

  # HAF-37: Catch-all for undefined API routes - returns clean JSON 404
  match "/api/*path", to: "application#route_not_found", via: :all
end
