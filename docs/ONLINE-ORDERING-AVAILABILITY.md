# Online ordering availability

`SiteSetting.online_ordering_paused` defaults to false. The optional customer message is limited to 240 characters. The public config returns the saved pause decision and effective message; API reachability never changes that decision. The owner-only `online_ordering` endpoint saves state and its audit row in one transaction. Replaying an unchanged state/message does not duplicate the audit.

New online cart additions, checkout intents and untouched payment setup are refused while paused. The first dispatch decision takes a shared settings-row lock; owner saves take an exclusive lock. Dispatched or ambiguous payments keep their original reconciliation/finalization path, including existing idempotency replays. Staff POS and queues do not inherit the public pause. Catering eligibility remains an independent gate.

Customers can browse the loaded menu while paused, with a banner and disabled checkout. A failed config request retains the last successful config and mounted content, reports a connection problem, and disables new checkout until connected again. With no successful config in the current page session, the customer sees a connection screen rather than an invented menu or an open-ordering claim. Staff routes bypass this customer boundary entirely.

Config requests time out after seven seconds. Successful checks refresh every fifteen seconds; failures retry after two, four, eight, sixteen, then at most thirty seconds. Manual retry coalesces with an active request. The pause banner appears only from an explicit saved server decision; connection failures never synthesize a pause.

This change does not resume hosting or migrate production. Apply the migration through the approved release process before deploying the new config contract. Existing production suspension remains a separate launch decision. Native-device and operator acceptance remain release requirements.
