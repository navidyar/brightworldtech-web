# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 6f.4: Unit Browser Lifecycle Toggle and Return Navigation.

Step 6f.4 makes the Parked Units browser view more compact for authorized users and returns the browser to the default Active Units view after a unit is returned to Active.

## Step 6f.4 — Unit Browser Lifecycle Toggle and Return Navigation

### What Changed

- Replaces the elevated-user **Unit State** dropdown with a compact **Show Parked Units** toggle in the Unit Browser filter header.
- The toggle is visible only to Tech Lead, Management, and Admin. It is off by default for the Active Units view; regular Techs continue to see only Active Units and never receive the toggle.
- Toggling the control automatically reloads the Unit Browser with the selected lifecycle view while retaining the other current filters.
- A successful HTMX **Return to Active** now performs a full redirect to the default Active Units view and displays the existing success message, rather than leaving the user in the prior Parked Units view.
- No database migration is required.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step6f4-unit-browser-lifecycle-toggle.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step6f4-unit-browser-lifecycle-toggle.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation

1. As Tech Lead, Management, or Admin, confirm the Unit Browser shows **Show Parked Units** as a compact toggle instead of the former Unit State dropdown.
2. Confirm the default toggle-off view lists Active Units. Turn the toggle on and confirm it automatically loads Parked Units while retaining any other active filters.
3. As a regular Tech, confirm the toggle remains absent and only Active Units can be viewed.
4. As an authorized user, return a Parked unit to an eligible open lot. Confirm the browser redirects to the Active Units view with the returned unit available there.

## Step 6f.3 — Parked Lifecycle Validation and Guard Hardening

### What Changed

- Validates the Step 6f.2 Active / Parked / Return to Active workflow without changing the approved lifecycle policy.
- Treats a unit as Parked whenever either the authoritative `is_parked` field or retained legacy `is_archived` compatibility field is set. This keeps browser visibility and server-side lifecycle guards fail-safe if historical data is ever inconsistent.
- Updates override approval to use that same compatibility-safe Parked check, so an approval cannot proceed for a unit that is Parked under either state field.
- Blocks the direct **My Weight Earned** endpoint for a Parked unit when requested by a regular Tech. This closes a direct-route visibility bypass while preserving credit data and elevated-user access.
- Confirms that Park and Return continue to preserve unit history and earned Work Complete credit, while parked records remain blocked from edit, assignment, completion, Pass/Fail review, and override workflows.
- No database migration is required for this validation-and-hardening step.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step6f3-parked-lifecycle-validation.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step6f3-parked-lifecycle-validation.diff

git diff --check
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation — BWT2300007

1. Before changing the unit, record its current Active/Parked state, current lot, current assignment, and any existing Work Complete history so it can be returned to the same operational state after testing.
2. As Tech Lead, Management, or Admin, Park the unit. Confirm it leaves **Active Units**, appears only under **Parked Units**, and has no current lot or assignment.
3. Open the authorized History panel and confirm the Parked event retains the former lot and assignment. Confirm existing Work Complete credit remains present and unchanged.
4. As a regular Tech, confirm the Parked Units filter is absent; direct Park/Return, Edit, Work Complete, and Override requests remain blocked. A direct request for **My Weight Earned** must not return Parked-unit credit details.
5. As Tech Lead, Management, or Admin, return the unit to an open, assignable leaf lot. Test an optional assignment only with an active Tech or Tech Lead. Closed, hidden, and parent/container lots must be rejected.
6. Confirm the returned unit can resume normal active workflows, then restore the unit to its original intended lot and assignment if the test changed them.

## Step 6f.2 — Parked Units and Return to Active

### What Changed

