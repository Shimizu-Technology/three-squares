# Local payment simulator

Application simulation moves no money and is not processor certification. It requires `PAYMENTS_SIMULATION_ENABLED=true`, a simulated immutable payment identity and an isolated development/test fixture database. Never enable it on production or on the shared development database. Production boot, dispatch, finalization, refunds and jobs recheck identity/deployment authority; simulation routes are absent in production. Vite production bundles omit fake fields and reader controls.

For local setup with a disposable database (substitute a unique task name):

```sh
DATABASE_URL=postgresql://localhost/tsq_local_sim RAILS_ENV=development PAYMENTS_SIMULATION_ENABLED=true bin/rails db:create db:migrate payments:simulation:seed
```

Start API/web using that same dedicated DB and the normal development staff sign-in. No auth bypass is shipped. The seed is repeatable and creates two fictional kitchens/readers plus a meal; it never resets paid operations or stock. Stop and clean owned runtimes, then drop only this named disposable DB when finished.

Create dedicated fixture profiles for Worldpay or Stripe, both channels and each location. Explicitly select the provider on new sessions. No missing-credential fallback exists. Existing sessions/refunds keep their original identity even after profile selection changes. All simulated transactions/operations, opaque handle ownership, one-use redemption and virtual clocks persist in PostgreSQL. They use the existing checkout/finalizer, inventory and refund machinery. Use only fictional products, stock, customers and accounts; do not send notifications or real fulfillment instructions.

Online checkout offers a scenario and either token or hosted-execution mode. The latter executes once inside the simulated hosted boundary; the browser result is a hint and server queries provide financial evidence. The real Worldpay Hosted Fields bridge is an explicit unavailable stub until the assigned SDK guide arrives. Simulation never requires PAN, CVV or PIN entry.

The developer POS panel targets a saved attempt and a location/account-bound reader. Take card payment reserves the reader; Tap, Approve, Decline, wrong PIN, Disconnect and Lose response exercise the saved operation. A busy reader identifies the active order. An old lease is never automatically cleared while money is unknown. Use Check saved payment after a lost response; never create another sale or switch to cash to bypass uncertainty.

`SimulationClock.for(identity).advance!(seconds)` advances only that simulated identity's virtual time (1–604800 seconds). Query lag becomes visible after its recorded deadline; no request sleeps. Reset by dropping a dedicated disposable fixture database after stopping its owned servers; there is no global delete/reset endpoint.

The wire fixtures are small representative application contracts, not a redistributed processor emulator. See `api/spec/services/payments/worldpay/README.md` for bounded parser details. The opt-in NULL amount map is separate from ordinary menu totals; no amount-trigger routing occurs automatically. Fraud/partial approvals preserve the amount actually approved and claim compensation before fulfillment.

Default financial summaries/CSV omit simulation and sandbox records. Only explicitly stamped production financial records enter those reports; historical unstamped payments require reconciliation before inclusion. Simulated receipts are visibly labeled. Durable notifications reject simulated orders independently of UI labels.

Simulator evidence and consultant certification are separate. Assigned Hosted Fields callbacks/token mapping, safe no-PAN missing-response reversal, funding format and physical device/firmware remain external launch gates.
