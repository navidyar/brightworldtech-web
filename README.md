# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

## Reset Design Stage F.5 — Add/Edit Form Panel Architecture

- Makes the Create/Edit Unit modal itself the only outer form surface: the modal interior is now white, with no tinted parent canvas behind the section panels.
- Gives every major Add/Edit section its own lightly separated Lookup-style panel with an outside heading, thin matching border, restrained shadow, and 8px rounded corners. Assignment/Identity use pale blue, Catalog/Processor/Comments use pale violet, Memory/Storage/System use pale teal, Issues/Weight use pale amber or rose, and Grade/Outcome use pale green.
- Keeps all instructional helper text hidden while retaining validation errors, duplicate controls, warnings, and operational-state notices.
- Refines Unit Outcome into one compact 7px rounded segmented control rather than separate pill-like choices.
- Preserves every field name, field order, live model/processor/lot behavior, duplicate checks, catalog requests, validation, role scope, routes, controllers, models, JavaScript, and database behavior. No migration is required.

## Reset Design Stage F.4 — Form Labels & Add/Edit Modal Simplification

- Aligns the Tech Units filter-label rhythm: Search Units, standard select labels, and **Created Date Range** now use the same compact `.72rem / 650` Lookup-derived label style, 3px left inset, and 4px label-to-control gap.
- Removes routine instructional copy from Create/Edit Unit in the rendered UI, including the numbered guide, section descriptions, field hints, and repeated module descriptions. Validation messages, duplicate-result controls, warnings, error messages, and the lot-assumption workflow-state message remain available.
- Makes the modal itself the primary form container. Form-section titles now sit outside their individual white work panels; the prior blue in-panel section headers and visible parent-card treatment are removed.
- Applies the same clean form structure to the full-page Create/Edit fallback, without loading legacy `tech.css` for that page.
- Does not change form fields, field names, live model/processor/lot behavior, duplicate checks, catalog requests, validation, role scope, routes, controllers, models, JavaScript, or database behavior. No migration is required.

## Reset Design Stage F.3 — Exact Metrics Controls & Panel Shadows

- Applies one scoped Metrics Dashboard control contract to the Tech Units Search Units textarea, all standard filter selects, and the app-controlled Created Date triggers: Inter/system font stack, `.86rem`, `600` emphasis, `#26384e` text, and consistent line height. The date labels now inherit the exact same text treatment as the adjacent controls.
- Reapplies the Lookup-style thin blue SVG chevron directly to the Tech Units select elements, including the same 16px icon, right-side inset, and `appearance: none` normalization.
- Strengthens separation between the independent Search & Filters and Units workspaces with Lookup’s core panel shadow: `0 8px 24px rgba(29,44,69,.08)`, while retaining the existing thin borders and rounded corners.
- Preserves all Tech Units behavior, including Tech User role/data/filtering, date range behavior, actions, HTMX, controllers, models, routes, and database behavior. No SQL migration is required.

## Reset Design Stage F.2 — Metrics Section Structure & Date Control Normalization

- Moves the **Search & Filters** and **Units** titles out of their working panels and places them directly above their respective containers, matching the compact section-label rhythm used by the Lookup Metrics Dashboard.
- Keeps Search & Filters and the Units table as separate white, thin-bordered, restrained-shadow panels; removes the tall internal header bars and the redundant Shared Unit Browser label.
- Shows the loaded count as a compact green **N loaded** status beside the external Units heading.
- Consolidates standard form fields to the same final normal-weight Lookup control contract and gives the Created Date Range triggers one explicit component rule matching the regular selects: Inter/system font, `.86rem`, `400` weight, `#26384e` text, `39px` height, and the same border/radius/shadow.
- Normalizes the Created Date Range fieldset/legend layout so its two date triggers align with the Tech User control on the shared second filter row. From and Through remain horizontal under their respective triggers.
- Retains all existing Tech Units behavior, including Tech User option data and filter behavior, date parameters, Apply Filters, current role gates, HTMX loading, actions, table expansion, and database behavior.
- No database migration is required.

## Reset Design Stage F.1 — Tech Units Detail and Access Refinement

- Refines the clean `/tech/units` cutover without restoring legacy `tech.css`: the page heading is now **Tech Units Browser**, the Unit-row disclosure arrow is easier to notice, the nested Unit table has square internal corners, and summary action buttons remain on one horizontal line with table-only overflow on narrow screens.
- Restores the intended wide-screen filter hierarchy: **Assignable Lot**, **Category**, and **Grade** share the first row; Tech Lead+ users see **Tech User** and the horizontal Created Date Range pair together on the second row. Both date triggers now use the same normal Lookup-style text treatment as standard select controls.
- Uses each Unit Details workspace surface as its color source: compact section headings and emphasized labels use a darker related blue, green, teal, amber, or violet rather than one generic navy heading color.
- Removes the My Weight Earned feature from regular-Tech access in both the rendered UI and direct endpoint authorization. Tech Lead+ retains the existing per-user My Weight Earned panel and underlying weight data; regular Tech dashboard aggregate charts remain unchanged.
- No database migration is required.

## Reset Design Stage F — Tech Units Clean Lookup Cutover

- Makes `/tech/units` the first fully migrated BWT page: it no longer loads legacy `tech.css`, preventing historical Tech Units selectors and `!important` rules from competing with the new visual system. Other Tech pages still retain their existing stylesheet until they are migrated deliberately.
- Replaces the former Unit Browser parent card with two independent Lookup-style workspaces: **Search & Filters** and **Units**. Each uses a thin clear border, restrained shadow, slightly rounded Lookup corners, and an intentionally different pale utility surface.
- Uses the final Lookup form-control contract consistently for the page: Inter/system stack, `.9rem / 600` input/select/textarea values, `.72rem / 650` labels, `39px` controls, `7px` corners, thin blue-gray borders, soft focus outlines, and the Lookup SVG select chevron.
- Keeps Search Units alongside a two-row right-side control grid on wider screens. Assignable Lot and Category occupy the first row; Grade, Tech User (Tech Lead+ only), and the horizontal From/Through date pair occupy the second. Filter groups reflow before the date pair changes height.
- Applies restrained contextual color without gradients: pale blue for the filter workspace, pale neutral blue for results, soft green for grade/outcome context, soft amber for workflow context, and soft violet for history/audit context.
- Preserves every functional contract: Tech User source, Tech Lead+ visibility, current-assignment filtering, date parameters and Apply Filters behavior, HTMX events, row expansion, action locations, routes, models, controllers, JavaScript, and database behavior. No migration is required.

## Reset Design Stage E — Metrics Typography, Color, Date Alignment, and Form Simplification

- Uses the current Lookup Metrics Dashboard hierarchy on Tech Units: normal-weight `.9rem` form values, compact `.72rem / 650` labels, and measured `650` emphasis for page/workspace headings and key values.
- Applies the Metrics-style pale-blue utility palette without gradients: related soft-blue panel/header surfaces, darker blue-gray text, white editable controls, and one-pixel borders on every panel edge.
- Keeps Assignable Lot, Category, and Grade together on the wide-screen first filter row. For Tech Lead+, Tech User and Created Date Range share the second row; the two date controls remain side-by-side at the same 39px height as the layout narrows.
- Removes routine form helper copy from the Search & Filters workspace: the panel instruction, Search Units note, Assignable Lot note, Created Date Range note, and the selections/apply guidance. Labels, placeholders, From/Through captions, warnings, active-filter state, and action labels remain.
- Does not change Tech User data/options or role gate, filters, date parameters, Apply Filters behavior, routes, HTMX events, actions, models, controllers, JavaScript, or database behavior. No migration is required.

## Reset Design Stage C — Lookup Form, Surface, and Detail Consistency

- Applies the final Lookup Metrics Dashboard control treatment on Tech Units: normal-weight `.86rem` select/input/textarea values, compact `.72rem / 650` labels, `39px` controls, `7px` control corners, and the same thin blue SVG select chevron.
- Keeps the Lookup date-trigger emphasis (`.86rem / 600`) while preserving the existing app-controlled Created Date calendar and Apply Filters workflow.
- Places Assignable Lot, Category, and Grade together on the wide-screen first filter row. Tech User and Created Date Range remain together beneath them for Tech Lead+; whole filter groups reflow before either date control changes height.
- Removes visual gradients, thick top section strips, and color-rotating inner cards from the Tech Units table workspace, expanded mini-menu, and History area.
- Uses consistent Lookup-like panel hierarchy: `10px` outer panels, `8px` mini-menu/history workspaces, `7px` controls, and `6px` inner items.
- Does not change Tech User data/options, role visibility, filters, queries, HTMX behavior, actions, controllers, models, or database behavior. No migration is required.

## Reset Design Stage B — Tech Units Created Date Calendar

