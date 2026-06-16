# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 5f: Production weight application cleanup.

This step makes the Step 5a production weight foundation visible and usable on unit records without adding support-task productivity, QC tracking, or full productivity reporting.

## Step 5f Status

Included in this handoff:

- Shows each unit's effective production weight in the Tech Unit Browser.
- Shows the weight source on the unit row and expanded unit details.
- Resolves effective weight in this order:
  1. Unit-level override
  2. Lot-level default
  3. Unit category default
- Adds controlled unit-level production weight override fields to the Tech Unit edit/create form.
- Limits unit-level weight overrides to Admin, Management, and Tech Lead users.
- Keeps normal Tech users read-only for unit-level weight overrides.
- Keeps production weight separate from Cosmetic Grade.
- Keeps production weight separate from Unit Pass/Fail.
- Adds optional audit columns for tracking who last updated a unit override and when.
- Does not add support-task productivity records.
- Does not add full productivity reporting.

## Important Direction

Support-task productivity remains deferred to a future version. Current Step 5 work is focused on Configuration, Lots, User/Role cleanup, and production weight foundation/application.

## Key Routes

```text
/tech/units
/tech/units/new
/tech/units/new/modal
/tech/units/:unitId/edit
/tech/units/:unitId/edit/modal
/management/lots
/management/config
```

## Step 5f File Touches

- `README.md`
- `controllers/techController.js`
- `models/productionWeightModel.js`
- `models/techUnitModel.js`
- `sql/2026-06-step-5f-production-weight-override-audit.sql`
- `views/fragments/tech-unit-duplicate-modal.ejs`
- `views/fragments/tech-unit-form.ejs`
- `views/fragments/tech-units-table.ejs`
- `public/css/tech.css`

## Step 5f Notes

Production weight is not a unit condition field. It does not replace Cosmetic Grade and does not decide Unit Pass/Fail.

The current effective weight order is:

```text
Unit override > Lot default > Unit category default
```

Unit overrides should be used sparingly when a single unit does not match the lot/category default.

## Next Direction

Next likely step: Step 5g — Configuration page final polish.