- Replaces the user-facing archive workflow with **Park Unit** and **Return to Active**.
- Adds explicit `is_parked`, `parked_at`, and `parked_by_user_id` fields on `units`.
- Adds `unit_park_history` to retain each lifecycle transition, including prior/current lot, assignment, authorized actor, timestamp, and note.
- Converts legacy archived units to Parked during the migration. The unit’s final known lot and assignment are written to history before the current operational values are cleared.
- Limits Park and Return actions, routes, and Parked Unit browsing to **Tech Lead, Management, and Admin**. Regular Techs cannot access parked records or lifecycle routes.
- Parking runs in one database transaction and clears the current lot and assignment. It does not delete identifiers, unit details, audit history, Work Complete records, or earned production credit.
- Parked records are absent from the default Active Unit Browser. Authorized users can use the **Show Parked Units** toggle to review them.
- Returning a unit to Active requires an eligible **open** destination lot and can optionally assign an active Tech or Tech Lead.
- A parked unit cannot be edited, moved, assigned, marked Work Complete, reviewed for Pass/Fail, requested for override, or approved through override handoff until returned to Active.
- Legacy Step 6f archive columns remain only for backwards compatibility and are synchronized by the new lifecycle. The application no longer presents Archive/Unarchive terminology.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step6f2-parked-unit-lifecycle-clean.diff
```

Stop if any file is skipped, reversed, or fails to check.

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step6f2-parked-unit-lifecycle-clean.diff

git diff --check

ls -l sql/2026-06-step-6f2-parked-unit-lifecycle.sql
```

The final `ls` command must show the migration file before any database command is run.

#### 3. Database backup — separate recommended checkpoint

```bash
cd /home/bwtdallas-webserver/app

mkdir -p backup

docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  > "backup/bwtdallas-before-step6f2-$(date +%F-%H%M%S).sql"
```

#### 4. Database migration — database changes only; do not rebuild yet

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-06-step-6f2-parked-unit-lifecycle.sql
```

Expected final message:

```text
Step 6f.2 parked-unit lifecycle migration complete
```

#### 5. Rebuild — only after the migration succeeds

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Checks

1. As a Tech Lead, Management user, or Admin, open `/tech/units`, select an Active unit, and choose **Park Unit**.
2. Confirm it disappears from Active Units and appears under **Parked Units** with no current lot or Tech assignment.
3. Open the authorized History panel and verify that the Parked transition retains the former lot and assignment.
4. Confirm a parked unit cannot be edited, moved, assigned, marked Work Complete, requested for override, or approved through override handoff.
5. Confirm a regular Tech cannot choose Parked Units or access Park/Return routes directly.
6. Return the unit to Active using an open, eligible destination lot; test once unassigned and once with an eligible Tech/Tech Lead selected.
7. Confirm hidden, closed, and parent/container lots cannot be selected as return destinations.
8. Confirm previously earned Work Complete credit remains unchanged after parking and return.
9. With a legacy archived test record, confirm the migration converts it to Parked and retains its final known lot and assignment in lifecycle history.

## Step 6f.0 Goal

Dashboard productivity should be based on work that a Tech actually completed during the selected reporting period, not on the unit's current assigned user, current lot, current grade, or future movement history.

## Step 6f.0 Changes

- Adds explicit current assignment fields to `units`:
  - `assigned_to_user_id`
  - `assigned_at`
  - `assignment_updated_by_user_id`
- Backfills existing units so the current assignee starts as the original creator.
- Adds `unit_assignment_history`.
- Adds `unit_work_completions` for immutable production-credit events.
- Adds a `Complete Work` action in the Tech Unit Browser.
- Completion credit snapshots the unit, current lot, completed Tech, completion date/time, and resolved numeric production weight.
- Updates Tech/Management dashboard productivity to read from `unit_work_completions` when the table exists.
- Approved override requests now transfer current assignment to the requesting Tech.
- Override approval can optionally give the prior Tech intentional custom credit.
- Prior-Tech credit is manual-only, checkbox-gated, and must be between `0.10` and `10.00`.
- Requires no support-task productivity records.

## Important Direction Preserved

- Support-task productivity remains deferred.
- Current assignment is operational state only.
- Record creator remains historical metadata.
- Lot moves and assignment changes do not rewrite completed production credit.
- Production credit is not automatically created by moving lots, grading, creating units, parking, or unassigning.
- Patch files are applied from `/home/bwtdallas-webserver/app/`.
- Zipped handoff files created for upload/reference are kept in `/home/bwtdallas-webserver/app/handoff/`.

## Step 6f.0 Migration Hotfix

- The Step 6f.0 child tables use `BIGINT` for `unit_id` to match the existing `units.unit_id` primary key.
- `override_request_id` uses `BIGINT UNSIGNED` to match `unit_override_requests.unit_override_request_id`.
- If the original migration stopped while creating the new tables, apply the Step 6f.0 migration type hotfix and rerun the same migration. The migration is safe to rerun because its earlier column and index operations are guarded.

## Required SQL

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < sql/2026-06-step-6f0-assignment-completion-foundation.sql
```

