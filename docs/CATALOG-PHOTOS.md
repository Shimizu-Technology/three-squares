# Catalog photo contract

A dish photo must show that dish. A matching URL slug alone does not establish image identity. The legacy seed assigned generic plates to unrelated dishes (including a rice plate for French Toast and a burger for Philly cheesesteak).

The photo audit compared all 76 legacy S3 files by SHA-256 with `docs/assets/images`; all matched existing files exactly. The named subject and visual content support these food seed assignments:

| Catalog item | Owned source asset |
| --- | --- |
| Bleu Cheese Burger | `Bleu_Chz_Burger.jpg` |
| Cheeseburger, Donki Cheeseburger | `Cheeseburger.jpg` |
| Loco Moco | `Loco_Moco.JPG` |
| Bread Pudding | `bread_pudding_ala_mode.jpg` |
| Charcuterie Board | `Charcutterie_Board.JPG` |
| Kelaguen Poppers | `Cocktail_Stations_-_Assorted_Poppers.jpg` |
| Mini Salad Cups | `Cocktail_Stations_-_Mini_Crudite_and_Mini_Salad_Cups.jpg` |
| Seafood Kaddo | `Seafood_Kaddo_-_Small_Platter.jpg` |
| Mini Bento | `Mini_Bentos.jpg` |
| Shrimp Fried Rice Bento | `Bulk_Bento_-_Shrimp_Fried_Rice.jpeg` |
| Roast Pig Carving | `Roast_Pig.JPG` |

Other food assignments are left without a seed photo until a matching photo is approved. The seed helper removes only the exact old URL **and** S3 key pair for that dish. It preserves custom uploads, different keys, unrelated products and deferred cookie seed behavior. Repeated seed runs are idempotent. It does not upload or delete S3 objects. Existing databases are corrected by an explicitly authorized seed replay; this is not a production migration.

`OptimizedImage` reserves its caller's image slot through loading, retry and failure. It tries the transformed source, original source, and optional explicit fallback once each, then renders an intentional unavailable state. New source/options start a new lifecycle. `PlaceholderImage` uses restrained branding and clear unavailable/loading text rather than filling the slot with a logo. Names, prices and actions remain visible throughout.

Photo identity does not approve portions, availability, package contents or business terms. The content owner still needs to approve those facts and supply missing dish photographs before launch. No stock or generated food photo is used as a substitute for a real dish.
