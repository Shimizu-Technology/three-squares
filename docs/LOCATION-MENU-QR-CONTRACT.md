# Location menus and printed QR codes

`/menu/:locationSlug` resolves an active location through the public location show endpoint. Unknown and inactive slugs show a not-found page. A direct link fixes the product location filter even if another `location_id` query parameter is supplied. The location context picker changes the canonical route after the existing cart confirmation succeeds.

Direct entry checks the server cart before changing pickup selection. Empty carts select the requested location. A nonempty cart for another location requires an explicit keep-current or Switch & Clear decision. A failed cart read or clear retains the old location and offers recovery. This UI does not replace server eligibility checks owned by the payments layer.

Admin location cards generate a QR for saved location details. Staff can download the SVG or open a printable page containing only the location name, QR and public menu URL. The code uses a four-module quiet zone and high error correction. Generation saves `qr_code_url` without modifying other location settings.

The public origin comes from `PUBLIC_STOREFRONT_ORIGIN`, then `FRONTEND_URL`, then the existing production web origin `https://three-squares-web.netlify.app`. Configure an HTTPS origin with a DNS hostname, no credentials, path, query, fragment, or alternate port. Literal IPs and local hostnames are rejected in production. HTTP loopback with an explicit port is allowed only outside production for isolated QA. If a caller supplies `base_url`, it must normalize to the same configured origin; it cannot choose an arbitrary QR destination. Location slugs must be lowercase words separated by hyphens before QR generation.

No hosting settings are changed by this port. Production continues through the existing paused API preview while Render remains owner-suspended. Physical camera scanning and printer output require operator verification; automated QA records decoded browser-rendered QR images and the download/print-preview flow separately.
