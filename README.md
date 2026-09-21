# BWTDallas

BWTDallas is an internal operations portal for managing lots, units, technician work, validation, requests, users, and system configuration.

## Technology

- Node.js with Express
- EJS and HTMX
- MySQL 8
- Docker Compose
- Traefik for HTTPS routing

## Project layout

```text
controllers/   Request handling
models/        Database access
routes/        Express routes
services/      Business rules and validation
views/         EJS pages, fragments, and partials
public/        CSS, JavaScript, images, and other static files
config/        Application registries and configuration
sql/           Database migrations
scripts/       Validation and migration helpers
```

## CSS architecture

BWTDallas uses exactly three authored stylesheets:

- `public/css/theme.css` — global design tokens and theme-state values only.
- `public/css/app.css` — shared presentation and reusable component contracts.
- `public/css/features.css` — structure/interaction rules whose removal can change application behavior.

New UI work should reuse the shared component contracts in `app.css` before adding feature-specific selectors. In particular, reuse the existing button, form-field, table, clean-modal, pagination/date-picker, summary-panel, and action-layout classes rather than creating parallel page-specific versions. New standalone CSS files and static inline presentation are not part of the application architecture. Template `style` attributes are reserved only for runtime CSS custom properties (`--...`) whose values come from data or JavaScript; ordinary layout and presentation must use shared classes in the three CSS files.

Feature-specific selectors are appropriate when a feature genuinely needs a unique visual or structural rule, but they belong in `app.css` or `features.css` according to responsibility and should build on the shared tokens/components where practical. Canonical colors, fonts, shadows, spacing, radii, and similar shared values must be referenced through `theme.css` custom properties instead of repeating their literal values in component CSS; feature-only geometry may remain local when it does not represent a shared design decision. Prefer normal cascade order and appropriately scoped selectors over `!important`; reserve `!important` for browser/behavior safeguards or cases where a lower-specificity shared contract must intentionally defeat legacy/native behavior. Do not stack successive override blocks for the same component—replace the obsolete rule with the final effective contract once it is safe to do so.

The CSS boundary is enforced by `npm run validate:shared-css`: templates may load stylesheets only through the shared head (with the standalone error pages loading the same three files directly), CSS `@import` is prohibited, runtime inline custom properties must be consumed by the shared stylesheets, and the current `!important` counts are non-growth ceilings. Lowering those ceilings through cleanup is encouraged; raising them should require an intentional architecture review rather than becoming routine feature work.

CSS comments should document the current functional purpose, ownership boundary, or reason for a non-obvious safeguard. Do not preserve Stage/Step rollout chronology, migration notes, or retired stylesheet names in the authored CSS.

### CSS consolidation baseline

The CSS consolidation is complete. Future UI work should maintain the three-file architecture rather than introduce another consolidation layer or page-owned stylesheet. The enforced `!important` non-growth ceilings are `theme.css: 0`, `app.css: 305`, and `features.css: 82`; cleanup may lower these counts, but feature work should not raise them without an explicit architecture review.

Treat behavior-sensitive CSS as application logic during maintenance. In particular, preserve Lot hierarchy expansion/indentation, conditional Unit Form visibility and `[hidden]` behavior, native date-input mechanics, modal/root overflow behavior, searchable-combobox positioning, Unit Browser geometry and single-line identifier behavior, Label Builder canvas/object/resize/rotation/grid/guide/layer mechanics, sidebar pinned/collapsed state, and Virtual Huddle blocking behavior. Visual presentation for those features belongs in `app.css`; mechanics that participate in behavior belong in `features.css`.

Use the shared vertical-rhythm contracts in `app.css` for heading/note-to-content spacing instead of adding page-specific margin overrides. The current shared spacing baseline is 12px at the direct-sibling boundaries covered by those contracts.

Before merging CSS changes, run `npm run validate:shared-css` and the focused integration tests for the affected surface. The validator is the source of truth for stylesheet ownership, inline-style restrictions, canonical token usage, runtime custom-property consumption, and the current debt ceilings.

## Environment

Create a `.env` file in the application directory. At minimum, configure:

```dotenv
NODE_ENV=production
PORT=3000
BASE_URL=https://bwtdallas.com
SESSION_SECRET=replace-with-a-long-random-value

DB_HOST=mysql
DB_PORT=3306
DB_NAME=bwtdallas
DB_USER=replace-me
DB_PASSWORD=replace-me
DB_ROOT_PASSWORD=replace-me

ASSET_TAG_PREFIX=BWT
CONFIG_USAGE_RANKING_REFRESH_MINUTES=120
```

A session secret can be generated with:

```bash
openssl rand -hex 32
```

The external Docker network named `proxy` must exist before the stack starts:

```bash
docker network create proxy
```

