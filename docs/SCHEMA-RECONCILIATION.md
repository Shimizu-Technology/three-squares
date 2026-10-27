# Schema reconciliation — October 27, 2026

Main's schema dump contained fields from three unmerged February staging migrations. Production's actual columns and migration versions remain unverified. Do not replay the original staging migrations: they add columns unconditionally and one backfills business lines using application models.

`20261027050000_reconcile_retained_menu_schema.rb` adds only the retained location QR URL and seasonal collection fields, with column/index existence guards. It preserves existing values, runs after all main migrations, and deliberately has no destructive rollback. The schema dump is regenerated from a fresh migration replay. CI repeats that replay on a separate database and rejects schema drift.

Freshly migrated databases and databases loaded from the canonical schema converge exactly. A database loaded from the old main dump or previously migrated on staging upgrades without duplicate-column errors, retaining these unused legacy fields and their indexes/foreign key:

- `products.business_line` and `collections.business_line` (TSQ-19 business-line separation);
- `locations.location_type`, `starts_at`, `ends_at`, `auto_deactivate`, `description`, and `menu_collection_id` (TSQ-35 popup/event and TSQ-38 lifecycle work).

These declarations are absent from the canonical dump because this phase does not introduce the deferred features into new databases. No migration drops those fields from an existing database. Thus an old database can retain extra inert columns; exact physical parity with that legacy schema is intentionally deferred until a separately verified data-retention decision. Runtime code must not depend on them. Storefront classification continues to use collection slugs.

This resolves replay drift for retained features without claiming production schema parity. Before resuming Render, verify its columns, migration versions, and backups through an authorized production procedure. This phase does not resume Render, run production migrations, or change hosting configuration.
