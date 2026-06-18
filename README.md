# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 6f: Unit archive and retained-history cleanup.

This step replaces permanent Tech Unit deletion with archival. Archiving removes a unit from the normal unfiltered Unit Browser while retaining the database record, identifiers, history, and related detail records.

## Step 6f Goal

Protect unit history by ensuring a unit is never removed from the database through the Tech Unit Browser.

## Step 6f Changes

- Adds unit archive fields through a SQL migration:
  - `is_archived`
  - `archived_at`
  - `archived_by_user_id`
- Changes the existing Tech Unit Delete flow into an Archive flow without changing the existing URLs.
- Changes the row action label from `Delete` to `Archive` for active units.
- Does not delete from `units` or delete related unit detail records.
- Hides archived units from the normal unfiltered Unit Browser.
- Includes archived units when a user searches by an identifier or other search text.
- Clearly labels archived units in matching search results and expanded detail views.
- Preserves edit/history access to archived units found through search.
- Keeps archived-unit identifiers reserved, so a later create attempt cannot accidentally create a duplicate record for the same hardware.
- Requires the Step 6f SQL migration before archiving can be used.

## Important Direction Preserved

- `/tech/units` remains the single Unit Browser for Tech, Tech Lead, Management, and Admin users according to access policy.
- Production Weight stays numeric-only except when identifying a Unit override.
- Cosmetic Grade and Pass/Fail remain separate concepts.
- Support-task productivity remains deferred.
- Database Check is an Admin-only tool. Management users do not see the sidebar link and cannot open `/database`.
- Patch files are applied from `/home/bwtdallas-webserver/app/`.
- Zipped handoff files created for upload/reference are kept in `/home/bwtdallas-webserver/app/handoff/`.

## Archive Behavior

```text
Active unit
  -> Archive action
  -> Unit row disappears from the normal unfiltered Unit Browser
  -> Unit, identifiers, history, and detail records remain in the database
  -> Search by asset tag, BIOS serial, unit serial, or other searchable text retrieves the archived unit
```

## Key Routes

```text
/tech/units
/tech/units/table
/tech/units/new/modal
/tech/units/:unitId/edit/modal
/tech/units/:unitId/history
/tech/units/:unitId/delete/modal
```

The existing `/tech/units/:unitId/delete` route is retained for compatibility, but after Step 6f it archives the unit instead of deleting it.

## Step 6f File Touches

- `README.md`
- `sql/2026-06-step-6f-unit-archive.sql`
- `models/techUnitModel.js`
- `controllers/techController.js`
- `routes/management.js`
- `views/pages/tech-units.ejs`
- `views/fragments/tech-units-table.ejs`
- `views/fragments/tech-unit-delete-modal.ejs`

## Apply the SQL Migration

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < sql/2026-06-step-6f-unit-archive.sql
```

## Rebuild

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build

docker logs --tail=80 bwtdallas-app
```

## Post-Rebuild Checks

1. Run the Step 6f SQL migration.
2. Go to `/tech/units` with no search value and choose an active unit.
3. Confirm the row action says `Archive`.
4. Archive the unit and confirm it disappears from the normal unfiltered list.
5. Search for the archived unit by asset tag, BIOS serial, or unit serial.
6. Confirm the archived unit appears with its `Archived` label.
7. Expand the result and confirm Unit Details and History remain available.
8. Confirm the unit record and related detail records were not deleted.
9. Try creating a new unit with an archived unit identifier and confirm duplicate protection still directs the user to the retained record.

## Next Direction

Recommended next step: review archive/retrieval behavior with real unit data before adding a future restore/unarchive workflow.
