class QrCodeService
  attr_reader :location, :base_url

  # @param location [Location] the location to generate a QR code for
  # @param base_url [String] the frontend base URL
  def initialize(location, base_url:)
    @location = location
    @base_url = base_url.chomp("/")
  end

  # The URL the QR code encodes — directs customers to the menu for this location
  def menu_url
    "#{base_url}/menu?location=#{CGI.escape(location.slug)}"
  end

  # Generate QR code as PNG binary data
  # @param size [Integer] pixel dimensions (width & height) of the output image
  # @return [String] PNG binary data
  def to_png(size: 600)
    qr = build_qr
    qr.as_png(
      bit_depth: 1,
      border_modules: 2,
      color_mode: ChunkyPNG::COLOR_GRAYSCALE,
      color: "black",
      file: nil,
      fill: "white",
      module_px_size: pixel_size_for(qr, size, border_modules: 2),
      resize_exactly_to: size,
      resize_gte_to: false
    ).to_s
  end

  # Generate QR code as SVG string
  # @param module_size [Integer] size of each QR module in the SVG
  # @return [String] SVG markup
  def to_svg(module_size: 6)
    qr = build_qr
    qr.as_svg(
      module_size: module_size,
      standalone: true,
      use_path: true,
      viewbox: true
    )
  end

  # Generate QR code as a base64 data URI for inline display
  # @param size [Integer] pixel dimensions of the PNG
  # @return [String] data URI string (e.g. "data:image/png;base64,...")
  def to_data_uri(size: 600)
    png_data = to_png(size: size)
    encoded = Base64.strict_encode64(png_data)
    "data:image/png;base64,#{encoded}"
  end

  private

  def build_qr
    RQRCode::QRCode.new(menu_url, level: :h)
  end

  # Calculate module pixel size to fill the target image size
  def pixel_size_for(qr, target_size, border_modules: 2)
    module_count = qr.modules.length + (border_modules * 2)
    [ (target_size.to_f / module_count).floor, 1 ].max
  end
end