Reset Design Stage B replaces only the Tech Units browser-native Created Date Range popup with the same app-controlled calendar pattern used by the Lookup Metrics Dashboard. The page still submits the established `createdStartDate` and `createdEndDate` values in `YYYY-MM-DD` format, and dates still take effect only when the user chooses Apply Filters. From and Through remain beneath their individual date triggers. Tech User scope/options, all other filters, role visibility, model/controller queries, table behavior, HTMX events, and database behavior remain unchanged. No database migration is required.

## Reset Design Stage A — Tech Units Header & Filter Workspace Only

Reset Design Stage A begins the Lookup-inspired visual migration from the restored stable baseline. It updates only the Tech Units page heading, Search & Filters workspace, and Unit Browser outer shell. The established Tech User option source, Tech Lead+ visibility, current-assignment filter behavior, filter names, HTMX events, model/controller queries, Unit Browser table, expanded detail panels, and action behavior remain unchanged. The new page-scoped stylesheet uses the approved Lookup form language: compact 39px controls, thinner blue-gray borders, 7px corners, small labels, a thin SVG select chevron, pale-blue panel headers, and restrained shadows. No database migration is required.

Step 7h.3: Client-Side Live Request Filtering.

Step 7h.3 loads the role-scoped Unit Requests for the selected status tab once, then narrows the existing queue in the browser as the reviewer types or chooses a Request Type. This matches the responsive Create Unit catalog-filtering interaction without debounced page refreshes, SQL searches, or caret interruptions. The selected Type and search phrase remain in the queue URL and are preserved through record navigation, return actions, and status-tab changes. No database migration is required.

Step 7h.2.5: Enter-to-Search Queue Simplification.

Step 7h.2.5 keeps instant filtering for Request Type but removes automatic text-search reloads while typing. Search Requests now submits only when the reviewer presses Enter, so spaces, slow typing, and a complete phrase remain uninterrupted. After the normal page refresh, focus returns to the end of the submitted search phrase. No database migration is required.

Step 7h.2.4: Search Caret Placement Fix.

Step 7h.2.4 keeps the Unit Requests queue search focused after a refresh and places the caret after the existing search phrase, allowing a reviewer to continue typing without moving the cursor manually. No database migration is required.

Step 7h.2.3: Persistent Queue Search Focus.

Step 7h.2.3 keeps the Unit Requests queue ready for scanner- and keyboard-first review by focusing Search Requests whenever the queue page opens or returns from browser history. It does not add any focus-stealing event listeners while a reviewer is actively using another control. No database migration is required.

Step 7h.2.2: Verified Search SQL & Exact Metrics Control Fidelity.

Step 7h.2.2 corrects the remaining Unit Requests search failure and matches the current Lookup Metrics Dashboard dropdown treatment exactly. The queue search now uses the live lots-table `name` column, and Request Type uses Lookup’s custom SVG chevron rather than a browser-native arrow. No database migration is required.

Step 7h.2: Lookup-Style Unit Request Controls.

Step 7h.2 brings the current Lookup project’s labeled-toolbar form language to Unit Requests: compact labels, 42px blue-gray bordered controls, 8px corners, and soft group focus rings. Search stays below the status tabs; Request Type moves into its own streamlined control row beneath the Requests heading. All existing immediate filtering, ordering, archival, and access behavior remains unchanged.

Step 7h.1: Instant Request Queue Filtering.

Step 7h.1 removes the separate Apply Filters step from Unit Requests. Request Type now sits in the Requests header and refreshes immediately when selected; Search Requests refreshes automatically after a short pause or immediately with Enter. The existing Clear filters link resets both filters without changing the selected status tab.

Step 7h: Unit Request Ordering & Retention.

Step 7h keeps normal Unit Request queue views ordered oldest to newest by submission time, moves resolved requests to Archived automatically 30 days after review or withdrawal, and preserves them indefinitely for requester- and reviewer-scoped history. The normal All tab excludes archived requests; Archived is newest to oldest by archive time.

Step 7g.3: Lookup Typography Fidelity.

Step 7g.3 aligns the Unit Requests queue typography with the current Lookup project: the shared Inter font stack, smaller operational type, Lookup-matched charcoal-blue emphasis colors, and 620–650 weights for queue headings, request titles, metadata, and filter labels. No request behavior or database data changes.

Step 7g.2: Lookup-Fidelity Unit Request Queue Rework.

Step 7g.2 replaces the oversized, bubble-like Step 7g.1 presentation with a thinner Lookup-style request workspace and results panel. It uses smaller typography, pale-blue utility headers, thin borders, compact controls, restrained shadows, and a flush request table while preserving all Unit Request behavior. No database changes are required.

Step 7g: Unit Request Queue Triage.

Step 7g adds Request Type and compact search filters to Unit Requests, preserves the full queue context when changing status, opening a record, or completing a request action, and clarifies the filtered request count. No database changes are required.

Step 7f.1: Clickable Request Records.

Step 7f.1 removes the redundant **View Details** button from Unit Requests. Each request record now opens its detail page when the request content is clicked or activated with the keyboard, while a pending requester’s **Withdraw** control remains a separate protected action. The selected status filter is preserved. No database changes are required.

Step 7f.2: Model Catalog Modal Repair.

Step 7f.2 restores the shared modal structure for Add/Edit Unit Model and Activate/Deactivate Model dialogs. It also prevents the catalog page from scrolling behind an open modal. No workflow behavior or database data changes.

Step 7f: Catalog Exception Workflow.

Step 7f extends the shared Unit Requests area with controlled Model Catalog Addition and Processor Catalog Addition requests. Regular Tech users submit observed values from Create Unit; Tech Leads can inspect the shared queue, while Management/Admin approve or reject catalog changes. Approval creates or activates only the catalog value/mapping needed and never creates a Unit.

Step 7e.3.3: Intentional Duplicate Request Flow Hotfix.

Step 7e.3a: Unit Requests UI Refinement.

Step 7e.3a gives the Unit Requests list and detail pages the same compact, structured work-area treatment as Unit Browser: responsive request rows, plain status text, a clearer review layout, and a readable request timeline. No workflow or database behavior changes.

Step 7e.3 adds one role-aware Unit Requests area. Regular Tech users submit and track only their own Intentional Duplicate requests; Tech Leads, Management users, and Admins review the shared queue. A request does not create a Unit or Asset Tag until it is approved.

Step 7e.3.1 fixes the `/unit-requests` GET page load when no request body exists. The controller now safely falls back to the default Pending status without trying to read `returnStatus` from an undefined request body.

Step 7e.3.2 sends Create Unit data to the Intentional Duplicate request-modal route as URL-encoded form data, which the app’s existing Express parser supports. It also makes request-context extraction safe when a request has no body. This fixes the 500 error that occurred before the request modal could open. No database changes are required.

Step 7e.3.3 keeps the Intentional Duplicate request modal closed until the Create Unit data passes server-side validation. It presents any missing required field messages inline with the matching-existing-unit result, processes HTMX attributes after the modal is inserted by the custom fetch path, closes the request modal after successful submission, and returns a pending-request confirmation to Create Unit. It also fixes the `matchedIdentifiers is not defined` submission error. No database changes are required.



## Step 7h.3 — Client-Side Live Request Filtering

### What Changed

- Loads the role-scoped requests for the selected status tab once, then filters only that authorized in-page list.
- Filters **Search Requests** on every keystroke without a debounce timer, page navigation, SQL search, focus reset, or caret movement.
- Filters **Request Type** in the browser immediately, matching the Create Unit catalog-filtering behavior.
- Searches request number, requester, Asset Tag, serial summary/context, model, processor, and lot context across the loaded queue.
- Updates the visible request count and empty state in place.
- Keeps the current Type and exact typed phrase, including a trailing space, in the queue URL, record links, Withdraw return values, status-tab links, and browser-history return path.
- Keeps the server responsible for role scope, selected status tab, and archived visibility; the browser only narrows already-authorized records.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests**, type `Dell Latitude ` slowly, and keep typing. Confirm the rows narrow immediately with no reload and the caret remains after the trailing space.
2. Search by request number, requester, Asset Tag, serial context, model, processor, and lot. Confirm each narrows the loaded status-tab list.
3. Change **Request Type** while text is present. Confirm the rows and count update instantly without moving focus to Search Requests.
4. Click a request after typing a phrase and return with Back to Unit Requests. Confirm the phrase and Type remain applied.
5. Select a different status tab. Confirm the current Type and search phrase carry to that status view and filter its freshly loaded records in place.
6. Use **Clear filters**. Confirm Search Requests is cleared, All Types is selected, the full current status list returns, and Search Requests is focused.


## Step 7h.2.5 — Enter-to-Search Queue Simplification

### What Changed