Expected final message:

```text
Step 6f.0 assignment and completion foundation migration complete
```

## Post-Rebuild Checks

1. Run the Step 6f.0 SQL migration.
2. Open `/tech/units` and confirm rows show the current assignment label.
3. Confirm a newly created unit is assigned to the creator.
4. Create an override request from another Tech.
5. Approve the request and confirm the unit assignment transfers to the requesting Tech.
6. During override approval, test the optional prior-Tech credit checkbox with a valid value such as `0.25`.
7. Confirm invalid values such as `0.09`, `10.01`, or blank checked values are rejected.
8. Use `Complete Work` on a non-critical unit and confirm the dashboards count that completed work.

## Next Direction

After Step 6f.2 is confirmed, continue with the next approved Unit Browser lifecycle and operational cleanup step. Do not reintroduce Archive/Unarchive terminology.

## Step 6f.0 Action-Flow Hotfix

- Replaces the silent inline Complete Work post with an explicit **Mark Lot Work Complete** confirmation modal.
- Completion credit is recorded for the signed-in user who confirms the work, not implicitly for the current assignee.
- Shows the current lot, credited user, and resolved production weight before recording.
- Prevents a second manual completion credit during the same stay in a lot; moving away and later returning begins a new eligible lot stay.
- Keeps the success message visible after a completion and refreshes the Unit Browser.
- Uses an explicit modal trigger and visible error state for **Request Override** and completion actions.

## Step 6f.0.2 Completion and transfer safeguards

- Renames the unit action to **Work Complete**.
- Shows the latest credited Tech and credit source in the Unit Browser.
- Labels the displayed row value as **Current lot weight** so it is not mistaken for a person’s earned credit.
- Adds work-credit, assignment, and lot-move sections to Unit History.
- Shows prior-Tech override credit with the credited person and approved weight.
- Hides the prior-Tech custom-weight entry until the approval checkbox is selected, and clears the value when it is deselected.
- Allows a Tech to correct the lot only while the unit is currently assigned to them and has no recorded Work Complete credit.
- Requires Tech Lead, Management, or Admin to move a unit after Work Complete credit has been recorded.


## Step 6f.0.3 History access and credited-work layout

- Stacks the latest Work Complete weight underneath the latest credited Tech name in the Unit Browser.
- Moves the lazy-loaded History action into the expanded Unit Details mini-menu.
- Limits History visibility and its server route to Admin, Management, and Tech Lead users.
- Regular Tech users receive neither the History control nor the history panel markup.
- No SQL migration is required.

## Step 6f.0.4: Completion Safeguards, Pass/Fail Confirmation Queue, and Tech Browser Scope

This step corrects the completion and override workflows without rewriting historical earned-weight records.

### What Changed

- The Unit Browser now keeps current lot weight and unit override context under **Unit / Weight**.
- The **Work / Assignment** column now shows the latest credited Tech and **Latest Weight Earned** as separate information.
- History remains lazy-loaded only when an authorized user opens it from the unit mini-menu.
- Work history is labeled **Earned Weight History**.
- The database now prevents a new duplicate manual completion for the same unit during the same current lot stay. Existing historical records are retained for review.
- A Pass/Fail confirmation request now creates a real pending record in `/management/overrides` while leaving the selected Pass/Fail result applied.
- Tech Leads can access `/management/overrides` to review requests without receiving access to `/management/lots`.
- Regular Tech users see their currently assigned active units by default, newest first. Searches may locate other units, but those results remain read-only other than request actions.
- Prior-Tech custom credit is only available for manual Tech ownership override requests. Its field is hidden and disabled until the checkbox is selected, and the server ignores it for all other request types.

