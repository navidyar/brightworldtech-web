# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 2i.5: Global Table/Form Contrast + Assignable Lots + Professional Unit Details.

This step improves visual clarity and lot assignment behavior.

## Changes Added

- Global table contrast through `public/css/work-area.css`
- Global form contrast through `public/css/work-area.css`
- Tech Units filter alignment fixed
- Unit lot selection changed to assignable lots
- Expanded unit detail panel redesigned into a compact professional layout

## Assignable Lot Rule

A lot is assignable only when it does not have child lots.

Example:

```text
Customer Lot
├── Dell Lot
└── HP Lot