- Removes the debounced automatic request-list refresh while text is being entered in **Search Requests**.
- Keeps **Request Type** immediate: selecting a type still submits the queue filter right away.
- Lets the browser submit a text search only when the reviewer presses **Enter**.
- Preserves unfinished phrases, spaces, and slow typing without an intermediate reload or caret interruption.
- Keeps the existing search-first focus behavior after an Enter search or Type-driven refresh, with the caret restored after the submitted phrase.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests** and type `Dell Latitude ` slowly, including the trailing space. Confirm the page does not refresh while you type.
2. Continue typing `5420`, then press **Enter**. Confirm the queue searches for the complete phrase and the refreshed field shows `Dell Latitude 5420|`.
3. Search for a multi-word requester, model, processor, or lot phrase. Confirm spaces are preserved until **Enter** is pressed.
4. Change **Request Type**. Confirm that filter still applies immediately without needing Enter.
5. Use **Clear filters** and confirm the normal queue context resets without a delayed reload.


## Step 7h.2.4 — Search Caret Placement Fix

### What Changed

- Keeps **Search Requests** focused after each normal Unit Requests queue refresh.
- Places the caret at the end of the current search phrase after focus is restored, rather than before its first character.
- Preserves the visible search phrase without selecting or overwriting it, so a search for `Dell` returns as `Dell|`.
- Retains the existing behavior that does not interrupt Request Type interaction, row selection, or normal Tab navigation.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests** and type `Dell` in **Search Requests**. Wait for the automatic refresh.
2. Confirm the refreshed search field shows `Dell` with the caret immediately after the final `l`.
3. Type another character without clicking in the field. Confirm it appends to the existing phrase rather than inserting at the beginning.
4. Press Enter after entering a phrase and confirm the same end-of-text caret placement after the refreshed page loads.
5. Change **Request Type** while a search phrase is present. Confirm the queue refreshes, Search Requests regains focus, and the caret remains after the existing phrase.


## Step 7h.2.3 — Persistent Queue Search Focus

### What Changed

- Adds native `autofocus` support to **Search Requests** so the queue is immediately ready for typing when `/unit-requests` opens.
- Adds a small client-side focus helper that restores Search Requests after normal queue navigation and browser-history restoration from a request detail page.
- Uses `preventScroll` so restoring focus does not move the reviewer away from their current queue position.
- Does not attach focus behavior to Request Type, row clicks, or Tab navigation; focus is restored only on page entry and browser history display.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests** directly. Confirm the Search Requests caret is ready without clicking inside the field.
2. Type a search term and wait for the automatic refresh. Confirm the refreshed page returns focus to Search Requests.
3. Change **Request Type**. Confirm the selected filter applies and focus returns to Search Requests after the page refresh.
4. Open a request record, use **Back to Unit Requests**, and confirm the queue search field is focused with the prior status, type, and search context preserved.
5. Use Tab to move through Request Type, Clear filters, and a request record. Confirm focus is not pulled back to Search Requests while navigating those controls.


## Step 7h.2.2 — Verified Search SQL & Exact Metrics Control Fidelity

### What Changed

- Corrects the Unit Requests search query using the exact live error: the `lots` table uses `name`, not `lot_name`. Searching a destination lot now uses `requested_destination_lot.name`, preventing the 500 error during debounced or Enter-triggered search.
- Retains the JSON snapshot text casts introduced in Step 7h.2.1, so Asset Tag and serial context remain searchable.
- Replaces the incorrect browser-native select approach with the exact current Lookup Metrics Dashboard control primitive: a `39px` field, `.9rem / 600` text, `7px` corners, Lookup focus outline, and its `16px` blue SVG chevron positioned at the right edge.
- Uses `background-color` for the select field so the Lookup chevron remains visible.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests**, type any characters into **Search Requests**, and wait for the automatic refresh. Confirm the queue refreshes normally rather than showing the generic 500 page.
2. Search by a known destination lot name and confirm matching Intentional Duplicate requests are returned.
3. Compare **Request Type** with **Lookup → Metrics Dashboard → Report controls → Date range**. Confirm both use the same thin blue SVG down-chevron, size, right-side spacing, border, and focus outline.
4. Change Request Type and press Enter in Search Requests. Confirm instant filtering and URL context still work.


## Step 7h.2.1 — Request Search Hotfix & Metrics Select Fidelity

### What Changed

- Added JSON snapshot text casts for searchable duplicate-request intake data. The remaining live destination-lot column mismatch is corrected in Step 7h.2.2.
- Preserved search coverage for request number, requester, Asset Tag, serial context, requested model/processor wording, and destination lot.
- Attempted a browser-native Request Type arrow treatment; Step 7h.2.2 replaces it with Lookup’s actual custom SVG chevron.
- Aligns the Unit Requests control labels with the Metrics Dashboard’s compact `.72rem / 650` label treatment.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests**, type a distinctive word into **Search Requests**, and wait briefly. Confirm results refresh instead of showing a 500 error.
2. Search for an Asset Tag or serial value known to be present in an Intentional Duplicate request snapshot. Confirm the request remains discoverable.
3. Press Enter in Search Requests and confirm the current status and Request Type context are preserved.
4. Open the **Request Type** selector and compare its native down-arrow, field spacing, and focus behavior with **Lookup → Metrics Dashboard → Report controls → Date range**.
5. Change Request Type and confirm instant filtering still works.


## Step 7h.2 — Lookup-Style Unit Request Controls

### What Changed

- Replaces the remaining generic Unit Requests form treatment with the current Lookup project’s labeled-toolbar control pattern.
- Gives **Search Requests** and **Request Type** compact labels above their fields, 42px control height, Lookup-style blue-gray borders, `8px` corners, and restrained soft-blue focus rings.
- Keeps Search in the Review Queue workspace beneath the status tabs, while Request Type moves into its own slim control row beneath the Requests heading.
- Keeps **Clear filters** as a plain text action beside Search Requests rather than turning it into a button.
- Retains immediate Request Type filtering, debounced search, Enter-to-search, URL context, request ordering, archived views, access scope, and clickable request records.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests** and confirm Search Requests has a compact label above a 42px field with a blue-gray border and small corner radius.
2. Click into Search Requests and Request Type. Confirm each control group receives a soft blue focus ring without changing its layout.
3. Confirm Request Type appears below the Requests heading in its own compact control row, not inline with the heading or result count.
4. Change Request Type, type a search phrase, press Enter, and use **Clear filters**. Confirm filtering remains immediate and all queue context is preserved.
5. Check a narrow browser width. Search and Clear filters should stack cleanly, while Request Type remains full-width within its control row.


## Step 7h.1 — Instant Request Queue Filtering

### What Changed

- Removes the separate **Apply Filters** button from the Unit Requests queue.
- Moves **Request Type** into the Requests panel header beside the filtered result count, keeping the quick type control where users are actively reviewing records.
- Refreshes the queue immediately when Request Type changes, while preserving the selected status tab and current search phrase.
- Refreshes Search Requests automatically after a brief pause while typing, avoiding a page reload for every keystroke.
- Lets Enter submit the current search immediately.
- Keeps **Clear filters** as a direct reset for both Request Type and Search Requests without changing the selected status tab.
- Preserves existing request access scope, queue ordering, archived behavior, URL context, clickable records, and protected Withdraw controls.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests** and confirm there is no Apply Filters button.
2. Change the **Type** selector in the Requests header. Confirm the queue refreshes immediately and the selected status tab and search phrase remain intact.
3. Type a distinctive search term. Confirm the queue refreshes after a short pause; press Enter with another term and confirm it refreshes immediately.
4. Clear the search with the browser search-field clear control or delete the text. Confirm the current status/type queue returns after the brief pause.
5. Use **Clear filters** and confirm it resets both Type and Search Requests while keeping the current status tab.
6. Open a matching record and return with **Back to Unit Requests**. Confirm the active status, Type, and search phrase are still preserved.

## Step 7h — Unit Request Ordering & Retention

### What Changed

- Adds the `unit_requests.archived_at` timestamp and the archive-retention index through `sql/2026-07-step-7h-unit-request-retention.sql`.
- Sorts Pending, Approved, Rejected, Withdrawn, and All queue views oldest to newest by submitted time, with request ID as the tie-breaker.
- Adds an **Archived** tab. Archived records remain fully viewable and retain their original status, request details, and request history.
- Keeps archived records out of all normal queue views, including **All**, so everyday review lists contain only active operational history.
- Uses a startup catch-up pass and a daily in-process retention pass to archive only Approved, Rejected, and Withdrawn requests whose `reviewed_at` timestamp is at least 30 days old. Pending requests are never auto-archived.
- Sorts the Archived tab newest to oldest by archive time and displays the archive timestamp in place of the normal submitted-time column.
- Preserves existing requester/reviewer access scope and filter/search context. There are no manual archive or restore controls in this step.

### Post-Rebuild Checks