### Required SQL

Run after applying the patch:

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < sql/2026-06-step-6f0-4-completion-safeguards.sql
```

Expected final message:

```text
Step 6f.0.4 completion safeguards migration complete
```

## Step 6f.0.4a — Current Lot Weight / Earned Weight Display Hotfix

- Separates the configured **Current Lot Weight** from any unit-specific override.
- Shows the configured lot weight under **Unit / Weight**.
- Shows the unit override as its own value when present.
- Leaves **Latest Weight Earned** tied only to the recorded completion-credit snapshot.
- Prevents the current effective unit weight from being mistaken for earned credit.



## Step 6f.0.4b — Weight Display Correction

- Shows only the configured **Current Lot Weight** under `Unit / Weight`.
- Removes redundant Unit Override display from the Unit / Weight summary and expanded detail.
- Shows the unit's effective weight under **Latest Weight Earned** beside the credited Tech.
- Keeps completion history and dashboard calculations based on the saved completion-credit snapshot.

## Step 6f.0.4c — Override Ownership Guard

- Hides `Request Override` when the current regular Tech is already assigned to the unit.
- Shows `Request Override` only to a regular Tech viewing a unit assigned to another Tech or currently unassigned.
- Enforces the same ownership check in both override modal and submission routes, preventing direct-request bypasses.
- Tech Leads, Management, and Admin continue to manage assignments through their elevated operational workflow rather than filing Tech override requests.
- No SQL migration is required.

## Step 6f.0.4d — Override Handoff Assignment and Lot Selection

- Shows **Assigned To** separately from the **Last Credited Tech** so a prior earned-weight record is never mistaken for the current assignment.
- The earned value shown in the Unit Browser comes from the saved completion-credit record, not from the current lot weight.
- When a manual Tech override involves a unit with recorded work, approval requires an open, assignable destination lot.
- The approving Tech Lead, Management user, or Admin can select the current lot to keep the unit in place, or a different open child/leaf lot to move it as part of the same approval.
- Approved assignment transfer and any approved lot move occur together and create assignment and lot-move history records.
- Parent/container lots remain non-assignable; an old unit currently in a parent lot requires an assignable destination selection during a recorded-work override.
- No SQL migration is required.



## Step 6f.0.4f Permanent Unit Deletion

- Tech Lead, Management, and Admin can permanently delete a unit from its expanded Unit Details mini-menu.
- The permanent-delete modal requires typing `DELETE` exactly before the action can be submitted.
- Deletion runs in one database transaction and removes the unit plus all linked rows detected through current database unit references.
- If any linked row cannot be removed, the transaction rolls back so the unit and its records remain intact.
- Permanent deletion intentionally removes associated earned-weight entries from dashboard totals because the unit is treated as never having been added.


## Step 6f.1 — Closed Lot Lifecycle

- Adds a reversible `is_closed` operational state to `lots`.
- **Open** lots can receive units when they are visible and are not parent/container lots.
- **Closed** lots remain visible for management review, unit history, and Unit Browser filtering.
- Closed lots are removed from unit creation, direct lot-move, and override-handoff destination lists.
- Existing units remain in a lot when it is closed; closing does not reassign, delete, or alter production credit.
- Management and Admin can Close or Reopen a lot from `/management/lots`; Tech Leads remain blocked from that page.
- A closed unit's current lot remains visible in an Edit Unit form only so the record can be preserved or moved to an open destination. It cannot be selected as a new destination.
- Hidden remains separate from Closed: Hidden controls browsing visibility; Closed controls whether a lot can receive units.

### Required SQL

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < sql/2026-06-step-6f1-closed-lot-lifecycle.sql
```

Expected final message:

```text
Step 6f.1 closed-lot lifecycle migration complete
```
