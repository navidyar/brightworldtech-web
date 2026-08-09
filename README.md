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

## CSS organization

The shared UI is organized into three files:

- `public/css/theme.css` — colors, typography, spacing, borders, and design tokens
- `public/css/app.css` — shared visual components and page styling
- `public/css/features.css` — protected behavior such as hidden states and feature-specific interaction safeguards

Page-specific CSS should be limited to genuinely unique layout or behavior. Shared scrollbar colors and geometry are defined by tokens in `theme.css` and presentation rules in `app.css`; feature-specific overflow behavior stays in the relevant feature stylesheet. Functional selectors must be tested before older declarations are removed, especially the Lots hierarchy, caret controls, modal behavior, responsive layouts, and repeatable Unit-form sections.

## Important application behavior

- Newly created Lots are hidden until Management manually unhides them.
- Lot Unit Form Configuration controls which Unit fields are visible and required.
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

## Troubleshooting

**`Cannot find module 'mysql2/promise'`**  
Run the npm command inside the app container with `docker compose exec -T app ...`.

**The app exits in production**  
Confirm that `SESSION_SECRET` is present in `.env`.

**Traefik cannot attach the app**  
Confirm that the external `proxy` network exists and that Traefik is connected to it.

**MySQL is not ready**  
Check `docker compose logs mysql` and confirm the database credentials in `.env` match the Compose configuration.