1. Run `sql/2026-07-step-7h-unit-request-retention.sql` before rebuilding the application.
2. Open **Unit Requests** and confirm Pending, Approved, Rejected, Withdrawn, and All are ordered oldest to newest by submission time.
3. Confirm the **Archived** tab appears, uses newest-to-oldest archive ordering, and keeps Request Type/Search filters working.
4. Confirm **All** excludes archived requests, while an archived request remains viewable from the Archived tab with its detail and history intact.
5. Confirm a Pending request remains visible regardless of age. For a safe retention test, use a non-production copy or a resolved request older than 30 days; after rebuild, inspect the app log for any `Unit Request retention pass archived ...` message.


## Step 7g.3 — Lookup Typography Fidelity

### What Changed

- Retains the shared Inter font stack already used by both applications and aligns Unit Requests queue emphasis with the current Lookup styles.
- Uses Lookup-matched charcoal-blue text colors and `650` weights for workspace/results headings, `640` for request titles, and `620–630` for filter labels, metadata labels, and compact support text.
- Reduces the visual heaviness of the status tabs, filter labels, table headings, request numbers, and metadata without making operational values faint.
- Keeps the existing pale-blue panels, filters, clickable request records, permissions, request actions, and responsive behavior unchanged.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests** and compare the queue headings, Request Type/Search labels, tabs, request titles, and metadata to the Lookup project. Confirm the text is smaller, less heavy, and uses the same charcoal-blue / muted-blue hierarchy.
2. Confirm request titles remain easy to scan, while labels such as Request Type, Submitted, and Requested Context read as quiet metadata rather than bold section headings.
3. Confirm Apply Filters, Clear, and Withdraw remain legible and keep their existing behavior.
4. Switch status tabs, apply a search, open a record, and return to the queue. Confirm no filtering, URL-context, or clickable-row behavior changes.


## Step 7g.2 — Lookup-Fidelity Unit Request Queue Rework

### What Changed

- Replaces the three oversized queue cards with one compact **Review Queue** workspace and one **Requests** results panel.
- Removes the repeated Review Queue, Filter the Queue, Find Requests, Results, and Requests heading stack so the page has less visual and textual weight.
- Uses Lookup-style panel proportions: `10px` corners, thin neutral borders, smaller headings and labels, pale-blue utility headers, and restrained shadows.
- Keeps the status tabs and filters inside one workspace; labels identify the controls without adding another card or explanatory block.
- Changes the count to plain header text such as **4 requests shown** instead of a bordered count bubble.
- Makes the request table flush with the Results panel, removes alternating row fills and colored left rails, and uses simple dividers plus a light hover state.
- Gives queue-only filter controls and Withdraw compact Lookup-style corners and sizing without changing global buttons elsewhere in the application.
- Keeps all request filtering, search, URL context, clickable-record behavior, permissions, and actions unchanged.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests** at desktop width. Confirm the page reads as the page heading, one Review Queue workspace, then one Requests results panel.
2. Confirm the workspace and results panel use thin borders, pale-blue headers, smaller text, and restrained shadows without rounded sub-cards or count bubbles.
3. Confirm status tabs, Request Type, Search Requests, Apply Filters, and Clear retain all existing behavior.
4. Confirm request rows are flat with simple dividers, retain clickable record access, and keep a pending Tech Withdraw control separate.
5. Narrow the browser window. Confirm tabs scroll horizontally when needed, filters stack cleanly, and no horizontal page overflow appears.


## Step 7g.1 — Lookup-Style Unit Request Queue Layout

### What Changed

- Rebuilds the queue page into three clearly separated operational areas: **Review Queue**, **Find Requests**, and **Results**.
- Moves the filtered count into the Results header, replacing the detached page-level count box.
- Gives each area a thin neutral border, restrained shadow, and more internal spacing so tabs, filters, and table results no longer read as one compressed block.
- Adds a dedicated filter-panel heading and keeps Request Type, Search Requests, and Clear aligned as one intentional control group.
- Gives the Results panel its own heading, compact count summary, and a slightly roomier empty state.
- Keeps the existing clickable request records, status tabs, filters, search behavior, URL context, permissions, and request actions unchanged.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests** at a wide desktop width. Confirm the page reads in order as Review Queue, Find Requests, and Results, with visible but restrained borders and shadows separating each area.
2. Confirm the count appears in the Results panel header and updates correctly when changing a status tab, Request Type, or search phrase.
3. Confirm Request Type, Search Requests, Apply Filters, and Clear remain aligned and usable without crowding at normal desktop width.
4. Confirm a request record still opens from its linked content area and a pending Tech Withdraw action remains separate.
5. Narrow the browser window. Confirm the tabs scroll horizontally when necessary, the filters stack cleanly, and the Results count moves below its heading without horizontal page overflow.


## Step 7g — Unit Request Queue Triage

### What Changed

- Adds a compact **Request Type** filter for All Types, Intentional Duplicate, Model Catalog Addition, and Processor Catalog Addition.
- Adds a queue search for request number, requester, matching Asset Tag or serial context, requested model or processor wording, and destination lot.
- Keeps the existing status tabs and preserves the selected Request Type and search phrase when switching status tabs.
- Preserves the status, Request Type, and search phrase when opening a request, returning to the queue, or submitting Withdraw, Approve, or Reject from the request detail page.
- Replaces the ambiguous numeric badge with a clear filtered count such as **Showing 4 requests**.
- Keeps queue actions unchanged: reviewers still open a record before Approve or Reject, and a regular Tech’s pending Withdraw action remains its own protected control.
- Requires no database migration.

### Post-Rebuild Checks

1. Open **Unit Requests** as a reviewer. Change Request Type and confirm only that request type is shown.
2. Search by a request number, requester, a known matching Asset Tag in `BWT########` form, a serial fragment, a catalog model/processor term, and a destination lot. Confirm each relevant request can be found.
3. Combine a status tab, Request Type, and search phrase. Open a request, then use **Back to Unit Requests**. Confirm all three filters are still present.
4. From a filtered detail page, approve or reject a safe request. Confirm the resulting detail page and Back link retain the same queue context.
5. As a regular Tech, withdraw a safe pending request from a filtered queue. Confirm the queue context remains after the request is withdrawn.
6. Narrow the browser window and confirm the Request Type, search field, and filter actions stack cleanly without horizontal page overflow.


## Step 7f.1 — Clickable Request Records

### What Changed

- Removes the redundant **View Details** button from the Unit Requests queue.
- Makes the request content area a real keyboard-accessible detail link, preserving the active status filter.
- Lets request rows without a pending requester action open from the full row content area.
- Keeps a regular Tech’s pending **Withdraw** action separate, so it cannot accidentally open the request detail page.
- Adds a visible keyboard focus outline and pointer cursor for the record link.
- Requires no database change.

### Post-Rebuild Checks

1. Open **Unit Requests** as a reviewer and click a request record. Confirm its detail page opens and **Back to Unit Requests** returns to the same status tab.
2. Use Tab to focus a request record, then press Enter. Confirm it opens the correct detail page with a visible focus outline before activation.
3. As a regular Tech with a pending request, click the request content and confirm it opens details. Then click **Withdraw** and confirm only the withdrawal form submits.
4. Narrow the browser window and confirm the linked request content and Withdraw action stack cleanly without horizontal page overflow.


## Step 7f.2 — Model Catalog Modal Repair

### What Changed

- Rebuilds the Add Unit Model and Edit Unit Model fragments with the application-standard `modal-panel`, header, close button, and padded body structure.
- Rebuilds the Activate/Deactivate confirmation dialog with a compact selected-model summary card and normal confirmation spacing.
- Gives the Deactivate action a clear destructive treatment while keeping Activate as the normal primary action.
- Locks the background page and contains backdrop scrolling whenever any modal is open, so the Model Catalog table cannot move behind an active dialog.
- Updates the Model Catalog page asset versions so browsers load the repaired modal CSS and JavaScript immediately after rebuild.
- Requires no database migration and changes no catalog permissions or save behavior.

### Post-Rebuild Checks

1. Open **Add Unit Model** and **Edit**. Confirm each dialog is centered, padded, readable, and has a standard close button and action row.
2. Leave a required field blank and submit. Confirm validation remains inside the styled dialog.
3. Open **Deactivate** for an active model. Confirm the selected model summary is visible, the Deactivate button is clearly destructive, and Cancel/close dismiss the dialog.
4. With any Model Catalog dialog open, try to scroll the page behind it. Confirm the background catalog remains locked while the dialog/backdrop handles its own scrolling.
5. Activate a safe inactive model and deactivate a safe active model. Confirm the existing status-change behavior and filters still work.

## Step 7f — Catalog Exception Workflow

### What Changed

