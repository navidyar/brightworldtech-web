# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 2j.2: Tech-Side Request Override Flow.

This step lets Tech users create manual override requests from the Tech Units page.

## What Step 2j.2 Adds

- Request Override button inside each unit's expanded detail menu
- Override request modal
- Reason validation
- Duplicate pending request prevention
- Management override queue integration
- Manual override request records in `unit_override_requests`

## Override Flow

```text
Tech user opens Tech Units
↓
Expands a unit row
↓
Clicks Request Override
↓
Enters reason
↓
Request is sent to Management
↓
Management reviews it from /management/overrides