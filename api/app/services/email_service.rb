# frozen_string_literal: true

require "cgi"

class EmailService
  class EmailError < StandardError; end

  # Send order confirmation email to customer
  # @param order [Order] - The completed order
  # @return [Hash] - { success: boolean, message_id: string, error: string }
  def self.send_order_confirmation(order)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    begin
      params = {
        from: from_address,
        to: [ order.customer_email ],
        subject: "Order Confirmation ##{order.id.to_s.rjust(6, '0')} - Three Squares",
        html: order_confirmation_html(order)
      }

      response = Resend::Emails.send(params)

      Rails.logger.info "✅ Order confirmation email sent to #{order.customer_email} (Order ##{order.id})"
      { success: true, message_id: response["id"] }

    rescue Resend::Error => e
      Rails.logger.error "Resend Error sending confirmation: #{e.message}"
      { success: false, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Email Error: #{e.class} - #{e.message}"
      { success: false, error: "Failed to send email" }
    end
  end

  # Send order notification to admin
  # @param order [Order] - The completed order
  # @return [Hash] - { success: boolean, message_id: string, error: string }
  def self.send_admin_notification(order)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    # Include both global admins AND location-specific admin (if configured).
    # Global admins should always receive new-order alerts regardless of location config.
    settings = SiteSetting.instance
    admin_emails = settings.order_notification_emails || [ "shimizutechnology@gmail.com" ]

    location = order.location
    if location&.admin_email.present? && !admin_emails.include?(location.admin_email)
      admin_emails = admin_emails + [ location.admin_email ]
    end

    begin
      params = {
        from: from_address,
        to: admin_emails,
        subject: "🍽️ New Order ##{order.id.to_s.rjust(6, '0')} - #{order.customer_email}",
        html: admin_notification_html(order)
      }

      response = Resend::Emails.send(params)

      Rails.logger.info "✅ Admin notification email sent (Order ##{order.id})"
      { success: true, message_id: response["id"] }

    rescue Resend::Error => e
      # In development, domain verification errors are expected - log as info, not error
      if Rails.env.development? && e.message.include?("domain is not verified")
        Rails.logger.info "ℹ️  Resend domain not verified (expected in development): #{e.message}"
      else
        Rails.logger.error "Resend Error sending admin notification: #{e.message}"
      end
      { success: false, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Email Error: #{e.class} - #{e.message}"
      { success: false, error: "Failed to send admin notification" }
    end
  end

  # Send order shipped notification with tracking info
  # @param order [Order] - The shipped order
  # @return [Hash] - { success: boolean, message_id: string, error: string }
  def self.send_order_shipped_email(order)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    begin
      params = {
        from: from_address,
        to: [ order.customer_email ],
        subject: "Your Order Has Shipped! 📦 - Order ##{order.order_number}",
        html: order_shipped_html(order)
      }

      response = Resend::Emails.send(params)

      Rails.logger.info "✅ Shipped notification email sent to #{order.customer_email} (Order ##{order.order_number})"
      { success: true, message_id: response["id"] }

    rescue Resend::Error => e
      Rails.logger.error "Resend Error sending shipped notification: #{e.message}"
      { success: false, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Email Error: #{e.class} - #{e.message}"
      { success: false, error: "Failed to send shipped notification" }
    end
  end

  # Send order ready for pickup notification
  # @param order [Order] - The order that's ready for pickup
  # @return [Hash] - { success: boolean, message_id: string, error: string }
  def self.send_order_ready_email(order)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    begin
      subject = "Your Order is Ready for Pickup! 📦 - Order ##{order.order_number}"

      params = {
        from: from_address,
        to: [ order.customer_email ],
        subject: subject,
        html: order_ready_html(order)
      }

      response = Resend::Emails.send(params)

      Rails.logger.info "✅ Ready for pickup email sent to #{order.customer_email} (Order ##{order.order_number})"
      { success: true, message_id: response["id"] }

    rescue Resend::Error => e
      Rails.logger.error "Resend Error sending ready notification: #{e.message}"
      { success: false, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Email Error: #{e.class} - #{e.message}"
      { success: false, error: "Failed to send ready notification" }
    end
  end

  # Send refund notification email to customer
  # @param order [Order] - The refunded order
  # @param refund_amount [Integer] - Refund amount in cents
  # @param reason [String] - Reason for the refund
  # @return [Hash] - { success: boolean, message_id: string, error: string }
  def self.send_refund_notification(order, refund_amount, reason = nil)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    begin
      amount_formatted = "$#{'%.2f' % (refund_amount / 100.0)}"
      refund_date = Time.current.strftime("%B %d, %Y")

      params = {
        from: from_address,
        to: [ order.customer_email ],
        subject: "Three Squares — Refund Processed for Order ##{order.order_number}",
        html: refund_notification_html(order, amount_formatted, reason, refund_date)
      }

      response = Resend::Emails.send(params)

      Rails.logger.info "✅ Refund notification email sent to #{order.customer_email} (Order ##{order.order_number})"
      { success: true, message_id: response["id"] }

    rescue Resend::Error => e
      Rails.logger.error "Resend Error sending refund notification: #{e.message}"
      { success: false, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Email Error: #{e.class} - #{e.message}"
      { success: false, error: "Failed to send refund notification" }
    end
  end

  # Send order confirmed/preparing email (pickup orders)
  def self.send_order_confirmed_email(order)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    location_name = order.location&.name || "Three Squares"
    send_status_email(
      order: order,
      subject: "Your Order is Being Prepared! - Order ##{order.order_number}",
      heading: "We're Preparing Your Order!",
      message: "Great news! Your order is now being prepared at #{location_name}. We'll send you another notification when it's ready for pickup.",
      color: "#2563EB"
    )
  end

  # Send order processing email (shipping orders)
  def self.send_order_processing_email(order)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    send_status_email(
      order: order,
      subject: "Your Order is Being Packed! - Order ##{order.order_number}",
      heading: "Your Order is Being Packed!",
      message: "Great news! Your order is now being packed and prepared for shipment. We'll send you tracking information once it ships.",
      color: "#2563EB"
    )
  end

  # Send order picked up confirmation email
  def self.send_order_picked_up_email(order)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    send_status_email(
      order: order,
      subject: "Order Picked Up - Thank You! - Order ##{order.order_number}",
      heading: "Thank You for Picking Up Your Order!",
      message: "Your order has been picked up. We hope you enjoy everything! Thank you for choosing Three Squares.",
      color: "#16A34A"
    )
  end

  # Send order delivered confirmation email
  def self.send_order_delivered_email(order)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    send_status_email(
      order: order,
      subject: "Your Order Has Been Delivered! - Order ##{order.order_number}",
      heading: "Your Order Has Been Delivered!",
      message: "Your order has been delivered. We hope you love everything! Thank you for choosing Three Squares.",
      color: "#16A34A"
    )
  end

  # Send order cancelled email
  def self.send_order_cancelled_email(order)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    send_status_email(
      order: order,
      subject: "Order Cancelled - Order ##{order.order_number}",
      heading: "Your Order Has Been Cancelled",
      message: "Your order ##{order.order_number} has been cancelled. If you paid for this order, a refund will be processed automatically. If you have any questions, please don't hesitate to reach out.",
      color: "#DC2626"
    )
  end

  # Send contact form submission notification to admin
  # @param submission [ContactSubmission] - The contact form submission
  # @return [Hash] - { success: boolean, message_id: string, error: string }
  def self.send_contact_notification(submission)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    begin
      # Send to site admin emails (same as order notifications)
      settings = SiteSetting.instance
      admin_emails = settings.order_notification_emails || [ "shimizutechnology@gmail.com" ]

      params = {
        from: from_address,
        to: admin_emails,
        reply_to: submission.email,
        subject: "📬 New Contact Form: #{submission.subject} — from #{submission.name}",
        html: contact_notification_html(submission)
      }

      response = Resend::Emails.send(params)

      Rails.logger.info "✅ Contact form notification sent (from: #{submission.email}, subject: #{submission.subject})"
      { success: true, message_id: response["id"] }

    rescue Resend::Error => e
      if Rails.env.development? && e.message.include?("domain is not verified")
        Rails.logger.info "ℹ️  Resend domain not verified (expected in development): #{e.message}"
      else
        Rails.logger.error "Resend Error sending contact notification: #{e.message}"
      end
      { success: false, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Email Error: #{e.class} - #{e.message}"
      { success: false, error: "Failed to send contact notification" }
    end
  end

  # Send catering inquiry confirmation email to customer
  # @param inquiry [CateringInquiry]
  # @return [Hash]
  def self.send_catering_inquiry_confirmation(inquiry)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?
    return { success: false, error: "Customer email missing" } unless inquiry.contact_email.present?

    begin
      params = {
        from: from_address,
        to: [ inquiry.contact_email ],
        subject: "We received your catering inquiry - Three Squares",
        html: catering_inquiry_confirmation_html(inquiry)
      }

      response = Resend::Emails.send(params)
      Rails.logger.info "✅ Catering inquiry confirmation sent to #{inquiry.contact_email} (Inquiry ##{inquiry.id})"
      { success: true, message_id: response["id"] }
    rescue Resend::Error => e
      if Rails.env.development? && e.message.include?("domain is not verified")
        Rails.logger.info "ℹ️  Resend domain not verified (expected in development): #{e.message}"
      else
        Rails.logger.error "Resend Error sending catering confirmation: #{e.message}"
      end
      { success: false, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Email Error: #{e.class} - #{e.message}"
      { success: false, error: "Failed to send catering confirmation" }
    end
  end

  # Send catering inquiry notification email to admins
  # @param inquiry [CateringInquiry]
  # @return [Hash]
  def self.send_catering_inquiry_notification(inquiry)
    return { success: false, error: "Resend API key not configured" } unless ENV["RESEND_API_KEY"].present?

    settings = SiteSetting.instance
    admin_emails = settings.order_notification_emails || [ "shimizutechnology@gmail.com" ]

    begin
      params = {
        from: from_address,
        to: admin_emails,
        reply_to: inquiry.contact_email,
        subject: "🍽️ New Catering Inquiry - #{inquiry.contact_name} (#{inquiry.event_type})",
        html: catering_inquiry_notification_html(inquiry)
      }

      response = Resend::Emails.send(params)
      Rails.logger.info "✅ Catering inquiry notification sent (Inquiry ##{inquiry.id})"
      { success: true, message_id: response["id"] }
    rescue Resend::Error => e
      if Rails.env.development? && e.message.include?("domain is not verified")
        Rails.logger.info "ℹ️  Resend domain not verified (expected in development): #{e.message}"
      else
        Rails.logger.error "Resend Error sending catering notification: #{e.message}"
      end
      { success: false, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Email Error: #{e.class} - #{e.message}"
      { success: false, error: "Failed to send catering notification" }
    end
  end

  # Generic status update email sender — used by confirmed, processing, picked_up, delivered, cancelled
  def self.send_status_email(order:, subject:, heading:, message:, color:)
    begin
      params = {
        from: from_address,
        to: [ order.customer_email ],
        subject: subject,
        html: status_update_html(order: order, heading: heading, message: message, color: color)
      }

      response = Resend::Emails.send(params)

      Rails.logger.info "✅ Status email sent to #{order.customer_email} (#{heading} - Order ##{order.order_number})"
      { success: true, message_id: response["id"] }

    rescue Resend::Error => e
      if Rails.env.development? && e.message.include?("domain is not verified")
        Rails.logger.info "ℹ️  Resend domain not verified (expected in development): #{e.message}"
      else
        Rails.logger.error "Resend Error sending status email: #{e.message}"
      end
      { success: false, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Email Error: #{e.class} - #{e.message}"
      { success: false, error: "Failed to send status email" }
    end
  end

  # Reusable HTML template for order status update emails
  def self.status_update_html(order:, heading:, message:, color:)
    contact_email = store_contact_email
    contact_phone = store_contact_phone

    # Build pickup location block for pickup orders
    location_section = if order.is_pickup_order? && order.location.present?
      loc = order.location
      <<~LOC
        <tr>
          <td style="padding: 0 30px 30px 30px;">
            <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 20px;">
              <h3 style="color: #92400E; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">Pickup Location</h3>
              <p style="color: #78350F; margin: 0; font-size: 15px; line-height: 1.6;">
                <strong>#{CGI.escapeHTML(loc.name)}</strong><br>
                #{CGI.escapeHTML(loc.address.to_s)}#{loc.phone.present? ? "<br>#{CGI.escapeHTML(loc.phone)}" : ""}
              </p>
            </div>
          </td>
        </tr>
      LOC
    else
      ""
    end

    <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>#{CGI.escapeHTML(heading)}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

                <!-- Header -->
                <tr>
                  <td style="background-color: #C1191F; padding: 32px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.5px; text-shadow: 0 2px 6px rgba(0,0,0,0.25);">Three Squares</h1>
                    <p style="color: #FFE08A; margin: 8px 0 0 0; font-size: 14px; font-weight: 600;">Chamorro Pride. Island Style.</p>
                  </td>
                </tr>

                <!-- Status Banner -->
                <tr>
                  <td style="padding: 40px 30px; text-align: center;">
                    <div style="background-color: #{color}10; border: 2px solid #{color}; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                      <h2 style="color: #{color}; margin: 0; font-size: 24px;">#{CGI.escapeHTML(heading)}</h2>
                    </div>
                    <p style="color: #6B7280; margin: 10px 0 0 0; font-size: 16px;">Order ##{order.order_number}</p>
                    <p style="color: #9CA3AF; margin: 5px 0 0 0; font-size: 14px;">Placed on #{order.created_at.strftime('%B %d, %Y')}</p>
                  </td>
                </tr>

                <!-- Message -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0;">#{CGI.escapeHTML(message)}</p>
                  </td>
                </tr>

                <!-- Pickup Location (if applicable) -->
                #{location_section}

                <!-- Order Items Summary -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <h3 style="color: #111827; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">Your Order:</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                      <tbody>
                        #{order_items_html(order)}
                      </tbody>
                      <tfoot>
                        <tr style="background-color: #F9FAFB; border-top: 2px solid #E5E7EB;">
                          <td colspan="2" style="padding: 15px; text-align: right; font-size: 16px; color: #111827; font-weight: bold;">Total:</td>
                          <td style="padding: 15px; text-align: right; font-size: 16px; color: #C1191F; font-weight: bold;">$#{format_price(order.total_cents)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
                    <p style="color: #6B7280; margin: 0 0 10px 0; font-size: 14px;">Questions about your order?</p>
                    <p style="color: #C1191F; margin: 0; font-size: 14px;"><a href="mailto:#{contact_email}" style="color: #C1191F; text-decoration: none;">#{contact_email}</a> | #{contact_phone}</p>
                    <p style="color: #9CA3AF; margin: 20px 0 0 0; font-size: 12px;">&copy; #{Time.current.year} Three Squares. All rights reserved.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    HTML
  end

  private

  # Configurable from address - uses RESEND_FROM_EMAIL env var
  # Falls back to shimizu-technology.com until three-squares domain is verified on Resend
  def self.from_address
    email = ENV.fetch("RESEND_FROM_EMAIL", "noreply@shimizu-technology.com")
    "Three Squares <#{email}>"
  end

  def self.store_contact_email
    SiteSetting.instance.store_email.presence || "sales@bgpacific.com"
  end

  def self.store_contact_phone
    SiteSetting.instance.store_phone.presence || "(671) 777-1234"
  end

  # Generate customer confirmation HTML
  def self.order_confirmation_html(order)
    settings = SiteSetting.instance
    contact_email = store_contact_email
    contact_phone = store_contact_phone
    test_mode_badge = settings.test_mode? ? '<span style="background: #FEF3C7; color: #92400E; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; display: inline-block; margin-top: 12px;">⚙️ TEST ORDER</span>' : ""

    <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      #{'          '}
                <!-- Header -->
                <tr>
                  <td style="background-color: #C1191F; background: #C1191F; padding: 32px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.5px; text-shadow: 0 2px 6px rgba(0,0,0,0.25);">Three Squares</h1>
                    <p style="color: #FFE08A; margin: 8px 0 0 0; font-size: 14px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.25);">Chamorro Pride. Island Style.</p>
                  </td>
                </tr>

                <!-- Order Confirmation -->
                <tr>
                  <td style="padding: 40px 30px; text-align: center;">
                    <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 24px;">Thank You For Your Order! 🎉</h2>
                    #{test_mode_badge}
                    <p style="color: #6B7280; margin: 20px 0 0 0; font-size: 16px;">Order ##{order.id.to_s.rjust(6, '0')}</p>
                    <p style="color: #9CA3AF; margin: 5px 0 0 0; font-size: 14px;">#{order.created_at.strftime('%B %d, %Y at %I:%M %p')}</p>
                  </td>
                </tr>

                <!-- Order Items -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                      <thead>
                        <tr style="background-color: #F9FAFB;">
                          <th style="padding: 15px; text-align: left; font-size: 14px; color: #6B7280; font-weight: 600;">Item</th>
                          <th style="padding: 15px; text-align: center; font-size: 14px; color: #6B7280; font-weight: 600;">Qty</th>
                          <th style="padding: 15px; text-align: right; font-size: 14px; color: #6B7280; font-weight: 600;">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        #{order_items_html(order)}
                      </tbody>
                      <tfoot>
                        <tr style="border-top: 2px solid #E5E7EB;">
                          <td colspan="2" style="padding: 15px; text-align: right; font-size: 14px; color: #6B7280;">Subtotal:</td>
                          <td style="padding: 15px; text-align: right; font-size: 14px; color: #111827; font-weight: 600;">$#{format_price(order.subtotal_cents)}</td>
                        </tr>
                        <tr>
                          <td colspan="2" style="padding: 0 15px 15px 15px; text-align: right; font-size: 14px; color: #6B7280;">Shipping:</td>
                          <td style="padding: 0 15px 15px 15px; text-align: right; font-size: 14px; color: #111827; font-weight: 600;">$#{format_price(order.shipping_cost_cents)}</td>
                        </tr>
                        <tr style="background-color: #F9FAFB;">
                          <td colspan="2" style="padding: 15px; text-align: right; font-size: 16px; color: #111827; font-weight: bold;">Total:</td>
                          <td style="padding: 15px; text-align: right; font-size: 16px; color: #C1191F; font-weight: bold;">$#{format_price(order.total_cents)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </td>
                </tr>

                <!-- Fulfillment Details -->
                #{order_fulfillment_section_html(order)}

                <!-- Footer -->
                <tr>
                  <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
                    <p style="color: #6B7280; margin: 0 0 10px 0; font-size: 14px;">Questions about your order?</p>
                    <p style="color: #C1191F; margin: 0; font-size: 14px;"><a href="mailto:#{contact_email}" style="color: #C1191F; text-decoration: none;">#{contact_email}</a> | #{contact_phone}</p>
                    <p style="color: #9CA3AF; margin: 20px 0 0 0; font-size: 12px;">&copy; #{Time.current.year} Three Squares. All rights reserved.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    HTML
  end

  # Generate admin notification HTML
  def self.admin_notification_html(order)
    settings = SiteSetting.instance
    contact_email = store_contact_email
    contact_phone = store_contact_phone
    test_mode_badge = settings.test_mode? ? '<span style="background: #FEF3C7; color: #92400E; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; display: inline-block; margin-top: 12px;">⚙️ TEST ORDER</span>' : ""

    <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Order</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      #{'          '}
                <!-- Header -->
                <tr>
                  <td style="background-color: #111827; background: #111827; padding: 32px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; line-height: 1.2; text-shadow: 0 2px 6px rgba(0,0,0,0.35);">🍽️ New Order Received</h1>
                    #{test_mode_badge}
                  </td>
                </tr>

                <!-- Order Info -->
                <tr>
                  <td style="padding: 30px;">
                    <h2 style="color: #111827; margin: 0 0 20px 0; font-size: 20px;">Order ##{order.id.to_s.rjust(6, '0')}</h2>
      #{'              '}
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">Customer:</strong>
                          <span style="color: #111827; font-size: 14px; float: right;">#{order.customer_email}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">Phone:</strong>
                          <span style="color: #111827; font-size: 14px; float: right;">#{CGI.escapeHTML(order.customer_phone || 'N/A')}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">Location:</strong>
                          <span style="color: #111827; font-size: 14px; float: right;">#{order.location&.name || 'N/A'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">Type:</strong>
                          <span style="color: #111827; font-size: 14px; float: right;">#{order.fulfillment_type&.titleize || 'N/A'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">Date:</strong>
                          <span style="color: #111827; font-size: 14px; float: right;">#{order.created_at.strftime('%B %d, %Y at %I:%M %p')}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">Payment Status:</strong>
                          <span style="color: #10B981; font-size: 14px; float: right;">#{order.payment_status.titleize}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0;">
                          <strong style="color: #6B7280; font-size: 14px;">Total:</strong>
                          <span style="color: #C1191F; font-size: 18px; font-weight: bold; float: right;">$#{format_price(order.total_cents)}</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Items -->
                    <h3 style="color: #111827; margin: 30px 0 15px 0; font-size: 16px;">Order Items:</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                      <tbody>
                        #{order_items_html(order)}
                      </tbody>
                    </table>

                    <!-- Shipping Info -->
                    <h3 style="color: #111827; margin: 30px 0 15px 0; font-size: 16px;">Shipping Details:</h3>
                    <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px;">
                      <p style="color: #111827; margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">#{CGI.escapeHTML(order.name.to_s)}</p>
                      <p style="color: #6B7280; margin: 0; font-size: 14px; line-height: 1.6;">
                        #{CGI.escapeHTML(order.shipping_address_line1.to_s)}<br>
                        #{order.shipping_address_line2.present? ? "#{CGI.escapeHTML(order.shipping_address_line2)}<br>" : ""}
                        #{CGI.escapeHTML(order.shipping_city.to_s)}, #{CGI.escapeHTML(order.shipping_state.to_s)} #{CGI.escapeHTML(order.shipping_zip.to_s)}<br>
                        #{CGI.escapeHTML(order.shipping_country.to_s)}
                      </p>
                      <p style="color: #6B7280; margin: 15px 0 0 0; font-size: 14px;">
                        <strong>Method:</strong> #{CGI.escapeHTML(order.shipping_method.to_s)}
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #E5E7EB;">
                    <p style="color: #6B7280; margin: 0; font-size: 12px;">This is an automated notification from Three Squares Order System</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    HTML
  end

  # Generate fulfillment details section (pickup location or shipping address)
  def self.order_fulfillment_section_html(order)
    if order.is_pickup_order? && order.location.present?
      loc = order.location
      <<~HTML
        <tr>
          <td style="padding: 0 30px 30px 30px;">
            <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 20px;">
              <h3 style="color: #92400E; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">Pickup Location</h3>
              <p style="color: #78350F; margin: 0; font-size: 15px; line-height: 1.6;">
                <strong>#{CGI.escapeHTML(loc.name)}</strong><br>
                #{CGI.escapeHTML(loc.address.to_s)}#{loc.phone.present? ? "<br>#{CGI.escapeHTML(loc.phone)}" : ""}
              </p>
            </div>
          </td>
        </tr>
      HTML
    elsif order.shipping_address_line1.present?
      <<~HTML
        <tr>
          <td style="padding: 0 30px 30px 30px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" style="padding-right: 10px;">
                  <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px;">
                    <h3 style="color: #111827; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">Shipping Address</h3>
                    <p style="color: #6B7280; margin: 5px 0; font-size: 14px; line-height: 1.6;">
                      #{CGI.escapeHTML(order.name.to_s)}<br>
                      #{CGI.escapeHTML(order.shipping_address_line1.to_s)}<br>
                      #{order.shipping_address_line2.present? ? "#{CGI.escapeHTML(order.shipping_address_line2)}<br>" : ""}
                      #{CGI.escapeHTML(order.shipping_city.to_s)}, #{CGI.escapeHTML(order.shipping_state.to_s)} #{CGI.escapeHTML(order.shipping_zip.to_s)}<br>
                      #{CGI.escapeHTML(order.shipping_country.to_s)}
                    </p>
                  </div>
                </td>
                <td width="50%" style="padding-left: 10px;">
                  <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px;">
                    <h3 style="color: #111827; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">Shipping Method</h3>
                    <p style="color: #6B7280; margin: 5px 0; font-size: 14px; line-height: 1.6;">
                      #{CGI.escapeHTML(order.shipping_method.to_s)}
                    </p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      HTML
    else
      ""
    end
  end

  # Generate order items table rows
  def self.order_items_html(order)
    order.order_items.map do |item|
      variant_info = item.variant_name.present? ? " (#{item.variant_name})" : ""
      <<~HTML
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 15px; font-size: 14px; color: #111827;">
            #{item.product_name}#{variant_info}
          </td>
          <td style="padding: 15px; text-align: center; font-size: 14px; color: #6B7280;">#{item.quantity}</td>
          <td style="padding: 15px; text-align: right; font-size: 14px; color: #111827; font-weight: 600;">$#{format_price(item.total_price_cents)}</td>
        </tr>
      HTML
    end.join
  end

  # Format price from cents to dollars
  def self.format_price(cents)
    "%.2f" % (cents / 100.0)
  end

  # Generate order shipped HTML
  def self.order_shipped_html(order)
    contact_email = store_contact_email
    contact_phone = store_contact_phone
    tracking_section = if order.tracking_number.present?
      <<~HTML
        <tr>
          <td style="padding: 0 30px 30px 30px;">
            <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); border-radius: 8px; padding: 25px; text-align: center;">
              <p style="color: #ffffff; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">📦 Tracking Number</p>
              <p style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 2px;">#{order.tracking_number}</p>
            </div>
          </td>
        </tr>
      HTML
    else
      ""
    end

    <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Shipped</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      #{'          '}
                <!-- Header -->
                <tr>
                  <td style="background-color: #C1191F; background: #C1191F; padding: 32px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.5px; text-shadow: 0 2px 6px rgba(0,0,0,0.25);">Three Squares</h1>
                    <p style="color: #FFE08A; margin: 8px 0 0 0; font-size: 14px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.25);">Chamorro Pride. Island Style.</p>
                  </td>
                </tr>

                <!-- Shipped Message -->
                <tr>
                  <td style="padding: 40px 30px; text-align: center;">
                    <div style="background-color: #ECFDF5; border: 2px solid #10B981; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                      <h2 style="color: #059669; margin: 0; font-size: 24px;">📦 Your Order Has Shipped!</h2>
                    </div>
                    <p style="color: #6B7280; margin: 10px 0 0 0; font-size: 16px;">Order ##{order.order_number}</p>
                    <p style="color: #9CA3AF; margin: 5px 0 0 0; font-size: 14px;">Placed on #{order.created_at.strftime('%B %d, %Y')}</p>
                  </td>
                </tr>

                <!-- Tracking Number -->
                #{tracking_section}

                <!-- Order Items Summary -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <h3 style="color: #111827; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">What's in your package:</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                      <tbody>
                        #{order_items_html(order)}
                      </tbody>
                    </table>
                  </td>
                </tr>

                <!-- Shipping Address -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px;">
                      <h3 style="color: #111827; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">Shipping To:</h3>
                      <p style="color: #6B7280; margin: 5px 0; font-size: 14px; line-height: 1.6;">
                        #{CGI.escapeHTML(order.name.to_s)}<br>
                        #{CGI.escapeHTML(order.shipping_address_line1.to_s)}<br>
                        #{order.shipping_address_line2.present? ? "#{CGI.escapeHTML(order.shipping_address_line2)}<br>" : ""}
                        #{CGI.escapeHTML(order.shipping_city.to_s)}, #{CGI.escapeHTML(order.shipping_state.to_s)} #{CGI.escapeHTML(order.shipping_zip.to_s)}<br>
                        #{CGI.escapeHTML(order.shipping_country.to_s)}
                      </p>
                      <p style="color: #6B7280; margin: 15px 0 0 0; font-size: 14px;">
                        <strong>Method:</strong> #{CGI.escapeHTML(order.shipping_method.to_s)}
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
                    <p style="color: #6B7280; margin: 0 0 10px 0; font-size: 14px;">Questions about your order?</p>
                    <p style="color: #C1191F; margin: 0; font-size: 14px;"><a href="mailto:#{contact_email}" style="color: #C1191F; text-decoration: none;">#{contact_email}</a> | #{contact_phone}</p>
                    <p style="color: #9CA3AF; margin: 20px 0 0 0; font-size: 12px;">&copy; #{Time.current.year} Three Squares. All rights reserved.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    HTML
  end

  # Generate order ready for pickup HTML
  def self.order_ready_html(order)
    pickup_location = order.location&.name || "Contact us for pickup location"
    pickup_phone = store_contact_phone
    contact_email = store_contact_email
    contact_phone = store_contact_phone

    pickup_time_section = ""

    emoji = "\u{1F4E6}"
    title = "Your Order is Ready for Pickup!"

    <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Ready for Pickup</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      #{'          '}
                <!-- Header -->
                <tr>
                  <td style="background-color: #C1191F; background: #C1191F; padding: 32px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.5px; text-shadow: 0 2px 6px rgba(0,0,0,0.25);">Three Squares</h1>
                    <p style="color: #FFE08A; margin: 8px 0 0 0; font-size: 14px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.25);">Chamorro Pride. Island Style.</p>
                  </td>
                </tr>

                <!-- Ready Message -->
                <tr>
                  <td style="padding: 40px 30px; text-align: center;">
                    <div style="background-color: #F0FDF4; border: 2px solid #22C55E; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                      <h2 style="color: #16A34A; margin: 0; font-size: 24px;">#{emoji} #{title}</h2>
                    </div>
                    <p style="color: #6B7280; margin: 10px 0 0 0; font-size: 16px;">Order ##{order.order_number}</p>
                    <p style="color: #9CA3AF; margin: 5px 0 0 0; font-size: 14px;">Placed on #{order.created_at.strftime('%B %d, %Y')}</p>
                  </td>
                </tr>

                <!-- Pickup Time -->
                #{pickup_time_section}

                <!-- Pickup Location -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 20px;">
                      <h3 style="color: #92400E; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">📍 Pickup Location</h3>
                      <p style="color: #78350F; margin: 0; font-size: 16px; line-height: 1.6;">
                        #{pickup_location}
                      </p>
                      <p style="color: #92400E; margin: 15px 0 0 0; font-size: 14px;">
                        <strong>Questions?</strong> Call #{pickup_phone}
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Order Items Summary -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <h3 style="color: #111827; margin: 0 0 15px 0; font-size: 18px; font-weight: 600;">Your Order:</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                      <tbody>
                        #{order_items_html(order)}
                      </tbody>
                    </table>
                  </td>
                </tr>

                <!-- Customer Info -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <div style="background-color: #F9FAFB; border-radius: 8px; padding: 20px;">
                      <h3 style="color: #111827; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">Pickup Information:</h3>
                      <p style="color: #6B7280; margin: 5px 0; font-size: 14px; line-height: 1.6;">
                        <strong>Name:</strong> #{order.name}<br>
                        <strong>Email:</strong> #{order.customer_email}<br>
                        <strong>Phone:</strong> #{CGI.escapeHTML(order.customer_phone.to_s)}
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
                    <p style="color: #6B7280; margin: 0 0 10px 0; font-size: 14px;">Thank you for your order!</p>
                    <p style="color: #C1191F; margin: 0; font-size: 14px;"><a href="mailto:#{contact_email}" style="color: #C1191F; text-decoration: none;">#{contact_email}</a> | #{contact_phone}</p>
                    <p style="color: #9CA3AF; margin: 20px 0 0 0; font-size: 12px;">&copy; #{Time.current.year} Three Squares. All rights reserved.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    HTML
  end

  # Generate contact form notification HTML
  def self.contact_notification_html(submission)
    subject_labels = {
      "general" => "General Inquiry",
      "order" => "Order Question",
      "shipping" => "Shipping & Delivery",
      "returns" => "Returns & Exchanges",
      "wholesale" => "Wholesale / Bulk Orders",
      "other" => "Other"
    }
    subject_display = subject_labels[submission.subject] || submission.subject

    # Escape user-provided content to prevent XSS in email HTML
    escaped_name = CGI.escapeHTML(submission.name.to_s)
    escaped_email = CGI.escapeHTML(submission.email.to_s)
    escaped_message = CGI.escapeHTML(submission.message.to_s)
    escaped_subject = CGI.escapeHTML(subject_display.to_s)

    <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Contact Form Submission</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

                <!-- Header -->
                <tr>
                  <td style="background-color: #111827; background: #111827; padding: 28px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; line-height: 1.2; text-shadow: 0 2px 6px rgba(0,0,0,0.35);">📬 New Contact Form Message</h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 30px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">From:</strong>
                          <span style="color: #111827; font-size: 14px; float: right;">#{escaped_name}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">Email:</strong>
                          <span style="color: #111827; font-size: 14px; float: right;">
                            <a href="mailto:#{escaped_email}" style="color: #C1191F; text-decoration: none;">#{escaped_email}</a>
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB;">
                          <strong style="color: #6B7280; font-size: 14px;">Subject:</strong>
                          <span style="color: #111827; font-size: 14px; float: right;">#{escaped_subject}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0;">
                          <strong style="color: #6B7280; font-size: 14px;">Date:</strong>
                          <span style="color: #111827; font-size: 14px; float: right;">#{submission.created_at.strftime('%B %d, %Y at %I:%M %p')}</span>
                        </td>
                      </tr>
                    </table>

                    <div style="background-color: #F9FAFB; border-left: 4px solid #C1191F; padding: 20px; border-radius: 0 4px 4px 0;">
                      <h3 style="color: #111827; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">Message</h3>
                      <p style="color: #374151; margin: 0; font-size: 14px; line-height: 1.8; white-space: pre-wrap;">#{escaped_message}</p>
                    </div>

                    <div style="margin-top: 24px; text-align: center;">
                      <a href="mailto:#{escaped_email}?subject=Re: #{escaped_subject}" style="display: inline-block; background-color: #C1191F; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Reply to #{escaped_name}</a>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #F9FAFB; padding: 20px; text-align: center; border-top: 1px solid #E5E7EB;">
                    <p style="color: #6B7280; margin: 0; font-size: 12px;">This message was sent via the Three Squares website contact form.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    HTML
  end

  def self.catering_inquiry_confirmation_html(inquiry)
    event_date = inquiry.event_date&.strftime("%A, %B %d, %Y")
    event_type = CGI.escapeHTML(inquiry.event_type.to_s.titleize)
    contact_name = CGI.escapeHTML(inquiry.contact_name.to_s)
    guest_count = inquiry.guest_count.to_i
    venue = inquiry.venue_address.present? ? CGI.escapeHTML(inquiry.venue_address.to_s) : "Not specified"
    event_time = CGI.escapeHTML(inquiry.event_time.to_s)

    <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Catering Inquiry Received</title>
      </head>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f3f4f6;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(17,24,39,0.08);">
                <tr>
                  <td style="background:linear-gradient(135deg,#C1191F 0%,#991B1B 100%);padding:30px 24px;text-align:center;">
                    <p style="margin:0;color:#FEE2E2;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Three Squares Catering</p>
                    <h1 style="margin:8px 0 0 0;color:#ffffff;font-size:28px;font-weight:800;line-height:1.2;">Inquiry Received</h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px 28px 26px 28px;text-align:center;">
                    <h2 style="margin:0 0 10px 0;color:#111827;font-size:24px;">Thanks, #{contact_name}!</h2>
                    <p style="margin:0;color:#4B5563;line-height:1.65;font-size:15px;">We received your catering inquiry. Our team will follow up within 24-48 hours with next steps and menu recommendations.</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 24px 24px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
                      <tr>
                        <td colspan="2" style="padding:14px 16px;background:#ffffff;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;color:#374151;letter-spacing:0.02em;">Inquiry Summary</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 16px;color:#6B7280;font-size:14px;font-weight:600;width:140px;">Event</td>
                        <td style="padding:12px 16px;color:#111827;font-size:14px;">#{event_type}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 12px 16px;color:#6B7280;font-size:14px;font-weight:600;">Date/Time</td>
                        <td style="padding:0 16px 12px 16px;color:#111827;font-size:14px;">#{event_date || "TBD"} #{event_time.present? ? "at #{event_time}" : ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 12px 16px;color:#6B7280;font-size:14px;font-weight:600;">Guests</td>
                        <td style="padding:0 16px 12px 16px;color:#111827;font-size:14px;">#{guest_count.positive? ? guest_count : "TBD"}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 16px 16px;color:#6B7280;font-size:14px;font-weight:600;">Venue</td>
                        <td style="padding:0 16px 16px 16px;color:#111827;font-size:14px;">#{venue}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 28px 28px 28px;text-align:center;">
                    <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.6;">If this wasn't you, simply reply to this email and we'll review it right away.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    HTML
  end

  def self.catering_inquiry_notification_html(inquiry)
    contact_name = CGI.escapeHTML(inquiry.contact_name.to_s)
    contact_email = CGI.escapeHTML(inquiry.contact_email.to_s)
    contact_phone = CGI.escapeHTML(inquiry.contact_phone.to_s)
    company_name = CGI.escapeHTML(inquiry.company_name.to_s)
    event_type = CGI.escapeHTML(inquiry.event_type.to_s.titleize)
    event_date = inquiry.event_date&.strftime("%A, %B %d, %Y")
    event_time = CGI.escapeHTML(inquiry.event_time.to_s)
    guest_count = inquiry.guest_count.to_i
    budget = CGI.escapeHTML(inquiry.budget_range.to_s)
    venue = CGI.escapeHTML(inquiry.venue_address.to_s)
    menu_prefs = CGI.escapeHTML(inquiry.menu_preferences.to_s)
    dietary = CGI.escapeHTML(inquiry.dietary_restrictions.to_s)
    special = CGI.escapeHTML(inquiry.special_requests.to_s)

    <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Catering Inquiry</title>
      </head>
      <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;background:#f3f4f6;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(17,24,39,0.10);">
                <tr>
                  <td style="background:linear-gradient(135deg,#111827 0%,#1F2937 100%);padding:28px 24px;text-align:center;">
                    <p style="margin:0;color:#CBD5E1;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Three Squares Catering</p>
                    <h1 style="margin:8px 0 0 0;color:#ffffff;font-size:26px;font-weight:800;line-height:1.2;">🍽️ New Catering Inquiry</h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
                      <tr>
                        <td colspan="2" style="padding:14px 16px;background:#ffffff;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;color:#374151;letter-spacing:0.02em;">Inquiry Details</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 16px;color:#6B7280;font-size:14px;font-weight:600;width:150px;">Contact</td>
                        <td style="padding:12px 16px;color:#111827;font-size:14px;">#{contact_name}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 12px 16px;color:#6B7280;font-size:14px;font-weight:600;">Email</td>
                        <td style="padding:0 16px 12px 16px;color:#111827;font-size:14px;"><a href="mailto:#{contact_email}" style="color:#C1191F;text-decoration:none;">#{contact_email}</a></td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 12px 16px;color:#6B7280;font-size:14px;font-weight:600;">Phone</td>
                        <td style="padding:0 16px 12px 16px;color:#111827;font-size:14px;">#{contact_phone.presence || "Not provided"}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 12px 16px;color:#6B7280;font-size:14px;font-weight:600;">Company</td>
                        <td style="padding:0 16px 12px 16px;color:#111827;font-size:14px;">#{company_name.presence || "Not provided"}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 12px 16px;color:#6B7280;font-size:14px;font-weight:600;">Event</td>
                        <td style="padding:0 16px 12px 16px;color:#111827;font-size:14px;">#{event_type}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 12px 16px;color:#6B7280;font-size:14px;font-weight:600;">Date/Time</td>
                        <td style="padding:0 16px 12px 16px;color:#111827;font-size:14px;">#{event_date || "TBD"} #{event_time.present? ? "at #{event_time}" : ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 12px 16px;color:#6B7280;font-size:14px;font-weight:600;">Guests</td>
                        <td style="padding:0 16px 12px 16px;color:#111827;font-size:14px;">#{guest_count.positive? ? guest_count : "TBD"}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 12px 16px;color:#6B7280;font-size:14px;font-weight:600;">Budget</td>
                        <td style="padding:0 16px 12px 16px;color:#111827;font-size:14px;">#{budget.presence || "Not provided"}</td>
                      </tr>
                      <tr>
                        <td style="padding:0 16px 16px 16px;color:#6B7280;font-size:14px;font-weight:600;">Venue</td>
                        <td style="padding:0 16px 16px 16px;color:#111827;font-size:14px;">#{venue.presence || "Not provided"}</td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                      <tr>
                        <td style="background:#ffffff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px;">
                          <p style="margin:0 0 6px 0;color:#6B7280;font-size:12px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;">Menu Preferences</p>
                          <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">#{menu_prefs.presence || "None"}</p>
                        </td>
                      </tr>
                      <tr><td style="height:10px;"></td></tr>
                      <tr>
                        <td style="background:#ffffff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px;">
                          <p style="margin:0 0 6px 0;color:#6B7280;font-size:12px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;">Dietary Restrictions</p>
                          <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">#{dietary.presence || "None"}</p>
                        </td>
                      </tr>
                      <tr><td style="height:10px;"></td></tr>
                      <tr>
                        <td style="background:#ffffff;border:1px solid #E5E7EB;border-radius:12px;padding:14px 16px;">
                          <p style="margin:0 0 6px 0;color:#6B7280;font-size:12px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;">Special Requests</p>
                          <p style="margin:0;color:#111827;font-size:14px;line-height:1.6;">#{special.presence || "None"}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    HTML
  end

  # Generate refund notification HTML
  def self.refund_notification_html(order, amount_formatted, reason, refund_date)
    reason_row = if reason.present?
      <<~HTML
        <tr>
          <td style="padding: 8px 0; color: #6B7280; width: 140px; font-weight: 500;">Reason</td>
          <td style="padding: 8px 0; color: #111827; font-weight: 600;">#{reason}</td>
        </tr>
      HTML
    else
      ""
    end

    <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Refund Processed</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

                <!-- Header -->
                <tr>
                  <td style="background-color: #C1191F; background: #C1191F; padding: 32px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.5px; text-shadow: 0 2px 6px rgba(0,0,0,0.25);">Three Squares</h1>
                    <p style="color: #FFE08A; margin: 8px 0 0 0; font-size: 14px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.25);">Chamorro Pride. Island Style.</p>
                  </td>
                </tr>

                <!-- Refund Info -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #111827; margin: 0 0 20px 0; font-size: 24px;">Refund Processed</h2>

                    <p style="color: #6B7280; font-size: 16px;">Hi #{order.name || 'there'},</p>
                    <p style="color: #6B7280; font-size: 16px;">We've processed a refund for your order. Here are the details:</p>

                    <div style="background-color: #F9FAFB; border-left: 4px solid #C1191F; padding: 20px; margin: 24px 0; border-radius: 0 4px 4px 0;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding: 8px 0; color: #6B7280; width: 140px; font-weight: 500;">Order Number</td>
                          <td style="padding: 8px 0; color: #111827; font-weight: 600;">##{order.order_number}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0; color: #6B7280; width: 140px; font-weight: 500;">Refund Amount</td>
                          <td style="padding: 8px 0; color: #C1191F; font-size: 24px; font-weight: 700;">#{amount_formatted}</td>
                        </tr>
                        #{reason_row}
                        <tr>
                          <td style="padding: 8px 0; color: #6B7280; width: 140px; font-weight: 500;">Refund Date</td>
                          <td style="padding: 8px 0; color: #111827; font-weight: 600;">#{refund_date}</td>
                        </tr>
                      </table>
                    </div>

                    <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; padding: 16px 20px; border-radius: 4px; margin: 24px 0; font-size: 14px; color: #92400E;">
                      <strong style="display: block; margin-bottom: 4px;">📅 When will I see my refund?</strong>
                      Please allow 5&ndash;10 business days for the refund to appear on your original payment method.
                      Processing times may vary depending on your bank or card issuer.
                    </div>

                    <p style="color: #6B7280; font-size: 16px;">If you have any questions about this refund, please don't hesitate to reach out to us.</p>
                    <p style="color: #6B7280; font-size: 16px;">Thank you for shopping with Three Squares!</p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
                    <p style="color: #6B7280; margin: 0 0 10px 0; font-size: 14px;">Questions about your order?</p>
                    <p style="color: #C1191F; margin: 0; font-size: 14px;"><a href="mailto:#{contact_email}" style="color: #C1191F; text-decoration: none;">#{contact_email}</a> | #{contact_phone}</p>
                    <p style="color: #9CA3AF; margin: 20px 0 0 0; font-size: 12px;">&copy; #{Time.current.year} Three Squares. All rights reserved.</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    HTML
  end

end