- Adds **Request Missing Model** to Create Unit for regular Tech users after Manufacturer, Unit Category, and an unselected exact model name are present.
- Adds **Request Processor Addition** to Create Unit for regular Tech users after a managed Unit Model is selected.
- Adds Model Catalog and Processor Catalog request detail records beneath the existing shared `unit_requests` and event-history foundation.
- Keeps the Tech-submitted observed wording immutable while the reviewer records separate canonical model/processor values on approval.
- Allows Management/Admin approval to add or reactivate a Unit Model, or add/reactivate a Processor and map it only to the requested Unit Model.
- Keeps Tech Leads able to inspect Catalog Exception requests, but prevents them from approving or rejecting managed catalog changes.
- Does not allow a Catalog Exception approval to create a Unit or Asset Tag.

### Required SQL

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-07-step-7f-catalog-exception-workflow.sql
```

Expected final message:

```text
Step 7f catalog exception workflow migration complete
```

### Post-Rebuild Checks

1. As a regular Tech, type an exact missing Unit Model after selecting Manufacturer and Unit Category. Confirm **Request Missing Model** opens a styled request modal and creates a pending Model Catalog request, not a catalog entry.
2. As a regular Tech, select a Unit Model and request an unavailable processor. Confirm the request captures the model, observed Processor Type, exact Processor value, and requester explanation.
3. As a Tech Lead, confirm Catalog Exception requests are visible but have no approve/reject controls.
4. As Management/Admin, approve a safe Model request with a canonical name. Confirm the model becomes selectable in Create Unit and the original observed wording remains visible in request history.
5. As Management/Admin, approve a safe Processor request. Confirm the selected processor becomes available only for the requested Unit Model.
6. Reject a Catalog Exception request with a note, and withdraw one as the requester. Confirm no catalog data changes.

## Step 7e.3a — Unit Requests UI Refinement

### What Changed

- Reworks the list into a compact, responsive request queue with a structured header, subtle alternating rows, and plain color-coded status text.
- Keeps request details, requester explanations, and history on the request detail page instead of crowding the main queue.
- Adds a clearer list count, responsive filters, and consistently spaced action controls.
- Refines detail cards, reviewer actions, and the event history into the existing work-area visual language.
- Changes no request permissions, approval rules, data, or database schema.

### Post-Rebuild Checks

1. Open **Unit Requests** as a Tech and as a reviewer; confirm the queue is compact, readable, and responsive.
2. Change status filters and confirm the active filter is clear without using pill/bubble styling.
3. Open a request detail; confirm matching-unit data, intake snapshot, reviewer actions, and event history remain accessible.
4. Confirm a narrow browser window stacks row details and actions cleanly without horizontal page overflow.

## Step 7e.3.3 — Intentional Duplicate Request Flow Hotfix

### What Changed

- Keeps **Request Intentional Duplicate** unavailable until Assignable Lot, Unit Category, and the existing default Unit Status are present.
- Sends the full Create Unit form to the existing server-side validator before opening the reason modal, so malformed optional details also remain blocked.
- Shows validation feedback inline with the matching existing unit instead of opening a Close-only modal.
- Calls `htmx.process()` after the custom fetch path inserts the request modal, preventing the request form from falling back to an unstyled full-page submission.
- Closes the request modal after successful submission and shows a pending-review confirmation, including a Unit Request link, in the Create Unit duplicate area.
- Fixes the `matchedIdentifiers is not defined` typo during request creation.
- Requires no database change.

### Post-Rebuild Checks

1. With a matching existing unit selected but no Unit Category, confirm **Request Intentional Duplicate** is unavailable and explains what must be selected.
2. Select a catalog model or Unit Category. Confirm one click opens the styled reason modal.
3. Submit a valid reason. Confirm the modal closes, Create Unit shows a pending-request confirmation, and no Unit or Asset Tag is created.
4. Confirm the submitted request appears in **Unit Requests**.

## Step 7e.3 — Unit Requests and Intentional Duplicate Requests

### What Changed

- Adds shared `unit_requests`, `unit_duplicate_requests`, and `unit_request_events` tables for future controlled request types.
- Adds **Unit Requests** under Tech navigation.
- Adds **Request Intentional Duplicate** to the matching-existing-unit panel for regular Tech users during Create Unit intake.
- Captures the selected matching existing unit, destination lot, serial context, a full immutable intake snapshot, requester reason, and submission time.
- Creates no Unit and no Asset Tag at submission time.
- Lets the requester withdraw only their own pending request.
- Lets Tech Leads, Management users, and Admins approve or reject requests; rejection requires a note, and a requester cannot approve their own request.
- Rechecks the original destination lot at approval. It must still be active, open, and a leaf/assignable lot; approval never silently changes the requested lot.
- Approval creates the requested Unit transactionally, assigns a new server-generated Asset Tag, preserves the original matching unit unchanged, and records the resulting Unit link and event timeline.
- Keeps the shared request framework ready for later model and processor catalog-addition requests without enabling those request types yet.

### Required SQL

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-07-step-7e3-unit-requests-intentional-duplicates.sql
```

Expected final message:

```text
Step 7e.3 Unit Requests and Intentional Duplicate migration complete
```

### Post-Rebuild Checks

1. As a regular Tech, select a matching existing unit during Create Unit and submit a reasoned Intentional Duplicate request. Confirm no Unit or Asset Tag is created immediately.
2. Confirm the Tech sees only their own request in **Unit Requests** and can withdraw it while pending.
3. As Tech Lead, Management, or Admin, confirm the shared review queue shows the matching existing unit, immutable requested intake, requester explanation, and event history.
4. Confirm rejection requires a note and records the reviewer decision.
5. Approve a safe test request and confirm exactly one new Unit with a new Asset Tag is created in the originally requested lot; the matching existing unit remains unchanged.
6. Confirm approval is blocked when the requested destination lot has become hidden, closed, or a parent/container lot.


Step 7e.2a.3.1 corrects the Escape target lookup so the dialog itself, rather than its backdrop, receives the approved Escape-close behavior.

Step 7e.2a.3.2 makes only the selected-lot assumption state visually distinct through the existing green and amber form colors, without a badge, border, or heavier font weight.


Step 7e.2a.3.3 replaces the lot-assumption state colors with dedicated, visibly distinct muted deep-green and muted terracotta text colors. It changes no font weight, badge, border, or layout.


Step 7e.2a.3.4 preserves the state span while no lot is selected. The previous update cleared the status element at initialization, which removed the colored state span before the user chose a lot. This hotfix restores that element when needed and preserves it for all later lot changes.

## Step 7e.2a.3.4 — Lot Assumption State Markup Preservation Hotfix

### What Changed

- Stops clearing the selected-lot status markup when no lot is selected.
- Restores the state span when an older in-page form instance no longer has it.
- Allows the Step 7e.2a.3.3 deep-green and muted-terracotta state colors to apply reliably.
- Requires no database change.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2a3d-lot-assumption-state-markup-preservation-hotfix.diff
```

#### 2. Apply patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2a3d-lot-assumption-state-markup-preservation-hotfix.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Focused Validation

1. Open Create Unit with no Assignable Lot selected, then select a lot without duplicate-match assumption enabled; only **not enabled** should appear muted terracotta.
2. Change to an enabled lot; only **enabled** should appear muted deep green.
3. Clear/change the lot repeatedly and confirm the state word stays colored each time.

## Step 7e.2a.3.3 — Lot Assumption State Visibility Hotfix

### What Changed

- Makes only **enabled** visibly deep green.
- Makes only **not enabled** visibly muted terracotta.
- Retains the normal supporting-text font weight, plain-text treatment, and responsive placement.
- Requires no database change.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2a3c-lot-assumption-state-visibility-hotfix.diff
```

#### 2. Apply patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2a3c-lot-assumption-state-visibility-hotfix.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Focused Validation

1. Select a lot with duplicate-match assumption enabled and confirm only **enabled** is visibly deep green.
2. Select a lot without the setting and confirm only **not enabled** is visibly muted terracotta.
3. Confirm the remainder of the sentence remains normal neutral supporting text with no added bold treatment.

## Step 7e.2a.3.2 — Lot Assumption State Color Polish

### What Changed

- Keeps the selected-lot assumption sentence as ordinary supporting text.
- Shows only **enabled** in the application’s dark green positive-state color.
- Shows only **not enabled** in the application’s dark amber caution-state color.
- Retains the existing font weight, responsive placement, and no-badge/no-border treatment.
- Requires no database change.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2a3b-lot-assumption-state-color-polish.diff
```

#### 2. Apply patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2a3b-lot-assumption-state-color-polish.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Focused Validation

1. Select a lot with duplicate-match assumption enabled and confirm only **enabled** is dark green.
2. Select a lot without the setting and confirm only **not enabled** is dark amber.
3. Confirm the rest of the sentence remains the normal supporting-text color and weight.


## Step 7e.2a.3.1 — Modal Escape Target Hotfix

### What Changed

- Fixes the Escape handler to target the Create/Edit Unit dialog instead of its non-dismissible backdrop.
- Preserves the existing first-Escape behavior for open Assignable Lot, Unit Model, or Processor option lists.
- Keeps backdrop-click and focus-loss closure blocked.
- Requires no database change.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2a3a-modal-escape-target-hotfix.diff
```

