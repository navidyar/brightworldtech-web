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
docker compose exec -T app npm run validate:lot-validation
docker compose exec -T app npm run validate:lot-validation-overrides
```

Run Node commands inside the `app` container. The host does not normally contain the project's npm dependencies.

## Database changes

Database migrations are stored in `sql/`. Matching helper scripts are stored in `scripts/` when a migration needs a controlled apply or rollback command.

Back up the database before applying a migration. Do not delete `mysql/data`, remove the MySQL volume, or use volume-pruning commands as part of routine cleanup.

## Applying a handoff patch

Place the patch in `handoff/`, then dry-run it before applying:

```bash
cd /home/bwtdallas-webserver/app
patch --dry-run -p0 < handoff/example.patch
patch -p0 < handoff/example.patch
docker compose up -d --build
```

Run only the tests and manual checks relevant to the changed feature unless a full regression check is requested.

## CSS organization

The shared UI is organized into three files:

- `public/css/theme.css` — colors, typography, spacing, borders, and design tokens
- `public/css/app.css` — shared visual components and page styling
- `public/css/features.css` — protected behavior such as hidden states and feature-specific interaction safeguards

Page-specific CSS should be limited to genuinely unique layout or behavior. Functional selectors must be tested before older declarations are removed, especially the Lots hierarchy, caret controls, modal behavior, responsive layouts, and repeatable Unit-form sections.

## Important application behavior

- Newly created Lots are hidden until Management manually unhides them.
- Lot Unit Form Configuration controls which Unit fields are visible and required.
- Lot Requirements evaluate whether a Unit qualifies for a Lot; they are separate from form visibility and required-field rules.
- Strict Lot requirements block Unit Create/Edit until the Unit qualifies or has a current Management acceptance. Warn Only and Open/Mixed policies remain non-blocking.
- Admin and Management may accept a Lot requirement exception with a required reason. The acceptance expires when requirements change or the Unit leaves the Lot.
- Hidden existing Unit data must be preserved when a Lot configuration hides a field.

## Troubleshooting

**`Cannot find module 'mysql2/promise'`**  
Run the npm command inside the app container with `docker compose exec -T app ...`.

**The app exits in production**  
Confirm that `SESSION_SECRET` is present in `.env`.

**Traefik cannot attach the app**  
Confirm that the external `proxy` network exists and that Traefik is connected to it.

**MySQL is not ready**  
Check `docker compose logs mysql` and confirm the database credentials in `.env` match the Compose configuration.