Running this command when the network already exists is unnecessary.

## Start or rebuild

Run project commands from:

```bash
cd /home/bwtdallas-webserver/app
```

Build and start the containers:

```bash
docker compose up -d --build
```

Check container status and logs:

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f mysql
```

## Create the first administrator

```bash
docker compose exec -T app npm run create-admin-link -- \
  "First" "Last" "admin@example.com"
```

The command creates the user and prints a temporary password-setup link.

## Tests and validation

Run the automated tests:

```bash
docker compose exec -T app npm test
```

Run application consistency checks:

```bash
docker compose exec -T app npm run validate:shared-css
docker compose exec -T app npm run validate:unit-form-registry
docker compose exec -T app npm run validate:unit-form-bindings
docker compose exec -T app npm run validate:lot-unit-form-profiles
docker compose exec -T app npm run validate:lot-requirements
docker compose exec -T app npm run validate:lot-enforcement-policies
docker compose exec -T app npm run validate:processor-families
docker compose exec -T app npm run validate:lot-validation
docker compose exec -T app npm run validate:lot-validation-overrides
docker compose exec -T app npm run validate:unit-audit
docker compose exec -T app npm run validate:unit-export-foundation
docker compose exec -T app npm run validate:unit-export-files
docker compose exec -T app npm run validate:previous-current-hardware
docker compose exec -T app npm run validate:previous-hardware-components
docker compose exec -T app npm run validate:zero-capacity-slots
docker compose exec -T app npm run validate:operational-option-rankings
docker compose exec -T app npm run validate:operational-ranking-administration
docker compose exec -T app npm run validate:model-processor-coverage
docker compose exec -T app npm run validate:processor-metadata
docker compose exec -T app npm run validate:management-self-role-protection
docker compose exec -T app npm run validate:effective-unit-weights
docker compose exec -T app npm run validate:stage10-stabilization
```

Run Node commands inside the `app` container. The host does not normally contain the project's npm dependencies.

Admin and Management users may edit their own profile details, but their own access role is locked. Another authorized Admin must make any Admin role change.

## Database changes

Database migrations are stored in `sql/`. Matching helper scripts are stored in `scripts/` when a migration needs a controlled apply or rollback command.

Back up the database before applying a migration or catalog backfill. Do not delete `mysql/data`, remove the MySQL volume, or use volume-pruning commands as part of routine cleanup.

Audit weight-column capacity and live effective completion weights without changing the database:

```bash
docker compose exec -T app npm run audit:production-weight-capacity
docker compose exec -T app npm run audit:effective-unit-weights
```

After a database backup, apply the capacity widening and synchronize existing active manual-completion rows:

```bash
docker compose exec -T app npm run migrate:production-weight-capacity
docker compose exec -T app npm run sync:effective-unit-weights
```

Production weight priority is Unit override, then the Unit's current Lot weight, then its category default. Individual Unit overrides remain attached to the Unit across Lot moves. Reversed completions and explicit prior-technician override credits remain unchanged.

Audit Unit Model processor coverage and processor metadata without changing the database:

```bash
docker compose exec -T app npm run audit:model-processor-coverage
docker compose exec -T app npm run audit:processor-metadata
```

After reviewing each dry-run report, apply the processor coverage and metadata backfills separately:

```bash
docker compose exec -T app npm run backfill:model-processor-coverage
docker compose exec -T app npm run backfill:processor-metadata
```

The coverage backfill learns processor mappings from every existing Unit first. Curated common choices are added only for active Unit Models that still have no active processor options. Inactive processor brands, processor models, and model/processor mappings remain inactive.

The metadata backfill fills only blank generation and base-GHz values and adds only missing automatic Processor Family memberships. Existing metadata, manual memberships, and inactive family decisions are preserved.

## Applying a handoff patch

Place the patch in `handoff/`. Run the dry run first and review its output before applying anything:

```bash
cd /home/bwtdallas-webserver/app
patch --dry-run --batch --forward -p0 < handoff/example.patch
```

Only after the dry run succeeds cleanly, run the apply command separately:

```bash
cd /home/bwtdallas-webserver/app
patch --batch --forward -p0 < handoff/example.patch
```

Rebuild separately after the patch applies successfully. Run only the tests and manual checks relevant to the changed feature unless a full regression check is requested.

## Important application behavior

- Newly created Lots are hidden until Management manually unhides them.
- Lot Unit Form Configuration controls which Unit fields are visible and required.
- Amazon workflow fields (FNSKU, ASIN, Tracking Number, Pallet Number, and Buyer Comments) use the same Lot Unit Form Configuration. Pallet Number is cleared when a Unit enters a Lot where that field is hidden; its prior value remains in Unit History.
- Lots may independently enable permanent Amazon Asset Tag generation. AZ tags use one global `AZ00000001` sequence, are assigned only when missing, and remain with the Unit across later Lot moves. Enabling the Lot setting does not backfill existing Units; Management must explicitly generate missing AZ tags for direct Units in that Lot.
- Unit Browser free-text search supports identifiers, FNSKU, ASIN, Tracking Number, Pallet Number, Manufacturer, Unit Model, Processor, and Processor Family/Generation. Multi-line search defaults to Any/OR and can be switched to All/AND.
- Lot Requirements evaluate whether a Unit qualifies for a Lot; they are separate from form visibility and required-field rules.
- Each Lot has an explicit Strict, Warn Only, or Open / Mixed requirement policy. The policy is independent from the Unit amount goal; Strict blocks technical mismatches, while the other policies report them without blocking.
- Admin and Management may accept a Lot requirement exception with a required reason. Acceptance, revocation, and expiration records remain visible in Unit History.
- Unit Create/Edit rechecks the latest Lot form profile on the server. Required fields are enforced, hidden Create values are rejected, and hidden existing data is preserved without being rewritten.
- Previous and Current memory/storage are recorded as separate structured module/device rows. The active form captures only the current operational fields: slot/bay, size, type, Memory install type, and Current Storage wipe status. Older optional component-detail values remain server-side and are preserved during ordinary edits without being posted through hidden form controls. Totals and Lot requirements use Current rows only. A component size of `0` is an explicit empty slot/bay record; it is saved, contributes zero to totals, and does not require a component type.
- Unit History is shown as a compact chronological timeline. New actions use grouped audit events; older activity is reconstructed only from available historical records.
- Tech Leads, Management users, and Admins may undo a manual Unit completion with a required reason. Reversed credits are excluded from productivity totals and remain visible in Unit History.
- Parking, return-to-active, assignment changes, duplicate assumptions, outcome approvals, override approvals, and automatic exception expirations are recorded as grouped Unit audit events.
- Before a Unit enters or is reassigned within a Lot, the server rechecks destination form requirements and technical requirements. Strict failures are blocked; Warn Only and Open/Mixed mismatches remain non-blocking.
- Duplicate serial intake separates moving or taking over the existing Unit from requesting a distinct Intentional Duplicate. Intentional Duplicate requests preserve the proposed Unit snapshot for explicit Tech Lead+ review.
- Admin-only Configuration contains Config Values, Processor Families, the Unit Model Catalog, and Database Check under one shared navigation and compact visual system. Lot requirement forms may select existing Processor Families but cannot manage shared family membership.
- Processor Families group explicit processor catalog values for reusable Lot requirements. Safe name-based matches are assigned automatically, while ambiguous processors remain visible for Admin review.
- Admin and Management may preview and export all Units matching the current Unit Browser scope. CSV and XLSX exports use the same authorized dataset, and the export modal allows the included columns to be selected before download.
- Unit hardware records keep previous and current memory/storage separate. Current capacity is calculated from the installed module/device rows and remains the only capacity checked by Lot Requirements; previous capacity is optional historical input. Unit Details, History, CSV/XLSX exports, and export summaries preserve separate previous/current values and totals.
- Eligible operational selectors use a cached popularity ranking without changing Configuration's canonical/manual order. Unit Models are ranked within Manufacturer, Processors and Processor Types are ranked within Unit Model, and catalog/status lists with semantic progression keep their fixed configured order. Rankings combine lifetime, 90-day, and 30-day usage, refresh outside page requests, retain the last successful cache during refreshes or failures, and may be refreshed manually with `npm run refresh:operational-option-rankings` inside the app container. Admin Configuration also shows cache health, refresh duration, cached scope counts, and a database-backed interval selector for hourly, two-hour, six-hour, or daily refreshes. The environment variable remains a fallback before the Stage 10W setting is available.
- Configuration categories that keep manual order and contain at least three active values can be reordered by dragging their rows. The order saves immediately in normalized 10-point increments; mouse, touch, and keyboard controls are available, and filtered search results can be reordered without moving hidden values from their existing positions.
- Label printing keeps persistent print history separate from the user-facing Recent Prints window. Admin Printing Configuration controls the Recent Prints display duration (default 15 minutes) and successive individual Print Set grouping gap (default 3 minutes); bulk submissions always remain separate sets.

## Troubleshooting

**`Cannot find module 'mysql2/promise'`**  
Run the npm command inside the app container with `docker compose exec -T app ...`.

**The app exits in production**  
Confirm that `SESSION_SECRET` is present in `.env`.

**Traefik cannot attach the app**  
Confirm that the external `proxy` network exists and that Traefik is connected to it.

**MySQL is not ready**  
Check `docker compose logs mysql` and confirm the database credentials in `.env` match the Compose configuration.