#### 2. Apply patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2a3a-modal-escape-target-hotfix.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Focused Validation

1. Open Create Unit and press Escape with no selector list open; confirm the modal closes.
2. Open Assignable Lot, Unit Model, or Processor options; confirm the first Escape closes only the list and a second Escape closes the modal.
3. Confirm backdrop clicks still do not close the modal.


## Step 7e.2a.3 — Unit Intake Modal Escape and Scrollbar Corner Polish

### What Changed

- Allows **Escape** to close Create Unit and Edit Unit after the form has no open searchable selector.
- When Assignable Lot, Unit Model, or Processor options are open, the first **Escape** closes the open option list; a subsequent **Escape** closes the modal.
- Continues to block backdrop-click and focus-loss closure for Create Unit and Edit Unit.
- Keeps the outer dialog shell rounded and clips it cleanly; the inner form body now owns vertical scrolling so the scrollbar no longer visually squares the top-right or bottom-right modal corners.
- Requires no database change.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2a3-modal-escape-and-scrollbar-corner-polish.diff
```

#### 2. Apply patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2a3-modal-escape-and-scrollbar-corner-polish.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Focused Validation

1. Open Create Unit and Edit Unit. Confirm **Escape** closes the modal when no selector option list is open.
2. Open Assignable Lot, Unit Model, or Processor options. Confirm the first **Escape** closes only that list and the second **Escape** closes the modal.
3. Confirm backdrop clicks and focus changes still do not close the modal.
4. Scroll a long form in a narrow viewport. Confirm scroll behavior remains normal and the modal shell keeps visibly rounded upper-right and lower-right corners.

## Step 7e.2a.2 — Unit Intake Modal and ScanTools-Only Graphics Refinement

### What Changed

- Aligns the selected-lot duplicate-assumption sentence with the **Assignable Lot** control on wide screens, while retaining its normal stacked placement on narrow screens.
- Uses muted contextual color for only **enabled** or **not enabled**, without a badge, bubble, or heavier bold treatment.
- Refreshes compatible Processor Types and Processor values when a form opens with a selected Unit Model, including Edit Unit forms.
- Removes Graphics Adapters from Create Unit and Edit Unit. ScanTools-imported graphics data remains available in the Unit Browser expanded details.
- Ignores manually crafted graphics-adapter request fields, so manual forms cannot write ScanTools-owned graphics data.
- Uses a normal-flow header and action area in Create/Edit Unit. Backdrop clicks and Escape no longer close those dialogs; X, Cancel, and successful saves retain their intended close behavior.
- Requires no database change.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2a2-unit-intake-modal-and-scantools-graphics-refinement.diff
```

#### 2. Apply patch

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2a2-unit-intake-modal-and-scantools-graphics-refinement.diff
```

#### 3. Rebuild

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Focused Validation

1. Open Create Unit and Edit Unit. Confirm clicks outside, Escape, and focus changes do not close either dialog. Confirm X, Cancel, and a successful save still close it.
2. Scroll a long form on a small viewport. Confirm the header and action buttons remain in normal form flow and do not cover fields.
3. Select a Unit Model, including on Edit Unit. Confirm compatible Processor Types refresh immediately.
4. Confirm Graphics Adapters do not appear in Create Unit or Edit Unit. Confirm existing ScanTools graphics still appear in an expanded Unit Browser row.
5. Select lots with and without duplicate-match assumption enabled. Confirm the contextual sentence aligns with the field and only the enabled/not enabled wording changes color.

## Step 7e.2a.1 — Lot Context and Keyboard Language Cleanup

### What Changed

- Shows one plain-text status alongside the selected Assignable Lot during Create Unit: **Existing-unit assumption is enabled for this lot.** or **Existing-unit assumption is not enabled for this lot.** The status moves beneath the field on narrower layouts.
- Keeps the status informational only. Existing server-side lot eligibility and duplicate-assumption checks remain authoritative.
- Moves **OS Build** directly after **Operating System** and moves **BIOS Version** into OS Build’s former position.
- Consolidates **US English** and **English US** into one active Keyboard Language option: **English US**. Existing unit specifications that used the duplicate US English value are reassigned to the retained active value before the duplicate is retired.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2a1-lot-context-keyboard-language-cleanup.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2a1-lot-context-keyboard-language-cleanup.diff
```

#### 3. Database backup — separate checkpoint

```bash
cd /home/bwtdallas-webserver/app

mkdir -p backup

backup="backup/bwtdallas-before-step7e2a1-$(date +%Y%m%d-%H%M%S).sql"

if docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > "$backup"; then
  tail -n 3 "$backup"
else
  rm -f "$backup"
  exit 1
fi
```

#### 4. Database migration — Keyboard Language consolidation

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-07-step-7e2a1-lot-context-keyboard-language.sql
```

#### 5. Rebuild

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation

1. In Create Unit, select one lot that enables duplicate-match assumption and one that does not. Confirm the plain-text status updates immediately and moves beneath the field at narrow viewport widths.
2. Confirm the unit form still requires a listed Assignable Lot and changing the lot refreshes a displayed duplicate-check result.
3. Confirm Expanded Specifications orders Operating System, OS Build, then BIOS Version.
4. Confirm Keyboard Language offers **English US** only. Open an existing unit previously using US English and confirm it displays and saves as English US.

## Step 7e.2a — Create Unit Intake Layout Refinement

### What Changed

- Moves **Lot Assignment** to the first Create Unit section so the destination work lot is chosen before serial identity and duplicate-assumption checks.
- Replaces the fixed Assignable Lot dropdown with a searchable, controlled selector. Typed text must resolve to one listed assignable lot; server-side lot eligibility validation remains unchanged.
- Refreshes duplicate-assumption eligibility when the selected work lot changes.
- Moves **Unit Category** into **Manufacturer and Model**. A selected managed model continues to apply its mapped category automatically.
- Removes the standalone **Operating System** section and includes Operating System with the BIOS, OS build, and diagnostic fields in **Expanded Specifications**.
- Moves **Cosmetic Grade and Unit Pass/Fail** after Cosmetic Issues and Hardware Issues.
- Removes **Production Weight** from Create Unit. Create requests ignore crafted production-weight override fields server-side; Edit Unit continues to show and allow existing role-limited weight controls.
- Requires no database change.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2a-create-unit-intake-layout-refinement.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2a-create-unit-intake-layout-refinement.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation

1. Open Create Unit and confirm Lot Assignment appears first. Search for and choose an eligible work lot; confirm the typed text must resolve to a listed lot before submission.
2. Enter a known duplicate serial and confirm changing the selected work lot immediately refreshes the duplicate-assumption decision.
3. Confirm Unit Category appears with Manufacturer and Unit Model. Choose a managed model and confirm its mapped category is applied.
4. Confirm Create Unit has no Production Weight section or override inputs. Submit a normal test Create Unit and confirm the server still applies the normal internal default weight.
5. Open Edit Unit and confirm its Production Weight section remains available according to the existing role rules.
6. Confirm Operating System appears within Expanded Specifications and Cosmetic Grade appears after both issue sections.

## Step 7e.2.1 — Duplicate Assumption Intake Recovery Hotfix

### What Changed

- Prevents a Create Unit submission with Unit Serial or BIOS Serial values from bypassing the current duplicate lookup while a blur-based check is still pending.
- When a duplicate is confirmed during the final server-side save check, re-renders the Create Unit form with the controlled candidate panel rather than the retired legacy duplicate modal.
- Groups matches by existing unit, so a unit whose Unit Serial and BIOS Serial contain the same value appears once, with both matching identifiers explained together.
- Uses the controlled candidate lookup to display the actual current lot, assignment, Parked state, same-lot/closed-lot guard, and **Assume Existing Unit** action when eligible.
- Requires no database change.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2-duplicate-intake-recovery-hotfix.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2-duplicate-intake-recovery-hotfix.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation

1. As a regular Tech, select an enabled work lot and enter a known serial such as `KX81NNZ` for an Active unit in another open lot.
2. Confirm the candidate appears once, displays its current lot, and offers **Assume Existing Unit** when eligible.
3. Immediately submit after entering a matching serial without waiting for the blur request. Confirm the form remains open with the same controlled candidate panel instead of the legacy close-only duplicate modal.


## Step 7e.2 — Controlled Existing Unit Assumption

### What Changed

- Adds a Management-controlled **Allow duplicate-match unit assumption** setting to each Lot. It is disabled by default for existing and new lots until Management intentionally enables it.
- During **Create Unit** only, early Unit/BIOS Serial duplicate matches now show every candidate and explain whether it can be assumed into the currently selected work lot.
- A regular Tech may assume a confirmed matching unit only when the selected destination lot is open, visible, assignable, and enabled for duplicate-match assumption.
- Active units already in the selected destination lot cannot be assumed again. The UI directs the Tech to the existing Override workflow for intentional rework.
- Active units currently in a closed lot cannot be assumed by a regular Tech and must use the Override workflow.
- Parked units remain assumable even if their last-known lot was closed; assumption returns the unit to Active in the selected eligible work lot and assigns it to the acting Tech.
- Assumption does not create a new Asset Tag or new unit. It updates only current lot/assignment state and records existing lot, assignment, and Parked-lifecycle history notes. Previous Work Complete credit remains unchanged.
- The server rechecks serial evidence, role, destination eligibility, destination-lot policy, same-lot state, closed-source state, and Parked status inside the transaction.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e2-existing-unit-assumption.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e2-existing-unit-assumption.diff
```

