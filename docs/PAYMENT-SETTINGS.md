# Payment settings status

The owner's Settings payment section is read-only. It shows the selected provider for **new** payments and each active location/channel's effective enabled profile (local profile first, then that provider's default), original identity, environment, processor network gate and blocking configuration checks. A missing profile stays visibly unconfigured. It does not reroute saved attempts/refunds or change any environment guard.

The legacy `payment_test_mode` switch and charge-mode promises have been removed. Both settings API update endpoints keep this legacy field read-only; its stored value is retained for compatibility and production boot checks. Provider/profile assignment remains the existing operator/API responsibility. There is no new activation or assignment mutation.

Only owners have `payment_settings.manage`; all-locations and scoped managers retain their existing denial of settings. No credential values or arbitrary profile capabilities are returned. Status construction is local and sends no provider traffic. Gate-on status is subject to actual payment validation and does not prove account verification, processor certification, device readiness or permission to resume production.

Refreshing or retrying payment status cannot overwrite general/email/storefront drafts: it has an independent request and state. A failed refresh hides the old enabled/blocked claim and explicitly says previously loaded data may be stale. Loading/error/retry are named, and statuses use text rather than color alone.
