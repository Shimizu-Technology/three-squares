# Import menu items

Open **Menu CSV** from navigation or Products. Use the same [template](data/products-import-template.csv): `name` and `price` are required; `description`, `category_name`, `active` and `locations` are optional. Prices use dollars with at most two decimal places. Use existing pickup location names or slugs, separated by `;` or `|`. UTF-8 files are limited to 2 MB and 2,000 rows.

Blank locations create an unpublished draft, including `active=false` rows. Open its exact **Edit item** link, select authorized pickup locations and save. Publication remains an explicit choice. **Needs pickup locations** finds unfinished drafts without replacing Shopify attention warnings. Legacy products with no location rows retain their existing all-location meaning.

The results link to exact created items and **Review this batch**. Skipped rows have no created item: correct those rows in a new CSV with the header and upload them again. Owners and managers can import menus; location scope is enforced per row. Counter staff cannot import. Shopify migration is separate and additionally requires shared-stock permission.

The five latest completed batch receipts are stored per account in this tab when browser storage works. Navigation and reload can recover them; closing the tab or changing devices cannot. A lost or interrupted response is not proof that the import failed: check Products before retrying. If storage fails, review the in-memory results before leaving the app.