#### 3. Database backup — separate checkpoint

```bash
cd /home/bwtdallas-webserver/app

mkdir -p backup

backup="backup/bwtdallas-before-step7e2-$(date +%Y%m%d-%H%M%S).sql"

if docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > "$backup"; then
  tail -n 3 "$backup"
else
  rm -f "$backup"
  exit 1
fi
```

#### 4. Database migration — database changes only

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-06-step-7e2-existing-unit-assumption.sql
```

Expected final message:

```text
Step 7e.2 existing unit assumption migration complete
```

#### 5. Rebuild — only after the migration succeeds

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation

1. As Management or Admin, enable **Allow duplicate-match unit assumption** on one safe open leaf work lot.
2. As a regular Tech, select that lot during Create Unit and enter a Unit Serial or BIOS Serial for a known active unit in a different open lot. Confirm the candidate can be selected and assumed.
3. Confirm the assumed unit moves to the selected work lot, is assigned to the Tech, and no new Asset Tag is created.
4. Confirm unit History records the duplicate serial assumption in lot and assignment history; prior Work Complete credit remains unchanged.
5. Repeat with a Parked unit. Confirm it returns to Active in the selected work lot and is assigned to the Tech.
6. Confirm an active unit already in the selected work lot cannot be assumed, and a closed-lot active unit shows Request Override rather than Assume Existing Unit.


## Step 7e.1c — Processor Compatibility Catalog and Model Catalog Expansion

### What Changed

- Adds **Chrome** as a Unit Category for ChromeOS devices. Chrome models remain grouped under their actual manufacturers, including Acer, ASUS, Dell, HP, and Lenovo.
- Expands the managed Model Catalog with Apple Intel and Apple Silicon Mac systems, ASUS business/consumer/ChromeOS families, Acer business/consumer/ChromeOS families, and common education/business Chrome models.
- Changes the Unit Model selector to filter by **Manufacturer** first. Selecting a model applies its configured Unit Category, so Apple MacBook models remain discoverable even when the prior category selection was not MacBook.
- Adds a model-to-processor compatibility table and seeds common Intel, AMD, Apple, Qualcomm, MediaTek, and Rockchip processor values.
- Replaces the unrestricted Processor Model dropdown with a **Processor Type** control and searchable **Processor** selector. Both are restricted to catalog values mapped to the selected Unit Model.
- Preserves existing historical unit model/processor combinations by importing every existing pairing into the compatibility table during the migration.
- Typed processor text cannot be saved unless it resolves to a compatible catalog value. The server validates compatibility as well as the UI.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e1c-processor-compatibility-catalog.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e1c-processor-compatibility-catalog.diff
```

#### 3. Database backup — separate checkpoint

```bash
cd /home/bwtdallas-webserver/app

mkdir -p backup

backup="backup/bwtdallas-before-step7e1c-$(date +%Y%m%d-%H%M%S).sql"

docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > "$backup"
```

#### 4. Database migration — database changes only

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-06-step-7e1c-processor-compatibility-catalog.sql
```

Expected final message:

```text
Step 7e.1c processor compatibility catalog migration complete
```

#### 5. Rebuild — only after the migration succeeds

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

## Step 7e.1b.1 — Model Selector Layering Hotfix

### What Changed

- Fixes the Unit Model suggestion list being clipped or covered by lower Unit form sections.
- Raises the active Manufacturer and Model form section above later sections only while the combobox is open.
- Temporarily allows the active section to show overflow so the complete options list remains usable.
- Keeps the normal form-section clipping and stacking behavior after the list is closed.
- No database migration is required.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e1b1-model-selector-layering-hotfix.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e1b1-model-selector-layering-hotfix.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```



## Step 7e.1b — Model Selector Cleanup

### What Changed

- Replaces the separate Unit Model search input and model select list with one searchable **Unit Model** combobox.
- The combobox stays disabled until a Manufacturer is selected, then lists only catalog models for that Manufacturer and the currently selected Unit Category.
- Typing narrows the available catalog choices in the same field; choosing a result saves the selected catalog model ID.
- Free text cannot be saved as an unapproved model. A typed value must match and resolve to a catalog model.
- Existing inactive models remain visible for historical Edit Unit records, but inactive models are not offered for new selections.
- No database migration is required.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e1b-model-selector-cleanup.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e1b-model-selector-cleanup.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

## Step 7e.1a — Manufacturer-Model Catalog

### What Changed

- Adds **Model Catalog** under Configuration for Admin-only management of unit models.
- Models are scoped to a Manufacturer and Unit Category, can be created/edited/activated/deactivated, and remain visible on historical Edit Unit records when later deactivated.
- Unit Create/Edit now requires a Manufacturer before models become selectable and provides a local model-search field to narrow the selected manufacturer/category list.
- Seeds a curated refurbishment-oriented catalog for Dell, HP, Lenovo, Apple, and Microsoft business systems. Apple entries distinguish Intel and M-series variants where the silicon materially identifies the model.
- Includes a safe schema/data migration that retains existing model rows and only adds missing catalog fields/seed rows.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e1a-unit-model-catalog.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e1a-unit-model-catalog.diff
```

#### 3. Database backup — recommended checkpoint

```bash
cd /home/bwtdallas-webserver/app

mkdir -p backup

backup="backup/bwtdallas-before-step7e1a-$(date +%Y%m%d-%H%M%S).sql"

if docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > "$backup"; then
  tail -n 3 "$backup"
else
  rm -f "$backup"
  exit 1
fi
```

#### 4. Database migration — database changes only

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-06-step-7e1a-unit-model-catalog.sql
```

Expected final message:

```text
Step 7e.1a unit model catalog migration complete
```

#### 5. Rebuild

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

## Step 7e.1 — Identifier Intake Controls

### What Changed

- Removes the editable Asset Tag field from Create Unit. Asset Tags are now generated only by the server when a genuinely new unit is created; crafted client submissions cannot supply one.
- Shows the existing Asset Tag as read-only text in Edit Unit. Asset Tags remain permanent and cannot be changed through the form.
- Normalizes Unit Serial and BIOS Serial values to uppercase for save and display while preserving case-insensitive, punctuation-insensitive duplicate comparison.
- Checks both entered serial values against both stored serial types whenever either serial field loses focus during Create Unit, and enforces the same cross-field check again at final save.
- Shows every matching candidate early, including Asset Tag, Active/Parked state, current lot when active, serial values, model, and CPU context.
- Does not enable existing-unit assumption or movement yet. The former late `Use Existing Unit` shortcut is blocked server-side so the controlled assumption rules cannot be bypassed before Step 7e.2.
- Includes a small data migration that uppercases existing Unit/BIOS serial display values and refreshes their normalized comparison values.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7e1-identifier-intake-controls.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7e1-identifier-intake-controls.diff
```

#### 3. Database backup — recommended checkpoint

```bash
cd /home/bwtdallas-webserver/app

mkdir -p backup

backup="backup/bwtdallas-before-step7e1-$(date +%Y%m%d-%H%M%S).sql"

if docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > "$backup"; then
  tail -n 3 "$backup"
else
  rm -f "$backup"
  exit 1
fi
```

#### 4. Database migration — database changes only; do not rebuild yet

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-06-step-7e1-identifier-intake-controls.sql
```

Expected final message:

```text
Step 7e.1 identifier intake controls migration complete
```

#### 5. Rebuild — only after the migration succeeds

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation

