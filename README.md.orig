# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 5e: Configuration CRUD foundation.

This step adds controlled create/edit/activate/deactivate behavior for configuration values after the Step 5d Configuration display cleanup and Step 5c User/Role cleanup.

## Step 5e Status

Included in this handoff:

- Admin-only Configuration value create flow.
- Admin-only Configuration value edit flow.
- Active/inactive toggle for config values.
- Activate/deactivate confirmation modals.
- No hard delete behavior for config values.
- Existing records remain protected because old values are deactivated instead of deleted.
- HTMX modal flows use HTML fragments and HTMX redirects, not JSON.
- Configuration categories remain grouped from Step 5d.
- Production Weight Configuration remains separate from support-task productivity.

## Important Direction

Support-task productivity remains deferred to a future version. Step 5 is focused on Configuration, Lots, User/Role cleanup, and production weight foundation.

## Key Routes

```text
/management/config
/management/config/values/new/modal
/management/config/values
/management/config/values/:configValueId/edit/modal
/management/config/values/:configValueId/activate/modal
/management/config/values/:configValueId/deactivate/modal
```

## Step 5e File Touches

- `README.md`
- `controllers/configController.js`
- `models/configModel.js`
- `routes/config.js`
- `views/fragments/config-value-form-modal.ejs`
- `views/fragments/config-value-status-modal.ejs`
- `views/pages/management-config.ejs`
- `public/css/style.css`

## Step 5e Notes

Config values may be used by existing lots, units, and app forms. This step intentionally does not add hard deletes. Use deactivate/reactivate for lifecycle changes.

Codes are stable app keys. Edit labels, values, descriptions, sort order, and active state freely, but change codes only when you know the app does not depend on the existing code.

## Next Direction

Next likely step: Step 5f — Production weight application cleanup.
