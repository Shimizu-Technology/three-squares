# Continuous integration

The root `.github/workflows/ci.yml` runs on pull requests and pushes to main.

- API: Ruby from `api/.ruby-version`, PostgreSQL 16, `bin/rails db:prepare`, a separate fresh migration replay compared with `schema.rb`, all RSpec examples, and Brakeman. No live provider credentials are required. Test databases disable demo seeds; specs own their factory data.
- Web: Node from the root `.node-version` (also mirrored in `.nvmrc`), `npm ci`, CI-tool and application unit tests, ESLint regression checks, and `npm run build` (TypeScript plus Vite). Scripts select the project Node through nodenv when available and reject unsupported versions. The strict UI-control gate permits no legacy baseline entries. Lockfile-selected Chromium/WebKit run the six deterministic component fixture suites through `npm run ui:geometry`; artifacts are retained for seven days, including on failure. The command has a three-minute execution budget, excludes API/auth/provider traffic and uses browser fallback fonts. Database-backed journeys and physical iPad acceptance remain separate.

Start each command block from the repository root. Use an isolated database, never a shared development/test database:

```sh
cd api
RAILS_ENV=test DATABASE_URL=postgres://localhost/your_isolated_test bin/rails db:prepare
CI=true RAILS_ENV=test DATABASE_URL=postgres://localhost/your_isolated_test bundle exec rspec
bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error
```

```sh
cd web
npm ci
npm run test:ci-tools
npm run test:unit
npm run lint:ci
npm run build
npx --no-install playwright install --with-deps chromium webkit
npm run ui:geometry
```

## Inherited debt

[Issue #40](https://github.com/Shimizu-Technology/three-squares/issues/40) tracks the measured baseline at `c46a401`:

- Strict `npm run lint`: 34 errors and 25 warnings. `lint:ci` still prints all findings and rejects error counts above the committed per-file/rule baseline, including errors in new files. It does not claim strict lint is clean. Reduce baseline entries as debt is fixed; do not increase them to accommodate regressions.
- RuboCop: 701 offenses across 250 files, mostly quotes and bracket spacing. It is not a CI gate yet; a dedicated formatting PR should retire this debt rather than mix hundreds of edits into the CI repair.
- Demo seeds fail variant validation on a fresh database. Tests use factories and must not load restaurant seed data.
- Dependency audits also report inherited advisories. Dependency updates require a separate reviewed slice; neither `npm audit` nor `bin/bundler-audit` is a gate introduced by this CI repair. Inspect their output before launch.

Brakeman retains the documented admin-only role-assignment exception. Its fingerprint was refreshed after the permitted assigned-location parameter changed; authentication and `require_admin!` still guard the action.

CI changes no production environment variables, service state, migrations, or availability checks. Production continues to show its paused preview while the configured API health endpoint is unavailable.