1. Open Create Unit and confirm no Asset Tag field is shown.
2. Enter a Unit Serial or BIOS Serial using lowercase letters, leave the field, and confirm the field becomes uppercase.
3. Confirm the early check searches both stored serial types and shows every matching candidate before the rest of the form is completed.
4. Confirm a no-match result permits normal entry, while a matching serial still blocks accidental duplicate creation at final save.
5. Open Edit Unit and confirm the Asset Tag is visible but cannot be changed.
6. Confirm the prior direct duplicate-resolution route no longer updates or moves an existing unit.

## Step 7d — Login Activity Audit

### What Changed

- Records each successful sign-in in `user_login_activity` with the account's primary role snapshot at sign-in time.
- Adds **Management → Login Activity** for Admin and Management users only.
- Defaults to the current Dallas-local day and supports viewing another past day.
- Shows one row per user with their role at first sign-in, first sign-in time, most recent sign-in time, and total successful sign-ins for the selected day.
- Login activity starts recording after this migration is deployed. Existing `users.last_login_at` data remains unchanged and is not fabricated into historical audit rows.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7d-login-activity-audit.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7d-login-activity-audit.diff
```

#### 3. Database backup — recommended checkpoint

```bash
cd /home/bwtdallas-webserver/app

mkdir -p backup

backup="backup/bwtdallas-before-step7d-$(date +%Y%m%d-%H%M%S).sql"

if docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > "$backup"; then
  tail -n 3 "$backup"
else
  rm -f "$backup"
  exit 1
fi
```

#### 4. Database migration — database changes only; do not rebuild yet

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-06-step-7d-login-activity-audit.sql
```

Expected final message:

```text
Step 7d login activity audit migration complete
```

#### 5. Rebuild — only after the migration succeeds

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation

1. Sign in with a non-production test account, then sign out and sign in again.
2. As Admin or Management, open **Management → Login Activity**.
3. Confirm the current Dallas-local date is selected and the account appears once with its first sign-in, most recent sign-in, and a successful sign-in count of `2`.
4. Choose a different date and confirm the report changes without exposing the page to Tech Lead or Tech users.

## Step 7b — Unit Browser Filter Interaction Cleanup

### What Changed

- The Assignable Lot, Category, Grade, Tech User, and authorized Show Parked Units controls now refresh the Unit Browser immediately when changed.
- Search Units remains manual so a user can scan or paste one or more identifiers before selecting Apply Filters.
- Created From and Created Through are now grouped in one **Created Date Range** container to show that they work together.
- Date range changes remain manual; users set either or both dates, then choose Apply Filters.
- The existing Clear action still returns the browser to its default Active Units view.
- No database migration is required.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7b-unit-browser-filter-interaction-cleanup.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7b-unit-browser-filter-interaction-cleanup.diff
```

#### 3. Rebuild — no SQL is required

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation

1. Change Assignable Lot, Category, Grade, Tech User, or Show Parked Units and confirm the Unit Browser refreshes immediately while retaining current filters.
2. Enter a Search Units value or a Created Date Range value and confirm nothing refreshes until Apply Filters is selected.
3. Confirm Created From and Created Through appear together under Created Date Range and work correctly when one or both dates are supplied.
4. Confirm Clear returns the browser to its default Active Units view.


## Step 7c — Account Security Settings

### What Changed

- Limits newly created and reset passwords to **10 through 25 characters**. Server-side validation and the password form enforce the same range.
- Adds the system-managed **Security Settings** configuration value `password_link_expiry_hours`, seeded to **1 hour**.
- Admins can edit the password setup/reset link expiration from Configuration. The protected setting accepts only whole hours from **1 through 24**; its code, category, active state, label, and description remain system-managed.
- Newly generated initial setup and password reset links use the current Configuration value. Existing generated links keep their original expiry time.
- The `create-admin-link` script now uses the same configured expiration instead of an environment default.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step7c-account-security-settings.diff
```

#### 2. Apply the patch — file changes only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step7c-account-security-settings.diff
```

#### 3. Database backup — recommended checkpoint

```bash
cd /home/bwtdallas-webserver/app

mkdir -p backup

backup="backup/bwtdallas-before-step7c-$(date +%Y%m%d-%H%M%S).sql"

docker compose exec -T mysql sh -lc 'mysqldump --no-tablespaces -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > "$backup"

tail -n 3 "$backup"
```

#### 4. Database migration — database changes only; do not rebuild yet

```bash
cd /home/bwtdallas-webserver/app

docker compose exec -T mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < sql/2026-06-step-7c-account-security-settings.sql
```

Expected final message:

```text
Step 7c account security settings migration complete
```

#### 5. Rebuild — only after the migration succeeds

```bash
cd /home/bwtdallas-webserver/app

docker compose up -d --build
```

### Post-Rebuild Validation

1. Open **Management → Configuration** as an Admin. Under **System and Access Configuration**, confirm **Security Settings** includes **Password Setup / Reset Link Expiration** with a default value of `1`.
2. Edit the setting to another whole value such as `2`; confirm values below `1`, above `24`, decimals, and non-numeric text are rejected.
3. Generate a setup or reset link and confirm the link page reports the configured number of hours. Restore the setting to `1` after testing if a different value was used.
4. Open a setup/reset password link and confirm passwords shorter than 10 characters or longer than 25 characters are rejected; a 10–25 character password is accepted.

## Step 7a — Navigation and Typography Cleanup

### What Changed

- Keeps the desktop sidebar permanently expanded with flat, full-width navigation rows.
- Removes nested navigation-card treatment and collapsible group behavior; submenu indentation differentiates the second level.
- Adds full-row hover and active states.
- Keeps a compact mobile drawer for narrow screens without collapsing the internal navigation groups.
- Reduces overly heavy navigation and heading treatment for a less cramped visual hierarchy.
- No database migration was required.

## Step 6f.5 — Final Step 6 Audit and Handoff Cleanup

### Audit Result

- **No application code or database changes are required.** The final audit found no remaining Step 6 defect that warrants changing approved behavior.
- Park and Return routes are limited to Tech Lead, Management, and Admin, with model-level authority checks as a second safeguard.
- A Park action clears only the current operational lot and assignment in one transaction, records the lifecycle event, and preserves identifiers, history, completed-work entries, and earned production credit.
- Return to Active requires an open, visible, non-container destination lot. Assignment is optional and, when selected, is limited to an active Tech or Tech Lead.
- Regular Tech users remain limited to Active Units. Server-side guards block Parked-unit edits, lot moves, assignments, Work Complete, Pass/Fail review, override requests and approvals, and direct Parked-unit earned-credit details.
- Closed, hidden, and parent/container lots remain unavailable as new or Return-to-Active destinations.
- The Unit Browser defaults to Active Units; authorized users can use the compact **Show Parked Units** toggle. A successful Return to Active redirects back to Active Units.
- Static JavaScript syntax checks passed across the source tree. This audit is source-level; the completed browser validation of the Parked workflow remains the operational acceptance check.

### Deployment

#### 1. Patch dry-run — no file, database, or container changes

```bash
cd /home/bwtdallas-webserver/app

patch --batch --dry-run -p1 < handoff/step6f5-final-step6-audit-handoff.diff
```

#### 2. Apply the patch — documentation only

```bash
cd /home/bwtdallas-webserver/app

patch --batch -p1 < handoff/step6f5-final-step6-audit-handoff.diff
```

#### 3. Build

No rebuild or SQL migration is needed because this patch changes `README.md` only.

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

Step 6 is complete. Continue with **Step 7a — Browser Filter Interaction Cleanup**:

- Automatically apply single-choice Unit Browser filters such as lot, category, grade, assigned Tech, and lifecycle view.
- Keep manual **Apply Filters** for multi-value Asset Tag search and the grouped **Created Date Range** inputs.
- Group **Created From** and **Created Through** under one date-range container without changing their existing filtering behavior.
- Preserve the Active/Parked lifecycle policy and do not reintroduce Archive/Unarchive terminology.

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

## Reset Design Stage D — Tech Units CSS Consolidation

- Replaced the accumulated Stage A/B/C Tech Units stylesheet with one page-scoped Stage D visual layer.
- Removed obsolete Unit Browser filter-art rules from `public/css/tech.css`: gradients, color-rotating field borders, five-pixel accents, forced filter shadows, and competing filter-card overrides.
- Removed the forced three-pixel Unit Details top strips so Tech Units panels use a consistent thin border on all edges.
- The final `/tech/units` visual system now uses the Lookup Metrics Dashboard palette and rhythm: white panels, pale-blue utility headers, thin blue-gray borders, restrained shadows, 10px outer corners, 8px detail workspaces, and 7px controls.
- Consolidated form typography for this page: normal-weight `.86rem` field values, `.72rem / 650` labels, and the Lookup Metrics custom calendar styling.
- Kept all Tech Units behavior unchanged: Tech User option source and role gate, filters, date parameters, Apply Filters behavior, routes, HTMX events, actions, models, controllers, and database behavior.
- No SQL migration is required.
