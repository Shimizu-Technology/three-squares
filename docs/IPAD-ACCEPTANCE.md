# Physical iPad Safari acceptance

**Execution owner: operator. Status: Not run.** An agent must not mark these cases passed from desktop emulation, WebKit automation or screenshots. Run each case in Safari on the physical iPad in both portrait and landscape. Installed PWA, external keyboard, physical reader and printer certification are separate unless recorded below.

Use an approved isolated build with fictional catalog/customer fixtures and simulated payments. This checklist does not authorize production edits, real charges/refunds, or email/SMS. If a total is wrong, a payment is uncertain or an action is unreachable, stop that case, preserve its original order/payment reference and record the problem. Do not create a replacement payment to bypass uncertainty.

## Session record

| Item | Operator entry |
|---|---|
| Build URL and exact commit | Not recorded |
| Date / operator / reviewer (keep private identity in private evidence) | Not recorded |
| iPad model / iPadOS / Safari version | Not recorded |
| Portrait / landscape dimensions | Not recorded |
| Input: touch / software keyboard / optional external keyboard | Not recorded |
| Dedicated fixture DB/build owner; email/SMS disabled | Not recorded |
| Simulated profile/location/reader and fictional product IDs | Not recorded |
| Private evidence location | Not recorded |

Record Passed, Failed, Blocked or Not run for **each orientation**, with original/saved order references and evidence privately. A screenshot is supporting evidence; verify reload and saved outcomes wherever requested.

## Required cases

| ID | Starting fixture and steps | Observable and saved outcome | Portrait | Landscape |
|---|---|---|---|---|
| I01 — POS sale and cash | Open POS as an allowed staff role. Select the intended location, search/select a tile, inspect long-name/sold-out tiles, choose a variant, enter a fictional customer. Open Cash. Enter a known tender greater than the total and complete once. | Toolbar/tiles/actions remain reachable; native search/picker and variant/cash dialogs work without zoom or clipping. Exact tender/change agree with the total. One saved paid cash order and correct receipt persist after reload. | Not run | Not run |
| I02 — Quantity and rotation | With a populated sale, increase/decrease quantity, reach stock limit, select quick quantity, remove a line and exercise a delayed/pending update fixture. Rotate with the cart populated, then return. | Targets are at least44px and separate. Limits/pending guards hold, totals follow saved quantities, no lost/duplicated lines. Keyboard does not hide required actions. Rotation retains the current sale. | Not run | Not run |
| I03 — Availability | As an authorized manager, switch Sale → Manage availability. Mark an offered item sold out, reload, Restore, reload, then return to Sale. Include one product not offered at the location. | Mode/selection context survives; saved daily availability changes correctly. Not-offered products stay absent; Restore never changes location membership. Sale tiles remain disabled for sold-out items. | Not run | Not run |
| I04 — Reader approval and recovery | Use the simulated reader, approve one sale, then use an approved unknown/lost-response fixture. Reload/check the original payment. Exercise an occupied lane and its recovery controls. | Simulation stays explicit. One saved approved outcome; unknown state preserves the original order/key and blocks replacement collection. Occupied-lane restrictions remain until confirmed resolution. Connection alone never appears as payment success. | Not run | Not run |
| I05 — Receipt | Open the receipt for the completed cash and confirmed simulated-card orders. Check lines, quantities, total, tender/change and payment state. Reprint; open/cancel native print preview if available, then return. | Receipt refers to the original saved order, remains readable/scrollable, and print cancellation returns without a duplicate sale. Record unavailable physical printing separately. | Not run | Not run |
| I06 — Pickup queue | Use a fictional paid pickup order and a separate pending-payment order. Filter/open detail, acknowledge the paid order, mark Ready, return to queue and reload. | Staff labels read Acknowledged consistently; badges carry status while forward commands use shared actions. Saved stage and filter/return context persist. Pending payment cannot advance improperly. | Not run | Not run |
| I07 — Refund dialog and recovery | Open an eligible fictional paid order. Enter refund amount/reason and review restock choice. With the software keyboard open, reach close/cancel/confirm; rotate while open. Exercise approved pending/unknown-refund fixtures and original-key recovery, then reload/check the saved outcome. | Header, scrollable body and actions remain reachable. Pending dismissal restrictions hold; uncertain reservations cannot create a second refund or restock. One saved refund/restock outcome agrees with the intended amount/reason. Focus/context return to the order afterward. | Not run | Not run |
| I08 — Guest checkout and hosted fallback | As a guest, choose pickup, add/edit items, review total/location, confirm the review checkbox and complete an approved simulated checkout. Where available, exercise hosted-card fallback and return to the original order. | Native fields/pickers, confirmation labels and keyboard work. Pending controls block duplicates. The saved paid guest order/receipt and persisted cart outcome agree with the submitted items/total. No real provider or message is used. | Not run | Not run |

## Result and sign-off

| Item | Result |
|---|---|
| Required cases passed / failed / blocked / not run | 0 / 0 / 0 / 8 |
| Material defects and private evidence | Not recorded |
| Physical reader / printer / installed PWA coverage | Not run |
| Operator/reviewer acceptance and date | Not run |
| Launch decision | Pending physical acceptance |

Keep failed evidence and record the fixed build/retest separately. Completing the code PR or automated geometry command does not complete this checklist.
