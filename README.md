# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 2f: Standardized Requirement Dropdowns.

This step improves the Lot Detail requirement form.

The Add Requirement form now changes the Required Value field depending on the selected requirement field:

- If matching config values exist, the field becomes a dropdown.
- If no matching config values exist, the field stays as free text.
- Touchscreen uses fallback values of Yes, No, and Any if no config values exist yet.

This helps prevent users from typing values many different ways.

## Side Notes / Future Auth Step

A future mini-step should improve account recovery and browser autofill behavior.

Suggested future step:

```text
Step 2f.1: Password Reset, Setup-Link Copy Button, and Login Autofill Cleanup