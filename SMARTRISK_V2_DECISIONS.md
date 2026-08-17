# SMARTRISK V2 DECISIONS LOG
 
Plain English record of every significant decision made during the build, who raised it, what the options were, and what was chosen and why.
 
---
 
## Session 1 and 2: Scaffold and Migrations
 
**Decision: Defer Supabase schema sync to deployment**
Raised by: Builder recommendation
Options: Sync Supabase immediately after each migration, or defer to deployment
Chosen: Defer to Phase 16
Why: Running SQL against Supabase during active development means every schema change requires two steps. If the schema evolves (which it will), Supabase needs patching manually each time. Alembic migration files are the source of truth. At deployment, `alembic upgrade head` pointed at Supabase applies everything in one shot.
 
**Decision: asyncpg requires one statement per op.execute()**
Raised by: Runtime error on migration 015
Why it matters: asyncpg treats every `op.execute()` call as a prepared statement and rejects multiple DDL statements in one string. Every future migration must use one `op.execute()` per statement. Discovered by batching all 19 indexes in one call and hitting a ProgrammingError.
 
**Decision: Composite primary key on risks and incidents**
Chosen: `PRIMARY KEY (id, tenant_id)`
Why: Risk IDs like R-001 are tenant-scoped, not globally unique. Two tenants can both have R-001. The composite key enforces this at the database level and makes every query naturally scoped to a tenant.
 
**Decision: token_version on accounts for refresh token revocation**
Raised by: Security gap identified during auth build
Options: No server-side revocation, Redis blacklist, token_version column
Chosen: token_version integer on accounts
Why: Redis adds infrastructure complexity. Token version is a single integer column, zero extra dependencies. On deactivation or password change, increment the version. All outstanding refresh tokens with the old version are rejected on next use. Access tokens have 15-minute TTL so worst-case exposure after revocation is 15 minutes, which is the accepted industry tradeoff.
 
**Decision: PIN lockout tracked in database**
Raised by: Security gap identified during auth build
Options: IP-based rate limit only, attempt counter in memory, attempt counter in database
Chosen: pin_attempts and pin_locked_until columns on tenants table
Why: IP-based limiting is bypassable via proxies. Memory is lost on restart. Database is persistent and works across multiple server instances. 5 attempts triggers a 15-minute lockout. Attempts reset to 0 on successful PIN entry.
 
**Decision: type claim on JWT to prevent refresh token used as access token**
Raised by: Security gap identified during auth build
Chosen: Stamp `type: "access"` on all access tokens, `type: "refresh"` on refresh tokens. `get_current_account` rejects any token where type is not "access".
Why: Without this, a stolen refresh token could be submitted as a Bearer token and pass auth. One extra field in the JWT payload closes the attack surface completely.
 
**Decision: Last owner protection in deactivate_member**
Raised by: Security gap identified during auth build
Chosen: Check owner count before deactivating. If the member being deactivated is the last Owner, reject with PermissionDeniedError.
Why: A workspace with no Owner has no recovery path. No one can invite users, change settings, or manage billing. The check is a single COUNT query and adds negligible overhead.
 
**Decision: Read workspace ownership limit from database, not JWT**
Raised by: Security gap identified during auth build
Options: Read plan from JWT claims, read plan from database
Chosen: Query the tenants table for owned workspaces with plan=PAID
Why: The JWT is issued at login and may be stale. If a plan was upgraded or downgraded since the token was issued, the JWT carries the old value. The database is always current.
 
**Decision: Lazy-load Supabase client**
Raised by: Server startup error when SUPABASE_URL is empty
Options: Module-level instantiation, lazy-load via _get_supabase()
Chosen: Lazy-load via _get_supabase() function
Why: Module-level instantiation runs when Python imports the file. If SUPABASE_URL is missing or invalid, the entire server fails to start. Lazy-loading defers validation until the first actual auth call, so the server starts cleanly in any environment.
 
**Decision: Frontend design system ported from GAS Styles.html**
Raised by: Discovered after writing index.css from scratch
Options: Write new design system, port existing GAS design system
Chosen: Port existing GAS design system faithfully
Why: The product already has an established visual identity. Users migrating from v1 expect visual continuity. The GAS Styles.html contains 3,484 lines of refined, production-tested CSS. Recreating it from scratch risks inconsistency and wastes work that was already done.
 
Key design decisions extracted from the port:
- Sidebar is LIGHT (#f8fafc), not dark navy
- App layout is CSS Grid (260px 1fr), not flexbox
- Sidebar collapses to 68px, not hidden
- Topbar uses glassmorphism: rgba(246,248,250,.85) with backdrop-filter blur
- Border radius is 14px-18px throughout, not 8px
- Font weight is 700-900 throughout, not 400-600
- Table headers are navy #1F2854 with white text
- Dark mode uses [data-theme="dark"] attribute, not .dark class
- Auth page: left panel is 55% navy, right panel is 45% warm cream #F5F4EF
**Decision: Inline styles permitted for simple one-off cases**
Raised by: Back-and-forth creating CSS classes for single-use values
Chosen: Inline styles are permitted when creating a CSS class would add more complexity than the style itself. Examples: `style={{ color: '#01b88e' }}` on a single accent span, `style={{ maxWidth: 480 }}` on a narrow wrapper, simple flex layouts on one-off containers.
Not permitted: layout-critical styles, dark mode affected styles, anything that repeats across multiple components.
 
**Decision: Register flow uses Supabase Auth email/password**
Raised by: GAS used Google OAuth, v2 needs its own registration
Chosen: Standard email + password registration via Supabase Auth sign_up, backend creates accounts row, returns base token scoped to no workspace, frontend redirects to /workspaces/create.
Why: Supabase Auth handles password hashing, email verification, and session management. The backend only needs to create the accounts row and issue a JWT.
 
**Decision: Password reset uses Supabase JS client on frontend**
Raised by: Reset token arrives in browser URL hash from Supabase email link
Options: Supabase hosted UI, custom page without Supabase JS, custom page with Supabase JS
Chosen: Custom branded page on Vercel domain using Supabase JS client
Why: The reset token always arrives in the browser URL hash via Supabase's email link. Only the Supabase JS client can parse that hash and exchange it for a session. The hosted UI is unbranded. Vite tree-shaking keeps the bundle impact minimal. supabase.ts is isolated to one file and only imported by ForgotPassword.tsx and ResetPassword.tsx.
 
**Decision: Frontend validation is incomplete at Phase 3 close**
Status: Known gap, tracked
What is missing: Real-time inline validation on blur, .invalid class applied per field, field-level error messages below each input, password strength indicator on Register and ResetPassword, name minimum 2 characters.
What is present: HTML5 type="email" and required, submit-time password length and match checks on Register and ResetPassword.
Next session opens with completing this before Phase 4.
 
**Decision: Supabase dashboard redirect URL config**
Required before reset password works in any environment:
- Site URL: Vercel production domain
- Allowed redirect URLs: https://your-domain.vercel.app/reset-password and http://localhost:5173/reset-password

**Decision: Delta polarity rules are product standard (July 30, 2026)**
Source: GAS delta signal audit session
Locked rules:
- avgResidual: UP IS BAD (red arrow up, green arrow down)
- highRiskCount: UP IS BAD
- totalRisks: UP IS BAD
- controlEff: UP IS GOOD (green arrow up, red arrow down)
- openIncidents: UP IS BAD
- avgMttr: UP IS BAD
All v2 frontend components rendering a delta must reference this list.
Arrow follows sign of delta. Color follows polarity of the metric.
These are two independent signals and must never be conflated.

**Decision: Dashboard endpoint returns healthDelta as a dedicated field (July 30, 2026)**
Source: GAS health card inversion bug
Chosen: Backend computes and returns healthDelta explicitly. Health = 100 minus exposure.
healthDelta = -(avgResidual delta). Do not return avgResidual delta and ask the frontend to invert.
Why: Inversion on the frontend was the root cause of the GAS bug. Backend computation is explicit
and testable.

**Decision: monthKey is always yyyy-MM plain string, never a date type (July 30, 2026)**
Source: GAS period label bug
Chosen: Write and return monthKey as VARCHAR always. snapshots_monthly.monthKey is already VARCHAR.
No migration needed. Never store as date type. Never cast to date on read.

**Decision: Snapshot delta is included inside the main dashboard API response (July 30, 2026)**
Source: GAS race condition between parallel calls
Chosen: Single dashboard response contains both current KPIs and snapshot delta.
Fallback logic: if the most recent stored snapshot is already the current month, use the row
before it as the baseline. This ensures delta is meaningful for the whole month after snapshot day.

**Decision: Risk register sorted by id.asc() not created_at.desc() (July 31, 2026)**
Raised by: Edited risks jumping position after bulk import
Chosen: ORDER BY Risk.id ASC as the sole sort. No secondary sort needed since IDs are unique per tenant.
Why: Bulk-imported risks share nearly identical created_at timestamps (milliseconds apart in the same transaction). Sorting by created_at on a tied group is non-deterministic and produces different row order on each query. Risk IDs are zero-padded three digits (R-001, R-033) so string sort is numerically correct up to R-999. ID sort is completely stable because no operation ever changes a risk's ID.

**Decision: db.refresh(risk) required after db.flush() before model_validate (July 31, 2026)**
Raised by: MissingGreenlet ValidationError on updated_at after create and update
Chosen: await db.refresh(risk) immediately after await db.flush(), before any model_validate call on the ORM object.
Why: db.flush() writes the row but marks server-generated columns (updated_at, created_at set by server_default=func.now()) as expired in the SQLAlchemy identity map. Pydantic's from_attributes=True then tries to lazy-load the expired attribute, which requires a synchronous greenlet that does not exist in async context. db.refresh() issues a SELECT to reload all columns eagerly before Pydantic reads them. This pattern is required in every service write function that returns a model_validate result.

**Decision: Users route builds response dict directly, no model_validate on WorkspaceMember ORM (July 31, 2026)**
Raised by: 500 on GET /api/v1/users, WorkspaceMemberResponse.model_validate(m) failing
Chosen: Build response dict directly from both m (WorkspaceMember ORM) and a (Account ORM) without calling model_validate.
Why: WorkspaceMember does not carry email or name columns. Those live on Account. model_validate on an incomplete ORM object fails before any dict merge can correct it. Direct construction from both objects is simpler, eliminates the validation step, and produces the identical response shape.

**Decision: Freshness tooltip uses position:fixed with getBoundingClientRect (July 31, 2026)**
Raised by: Tooltip clipped by table-wrap overflow:auto, flickering caused by cursor movement between badge and tooltip
Chosen: position:fixed, coordinates captured once on mouseenter via getBoundingClientRect, no recalculation during hover.
Why: position:absolute cannot escape an overflow:auto ancestor regardless of z-index. Fixed positioning renders in viewport coordinate space, fully outside the scroll container. Storing coordinates once on enter eliminates the feedback loop where moving toward the tooltip triggers mouseleave on the badge, hiding the tooltip, then mouseenter again, causing the flicker.

**Decision: Category select uses static GAS default list, owner select fetches /api/v1/users (July 31, 2026)**
Raised by: AddRisk and EditRisk modals had free text inputs for category and owner
Chosen: Static CATEGORIES list sourced from LookupService.gs LOOKUP_DEFAULTS.Category. Owner select populated by useEffect fetch on mount. Both selects include escape-hatch options for values not in the list.
Why: Phase 8 will replace static categories with a dynamic lookups endpoint. Static list covers the six standard GAS categories. Owner fetch uses the already-built users endpoint. Escape-hatch options handle imported or legacy data that does not match the static list.

**Decision: RiskTable loading state only shown on initial load, not background refreshes (July 31, 2026)**
Raised by: Edited risks appearing to jump position because table blanked out and repainted
Chosen: Full loading replacement only renders when loading is true AND risks.length is zero.
Why: On background refreshes after create, edit, or delete, risks holds the previous page's data. Replacing the entire table with a loading screen causes a visible blank-and-repaint that makes rows appear to jump. Keeping the stale data visible during refresh gives a stable experience. The new data replaces it smoothly when the fetch resolves.

**Decision: Report Builder implements all 20 blocks, not 16 (August 4, 2026)**
Source: Phase 7 build session
Raised by: Build doc said 16 blocks. GAS Reportservice.gs REPORT_BLOCK_REGISTRY has 20.
Chosen: Implement all 20 blocks. GAS source is authoritative over the build doc.
The 4 additional blocks are: risk-ownership, incident-analytics, executive-dashboard, key-risk-movements.
key-risk-movements returns has_data: false in v2 because risk_history only stores residual_score, not level changes. A dedicated level-change history table is needed before this block can fully compute. This is tracked as a future phase item.

**Decision: strftime platform rule locked (August 4, 2026)**
Source: Windows runtime ValueError on %-d format code
Rule: Never use strftime("%-d") (Linux) or strftime("%#d") (Windows) in any backend service.
Use .day (the integer attribute on date and datetime objects) for zero-stripped day output. This is cross-platform and produces the same result on all operating systems.

**Decision: apiPost and apiGet unwrap the response envelope (August 4, 2026)**
Source: Frontend "Cannot read properties of undefined (reading 'block_data')" runtime error
Behavior: Both functions return res.data.data, which is the inner payload of the API envelope.
Rule: Never add .data on the result of apiPost or apiGet. Type the generic parameter as the inner payload shape only, not the full envelope. All existing and future service functions must follow this pattern.

**Decision: Non-component exports must not live in React component files (August 4, 2026)**
Source: Fast Refresh warning on BLOCK_LABELS export from ReportPreview.tsx
Rule: Constants, maps, and configuration objects are moved to src/types/ or src/utils/. A file that exports both a React component and a non-component value breaks Fast Refresh and causes confusing hot-reload behavior. BLOCK_LABELS moved to src/types/report.ts as the canonical location.

**Decision: SQLAlchemy column type casting is required at ORM read time (August 4, 2026)**
Source: Pylance errors across services/report.py fetch functions
Rule: All string column reads are wrapped in str(). All Numeric, Date, DateTime columns passed to helper functions typed as object receive # type: ignore[arg-type] on that specific line only. Boolean column literal assignments receive # type: ignore[assignment]. Column comparisons use str() on both sides. JSONB columns returned as dict use dict() wrap. These are project-wide conventions applied at every ORM read point.

---

## Session 9: August 6, 2026 — Phase 8 Settings, Lookups, Frameworks, Help

**Decision: All workspace settings stored in workspace_settings JSONB column on tenants table (August 6, 2026)**
Raised by: Phase 8 design review
Options: Add 40+ individual columns to tenants table, use a separate settings table, use JSONB blob on tenants
Chosen: JSONB blob on tenants.workspace_settings for all settings except name, industry, currency_symbol, logo_url
Why: 40+ individual columns would require a large migration and make the schema brittle for future settings additions. A separate table adds a join on every settings read. JSONB on tenants is one read with no join. Name, industry, currency_symbol, and logo_url remain as top-level columns because they are used in joins, filtering, and display contexts elsewhere. All other settings (theme, roles, permissions, AI, alerts, brief) are merged into the JSONB blob via dict merge on write.

**Decision: SettingsData is the canonical type name for workspace settings (August 6, 2026)**
Raised by: TypeScript error ts(2300) duplicate identifier in pages/Settings.tsx
Options: Rename the interface, rename the component, use import aliasing
Chosen: Rename the interface from WorkspaceSettings to SettingsData in src/types/settings.ts. Update all import references across services/settings.ts, hooks/useSettings.ts, components/settings/WorkspaceSettings.tsx, pages/Settings.tsx.
Why: WorkspaceSettings is already bound as the React component name in Settings.tsx. TypeScript does not allow two bindings with the same identifier in the same module scope, regardless of whether one is a type import. Renaming the interface is cleaner than aliasing the import at every call site. SettingsData accurately describes the shape: it is the data returned by the settings API, not a UI concept.

**Decision: Logo upload goes directly from browser to Supabase Storage, backend stores URL only (August 6, 2026)**
Raised by: Phase 8 logo upload design
Options: Upload binary through FastAPI, upload directly from browser to Supabase, store as base64 in JSONB
Chosen: Frontend uploads file directly to Supabase Storage workspace-logos bucket using the Supabase JS client, gets back a public URL, then passes that URL to PATCH /api/v1/settings
Why: Routing binary files through FastAPI adds request size limits, multipart parsing complexity, and memory pressure on the server. Base64 in JSONB balloons the tenant row and is unreadable from external tools. Direct Supabase Storage upload is already supported by the existing supabase-js client, adds zero new infrastructure, and keeps FastAPI stateless. Bucket name is workspace-logos, bucket is public, two policies required (INSERT authenticated, SELECT anon and authenticated).

**Decision: Supabase Storage is preferred over Cloudinary for logo storage (August 6, 2026)**
Raised by: Question during Phase 8 build
Chosen: Supabase Storage
Why: Supabase Storage is already in the stack. No new account, no new API keys, no new SDK, no new failure point. The workspace logo use case is upload once, display once. There are no transformation requirements (no auto-crop, no responsive srcsets, no WebP conversion at scale) that would justify Cloudinary. The Supabase free tier (1 GB storage, 2 GB egress) will never be pressured by B2B workspace logos. Cloudinary is the right choice for consumer-facing apps with heavy image transformation needs.

**Decision: PINSettings folded into WorkspaceSettings component, not a separate file (August 6, 2026)**
Raised by: Build checklist listed PINSettings.tsx as a separate component
Chosen: PIN set and remove live as a section inside WorkspaceSettings.tsx, not a separate file
Why: PIN management has no state independent of the Workspace tab. It shares the same save context and is shown in the same tab in the GAS reference. A separate file would require passing the same props and mutation references down with no additional encapsulation benefit. The Workspace tab is the natural home for PIN since it controls who can enter the workspace.

**Decision: Settings tab visibility uses CSS class toggling, not conditional rendering (August 6, 2026)**
Raised by: Tab switching causing form state loss
Options: Unmount inactive tabs (conditional render), keep all tabs mounted with CSS visibility control
Chosen: All tab panels remain mounted, active class toggled via tab-panel and tab-panel.active CSS classes
Why: Conditional rendering unmounts the inactive tab's React tree, which destroys all local useState values. A user who partially fills the Alerts form, clicks to the Workspace tab, then returns would lose all unsaved Alerts inputs. CSS-driven visibility keeps all components mounted and all form state intact throughout the session. This matches the GAS behavior where all tab sections are always in the DOM.

**Decision: setState-in-useEffect replaced with outer gate and inner content component pattern (August 6, 2026)**
Raised by: React lint error "Calling setState synchronously within an effect can trigger cascading renders" in LookupEditor.tsx and NotificationPrefs.tsx
Root cause: Both components used useEffect to initialize form state from async data. React flags setState inside an effect body as it causes an extra render cycle on every data load.
Chosen: Split each component into an outer gate (handles loading and null data) and an inner content component (receives data as guaranteed non-null prop, initializes useState with lazy initializer). No useEffect needed.
Why: The lazy useState initializer (() => derived value) runs exactly once at mount. Since the outer gate only mounts the inner component when data is available, the inner component's useState initial values are always correct on first render. This pattern eliminates both the lint warning and the extra render cycle. Applied to LookupEditor and NotificationPrefs.

**Decision: ValidationError added to core/exceptions.py with HTTP 422 (August 6, 2026)**
Raised by: services/settings.py rejecting empty workspace name required a named exception
Chosen: Add ValidationError to core/exceptions.py. Map to 422 Unprocessable Entity in main.py exception map.
Why: 422 is the correct status for input that passes schema validation (SettingsUpdate accepts any string for name) but fails business logic (empty string is not a valid workspace name). Using 400 would conflict with FastAPI's own 400 for malformed request bodies. Adding ValidationError keeps the exception vocabulary consistent with the existing pattern in core/exceptions.py.

**Decision: Frontend settings service API paths must include /api/v1/ prefix (August 6, 2026)**
Raised by: GET /settings returning 404, confirmed via server logs showing request hitting /settings instead of /api/v1/settings
Root cause: services/settings.ts was written with short paths (/settings, /notifications/prefs). The axios base URL is http://localhost:8000 only. Unlike other service files (services/risks.ts, services/incidents.ts) which all use the full path, settings was inconsistently written.
Chosen: All six functions in services/settings.ts corrected to use full /api/v1/ paths.
Rule reinforced: Every service file in this project must include the full /api/v1/ path. The axios baseURL never includes the prefix. This is a project-wide convention established in Phase 4 and must be followed in every new service file.

**Decision: Frameworks and Help pages completed in Phase 8 session (August 6, 2026)**
Raised by: User request at session start
Status: Both pages fully complete. They are static informational pages with no API calls. fw-* CSS classes added to index.css for Frameworks, hlp-* classes for Help. Both class sets translated from GAS hardcoded color variables to index.css CSS variables for dark mode compatibility. These pages close two items from the Phase 13 scope (all page routes registered in App.tsx).

**Decision: All external submissions routed through pending queue, including incidents (August 6, 2026)**
Raised by: GAS reference read. External_Add_Incident.html submits directly to action=createIncident, bypassing the pending review step that exists for risks.
Options: Match GAS behavior (direct write to incidents table), or add a pending queue for both types.
Chosen: All external submissions, risk and incident, go through the external_submissions table with status PENDING. An authenticated analyst must approve before any record is written to the risks or incidents table.
Why: The GAS direct-write behavior was a design gap, not an intentional product decision. Allowing unauthenticated users to write directly to the incident register creates a data quality and security risk. Consistency matters: a team reviewing a risk submission queue would also expect to see incident submissions in the same queue. The pending table already existed for risk submissions. Extending it to incidents adds no schema or migration work, and the approval flow is identical.

**Decision: External submission emails are non-blocking (August 6, 2026)**
Raised by: Email delivery failure would otherwise cause the entire submission request to fail with 500, which is unacceptable for a public-facing form.
Chosen: All three email functions (send_submission_confirmation, send_approval_email, send_return_email) are called inside try/except blocks. Failures are logged as warnings. The submission or review action succeeds regardless of email outcome.
Why: Email delivery is a best-effort notification, not a transactional guarantee. A submitter not receiving a confirmation email is a minor inconvenience. A submitter receiving a 500 error on their submission, or an analyst receiving a 500 when approving, is a product failure. Resend is reliable but external; wrapping all outbound calls in non-blocking try/except is the correct pattern for any external IO in a critical path.

**Decision: Public form pages use plain fetch(), not apiPost() from services/api.ts (August 6, 2026)**
Raised by: ExternalRisk.tsx and ExternalIncident.tsx are served to unauthenticated users who have no JWT.
Options: Use apiPost() from services/api.ts (the shared axios instance), or use plain fetch().
Chosen: Plain fetch() in both public form pages.
Why: The apiPost() function uses an axios instance that has a 401 interceptor which redirects to /login. Even though the backend public endpoints would never return 401, the interceptor is a fragile dependency for a page that exists outside the auth boundary. Plain fetch() is simpler, has no interceptors, and makes the auth-free intent of these pages explicit in the code. The trade-off is slightly more verbose error handling, which is acceptable for two isolated pages.

**Decision: ext-* CSS classes use hardcoded light colors; psub-* classes use CSS variables (August 6, 2026)**
Raised by: Project rule requires all new CSS classes to use CSS variables. External form pages are public-facing and do not have a dark mode setting.
Chosen: ext-* classes (external form pages) use hardcoded light colors. psub-* classes (PendingSubmissionsModal, which is inside the authenticated app) use CSS variables throughout.
Why: Public form pages at /external/risk and /external/incident are accessed by unauthenticated external users. They have no access to the app's data-theme attribute or the user's dark mode preference. Forcing CSS variables on these pages would produce correct colors in light mode (the :root variable values) but would not degrade gracefully if any future page-level styling differed. Hardcoding light colors on public forms is intentional and correct. The psub-* classes live inside the authenticated app where the theme system is active, so they correctly use CSS variables. The distinction is documented here so future contributors do not apply the variable rule universally to all new CSS without checking whether the component is inside or outside the app shell.

**Decision: URL format standardised for external submission forms (August 6, 2026)**
Raised by: Inconsistency discovered between ExternalLinkModal.tsx (/external/risk?workspace_id=) and IncidentExternalLinkModal.tsx (/submit-incident?workspace=). The two modals generated different URL formats using different query param names.
Chosen: Both external form routes use /external/{type}?workspace_id={tenantId}. Risk: /external/risk?workspace_id=. Incident: /external/incident?workspace_id=. IncidentExternalLinkModal.tsx corrected to match.
Why: A consistent URL format across both form types makes the routes predictable, documentation-friendly, and easier to share with administrators. The param name workspace_id matches the naming convention used on the risk form. The previous incident URL (/submit-incident?workspace=) would have silently broken when the route was first used since no such route existed in App.tsx.

**Decision: ItemRow component defined at module scope in PendingSubmissionsModal.tsx (August 6, 2026)**
Raised by: The per-submission item needed its own local state (showReturn, returnMsg, done) and its own mutation hook calls. Inline JSX inside the parent map() would define a new component function on every render.
Chosen: ItemRow is a named function component declared at module scope in the same file, above the PendingSubmissionsModal default export.
Why: Defining a component function inside another component body causes React to treat it as a new component type on every render, resetting all local state (showReturn, returnMsg, done) every time the parent re-renders. Module scope definition avoids this entirely. This also satisfies the Fast Refresh rule: React Fast Refresh requires that files export only components or only non-component values, and that all component functions be declared at module scope.

**Decision: JSONB Column[Any] boolean check rule applied to services/external.py (August 6, 2026)**
Raised by: Pylance errors on three lines in services/external.py after initial output. `dict(r.payload) if r.payload else {}` produced two errors: Column[Any] used in boolean context (Pylance rejects Column.__bool__), and dict() on Column[Any] returns dict[bytes, bytes] | dict[str, Any] which is not assignable to dict[str, Any].
Chosen: Replace `if r.payload` with `if r.payload is not None`. Add `# type: ignore[arg-type]` on each dict() call.
Why: This is the documented project rule for JSONB column reads. The `# type: ignore` is scoped to the single line only. The runtime behavior is unchanged since asyncpg always deserialises JSONB as dict[str, Any]. The rule is now reinforced in the NEXT SESSION STARTS WITH reminders in SMARTRISK_V2_BUILD.md to prevent recurrence in Phase 10 and beyond.

---

### Session: Phase 10 / 11 / 12 — Brief Engine, Audit Log, Scheduler (August 2026)

- Brief daily delta uses snapshots_daily JSONB per-day blob (one row per tenant per day). snapshot_data is a dict of {risk_id: {residual, band, control_eff, mitigation_status}}. This mirrors GAS SR_Daily_Snapshot sheet compressed into one JSONB blob per day. No new table or column needed.
- Brief suppression counts stored as brief_suppression key inside workspace_settings JSONB on the tenant. Same approach as all other brief settings. No separate suppression table.
- brief_last_sent stored as workspace_settings["brief_last_sent"] plain date string (yyyy-MM-dd). Duplicate send guard in job_brief_send compares this against today before sending.
- APScheduler uses AsyncIOScheduler which runs inside the FastAPI asyncio event loop. No thread pool executor needed. FastAPI lifespan asynccontextmanager is the startup/shutdown hook.
- purge_expired(db) in services/recycle.py takes only a session argument and purges all tenants in one pass. Scheduler calls it once per run, not once per tenant.
- Brief send-test endpoint gates on manage_settings (Owner only). Brief preview endpoint gates on manage_risks (all roles). Permission key "risks" does not exist in the JWT — correct keys are prefixed with manage_.
- AuditLog promoted to a dedicated page at /audit with its own sidebar entry. In GAS it was a sub-tab inside the Users view. v2 gives it a separate route for cleaner navigation and independent filtering.
- Phase 14 (Frontend Per Module) is closed without a dedicated session. Every page and component was built progressively across Phases 4 to 11. The checklist is fully satisfied.
- Pylance false positive on Settings() = BaseSettings() suppressed with # type: ignore[call-arg]. pydantic-settings populates required fields from the environment at runtime. This is not a real error.

---

### Session 11: Phase 13 Complete (August 6, 2026)

**Decision: Toast context extracted to src/utils/toastContext.ts (August 6, 2026)**
Raised by: Fast Refresh violation. Toast.tsx exported both ToastProvider (component) and ToastContext (non-component). React Fast Refresh requires files to export only components or only non-components.
Chosen: ToastContext and ToastFn type live in src/utils/toastContext.ts. Toast.tsx exports only ToastProvider. useToast.ts imports directly from utils.
Why: This is the documented project rule. Mixing component and non-component exports in one file breaks Fast Refresh and causes unstable hot reload. The utils directory is the correct location for context objects and type aliases.

**Decision: workspace_presence table uses raw SQL, no ORM model (August 6, 2026)**
Raised by: The presence feature requires two simple queries: an upsert on heartbeat and a filtered select on poll. A full ORM model adds boilerplate for no benefit.
Chosen: Both presence routes use sqlalchemy text() with named parameters. No models/presence.py file created.
Why: The presence table is ephemeral operational data, not domain data. Its rows are not related to any business entity beyond tenant and account IDs already in the JWT. The two queries are simple enough that raw SQL is more readable than ORM. This is consistent with how simple internal queries are handled elsewhere in the project.

**Decision: Presence poll window is 5 minutes (August 6, 2026)**
Raised by: GAS used CacheService (in-memory, GAS-specific) with no explicit expiry documented. v2 needs a concrete value.

---

## Session 12: August 7, 2026 — Settings Wiring, Risk Config, Import, Lookup Integrity

**Decision: Logo upload routed through FastAPI backend, not direct Supabase Storage from browser (August 7, 2026)**
Raised by: RLS policy violation on direct Supabase Storage upload from frontend
Root cause: The frontend Supabase client has no auth session because login goes through FastAPI, not Supabase Auth. The client is anonymous and the bucket INSERT policy requires authenticated.
Chosen: POST /api/v1/settings/logo accepts multipart file, backend uploads to Supabase Storage using SUPABASE_SERVICE_KEY (bypasses RLS), returns public URL
Why: Service role key is never exposed to the frontend. RLS policies on the bucket can remain as designed. The two-step flow (upload then save) is preserved. The previous Phase 8 decision to upload directly from browser was correct in theory but failed in practice because FastAPI-issued JWTs are not Supabase Auth sessions.
Rule: Any future Supabase Storage write from the frontend must go through a backend proxy endpoint using the service role key, not the anon key, unless the user is authenticated via Supabase Auth.

**Decision: Old logo is deleted from Supabase Storage when a new logo is uploaded (August 7, 2026)**
Raised by: Observation that re-uploading a logo left orphan files in the bucket
Chosen: upload_logo service function accepts old_logo_url as optional param. If present, _delete_logo_from_storage is called before the new upload. Delete is best-effort (wrapped in try/except) and never blocks the upload.
Why: The bucket is per-workspace. Orphan files accumulate silently and consume storage quota. Cleaning up on replace costs one extra HTTP call and keeps the bucket to one file per workspace. Best-effort approach is correct because a failed delete should never prevent a successful upload.

**Decision: passlib replaced with direct bcrypt for PIN hashing (August 7, 2026)**
Raised by: ValueError: password cannot be longer than 72 bytes on PIN save
Root cause: passlib 1.7.4 is incompatible with bcrypt 4.0+. The newer bcrypt raises an explicit ValueError instead of silently truncating. Passlib's internal transformation triggers this check even on a 6-digit PIN.
Chosen: Remove passlib CryptContext entirely from core/security.py. Call bcrypt.hashpw and bcrypt.checkpw directly. Hash format is identical ($2b$12$...) so existing stored PINs verify correctly.
Why: passlib 1.7.4 has not been updated since 2020 and has no official bcrypt 4.x compatibility fix. User account passwords go through Supabase Auth, not passlib. The only remaining use of passlib was PIN hashing, which is trivially replaced with two direct bcrypt calls.

**Decision: Risk Config (lookups) is the single source of truth for all risk and incident dropdowns (August 7, 2026)**
Raised by: RiskForm dropdowns were hardcoded constants, disconnected from the lookup system
Chosen: RiskForm, RiskRegister filter bar, and Incidents page all read exclusively from useLookups. Hardcoded CATEGORIES and TREATMENTS constants demoted to fallbacks used only when lookups are loading. Owner dropdown reads lookups.risk_owner, not workspace user accounts. A risk owner is not required to be a system user.
Why: The central source of truth model means an admin configures valid values once in Risk Config. Every form and filter reflects those values instantly. No code changes needed to add or remove a valid category or owner. The GAS version had the same intent but was never fully implemented in the v2 port.

**Decision: useLookups migrated from manual useState/useEffect to TanStack Query (August 7, 2026)**
Raised by: Import auto-add patched lookups in one component instance but other component instances (RiskForm, filter bar) did not update because each had its own isolated fetch state
Root cause: Manual useState/useEffect creates one independent state per component. No shared cache exists. A patch in ImportModal's useLookups instance is invisible to RiskForm's useLookups instance.
Chosen: useLookups now uses useQuery (key: ['lookups'], staleTime: 5 min, placeholderData: _DEFAULTS) and useMutation (onSuccess: queryClient.setQueryData). All instances share one cache entry. Any patch anywhere updates all consumers instantly.
Why: This is identical to the pattern used in useSettings. The fix is entirely in the hook. No call sites changed. placeholderData ensures dropdowns show sensible defaults during first fetch instead of rendering empty.

**Decision: Lookup chip deletion blocks or warns based on active usage in risks and incidents (August 7, 2026)**
Raised by: User request for data integrity on lookup deletion
Rules established:
- risk_owner: hard block if any active (non-deleted) risk has this owner. Cannot delete, no proceed option. User must reassign risks first.
- category and treatment: soft warning shows count of affected risks. User can proceed. Backend cascades affected risk rows to NULL on save.
- incident_category and incident_severity: soft warning shows count of affected incidents. User can proceed. Backend cascades affected incident rows to NULL on save.
- business_unit: no check. Not a direct column on risks or incidents in this schema.
Implementation: GET /api/v1/lookups/usage?field=X&value=Y returns count. Frontend checks on chip click before removing from local state. Block modal has no proceed button. Warn modal has Delete Anyway and Cancel. Cascade fires in patch_lookups service when saved values differ from old values.
Why: Owner accountability is the strongest integrity requirement in risk management. A risk without an owner has no accountable party. Blocking deletion forces proper reassignment. Category and treatment are classification labels where nulling is acceptable. The cascade-on-save approach means the UI always shows what will actually be saved, and the backend enforces the cascade atomically with the lookup update.

**Decision: Import deduplication uses description + category + owner as the uniqueness key (August 7, 2026)**
Raised by: User request to prevent duplicate risks on repeated import
Chosen: Triple-key (description.lower().strip(), category.lower().strip(), owner.lower().strip()). Checked at two levels: (1) intra-file: within the uploaded spreadsheet before sending to backend, (2) DB-level: against existing non-deleted risks for the tenant before inserting each row.
Why: Description alone is too aggressive. The same risk description can legitimately appear under different categories or owners. All three fields must match for a risk to be considered a duplicate. Normalised to lowercase and stripped of whitespace for comparison, but original casing is preserved in the stored record. Duplicates are counted and returned in BulkImportResult.duplicates, displayed separately from quota-skipped rows in the result screen.

**Decision: Unsaved changes banner added to all editable settings tabs (August 7, 2026)**
Raised by: User request after observing that changes could be made and navigated away from without saving
Chosen: UnsavedBanner component (src/components/settings/UnsavedBanner.tsx) renders at the top of any settings tab when isDirty is true. Contains a Save now CTA that calls the same handleSave as the bottom button. isDirty is a plain computed value (no useMemo) comparing form fields against saved settings data. Banner disappears immediately after a successful save.
Tabs covered: WorkspaceSettings (Brand and Appearance + Workspace Identity combined), LookupEditor (Risk Config), RolesTab, AITab, AlertsTab, BriefTab.
Tabs not covered: NotificationPrefs (per-field toggle pattern, no bulk form), BillingTab (read-only).
Why: The amber banner is the universally recognised unsaved-changes pattern (Shopify, Notion, WordPress). Having the Save CTA in the banner means the user never needs to scroll to save. The bottom Save button is kept for users who prefer to review before saving.

**Decision: 422 FastAPI validation errors are parsed and deduplicated before reaching the UI (August 7, 2026)**
Raised by: Import returning 422 with a wall of repeated logged_at date format errors filling the modal
Root cause: The axios interceptor only read error.response.data.error (our envelope format). FastAPI 422 returns detail: [...] not error: "...". Raw axios error propagated, importRisks caught it and returned null silently.
Chosen: Interceptor now detects status 422, reads detail array, deduplicates by field+message, caps at 4 unique errors, appends +N more suffix. importRisks re-throws after catching (with cause: e for ESLint) so ImportModal catch block fires.
Why: Showing 39 identical logged_at errors for 39 rows is useless. One deduplicated line "logged_at: invalid date format (39 rows)" is actionable. The re-throw change is the minimal fix to connect the error to the UI without restructuring the hook or the modal.

**Decision: Likelihood and impact_level dropdowns wired to lookups with numeric conversion (August 7, 2026)**
Raised by: SCALE = [1,2,3,4,5] was hardcoded in RiskForm, disconnected from lookups.likelihood and lookups.impact_level
Chosen: likelihoods and impacts derived from useLookups. FALLBACK_SCALE = ['1','2','3','4','5'] used while loading. Option value cast to Number(n) so controlled select matches v.likelihood and v.impact_score which are typed as number.
Caveat: If an admin changes likelihood values to non-numeric labels (e.g. Low/Medium/High), stored values would be NaN. Supporting non-numeric scales requires changing RiskFormValues.likelihood from number to string and updating the backend schema. Deferred. Default and expected use is numeric 1-5 scale.

**Decision: logged_at in BulkImportRow uses a flexible multi-format parser, returns None on failure (August 7, 2026)**
Raised by: Import failing 422 because spreadsheet date formats (MM/DD/YYYY, Excel serial) are not ISO 8601
Chosen: @field_validator on logged_at tries 9 common date formats then Excel serial number fallback. Returns None silently if nothing matches. Field is optional so None is always valid.
Why: logged_at is metadata, not a required field for risk validity. Blocking an entire import row because of a date format difference is wrong. The validator absorbs any parseable format and gracefully discards what it cannot understand. The nine formats cover every common date representation used by Nigerian, UK, US, and European users.
Chosen: A user is considered active if their last_seen is within the last 5 minutes. Heartbeat fires every 90 seconds. This gives a generous buffer (last_seen could be up to 90s stale before the next heartbeat) while keeping the active window short enough to remove departed users within one poll cycle after they leave.
Why: 5 minutes matches reasonable expectations for a collaborative awareness feature. A user who closes the tab will drop out of the strip within one 60-second poll cycle after their last_seen expires.

**Decision: usePresence accepts tenantId as a parameter (August 6, 2026)**
Raised by: Presence poll was getting 401 in server logs. Root cause: the 60-second poll interval continued to fire after logout() cleared the auth store but before the full page navigation completed. The axios error interceptor caught the 401 and triggered a redundant logout redirect.
Chosen: usePresence(tenantId: string) accepts tenantId as a parameter and adds it as a useEffect dependency. When tenantId becomes empty string (auth store cleared on logout), the cleanup function runs, intervals are cleared, and the new effect early-returns. No presence request fires without a valid tenantId.
Why: The dependency array change is the minimal correct fix. It also correctly handles workspace switching: when tenantId changes, old intervals clear and new ones start for the new workspace's data.

**Decision: Inactivity logout uses client-side timer with silent token refresh (August 6, 2026)**
Raised by: The original design logged users out after 15 minutes regardless of activity (JWT expiry with no refresh). Users complained of being logged out mid-session.
Chosen: useInactivityLogout hook tracks activity via document event listeners (click, keydown, mousemove, touchstart), throttled to 5-second intervals. Token is silently refreshed via POST /api/v1/auth/refresh every 10 minutes of activity. Warning banner appears at T-60s. Logout fires at T+0 (15 minutes of true inactivity).
Why: The existing /api/v1/auth/refresh endpoint and httpOnly refresh token cookie handle the token renewal correctly. No backend changes needed. The 10-minute refresh gap (REFRESH_GAP_MS) is always less than the 15-minute access token lifetime, ensuring active users never hit a 401 mid-session. ACCESS_TOKEN_EXPIRE_MINUTES=15 is intentionally unchanged. The 7-day rolling refresh token ensures users who visit at least once a week never need to log back in.

**Decision: Switch workspace and Add workspace always visible, disabled on TRIAL (August 6, 2026)**
Raised by: On TRIAL plan, workspace buttons were hidden entirely (workspaces.length > 1 gate). Users on trial could not see the upgrade affordance.
Chosen: Both buttons always render. Both are disabled with pointer-events blocked and opacity reduced (via existing .btn:disabled rule) when claims.plan === 'TRIAL'. title attribute shows upgrade explanation on hover.
Why: Visible-but-disabled is the correct pattern for features that require an upgrade. Hidden features do not communicate that the capability exists. The backend already enforces workspace creation limits, so the frontend disable is a UX hint, not a security gate.

**Decision: Get Started drawer uses localStorage state keyed by tenantId (August 6, 2026)**
Raised by: GAS keyed Get Started state by SHEET_ID. v2 equivalent is the tenantId (active_tenant_id from JWT claims).
Chosen: Three localStorage keys per workspace: gs_steps_{tenantId} (step completion state), gs_seen_{tenantId} (first visit seen flag), gs_never_{tenantId} (never-show-again flag). State reads happen in the useState lazy initializer (not a useEffect) to avoid the synchronous setState lint error. The GetStartedDrawer component receives key={tenantId} in Topbar so it fully remounts on workspace switch, re-running the lazy initializer with the new tenant's data.
Why: Per-tenant keying is correct for a multi-workspace product. A user who completes onboarding in workspace A should still see the onboarding flow for a new workspace B. The lazy initializer pattern satisfies the React rules around synchronous setState and avoids a redundant useEffect.

Note for Phase 13: Frameworks (/frameworks) and Help (/help) routes are now complete. Remaining Phase 13 items are 404 page, toast notification system, global loading state, and theme toggle.

---

### Session 12: Phase 15 Responsive Pass (August 7, 2026)

**Decision: Mobile sidebar content requires app.mob-open override for 980px global rule (August 7, 2026)**
Raised by: Screenshot showing mobile sidebar open with icons only, no labels or workspace name.
Root cause: @media (max-width: 980px) hides .brand-info, .nav-label, .sidebar-foot globally. The 640px rules only restored them for app.sidebar-collapsed, not for app.mob-open. So when the hamburger opens the sidebar, the content stays hidden.
Chosen: Add app.mob-open overrides for all hidden elements inside the 640px block. Restores brand-info, nav-label, sidebar-foot, pill, brand layout, brand-mark dimensions, and nav-item layout.
Why: The 980px rule collapses the sidebar to icon-only for tablet by hiding text. On mobile, the sidebar becomes a full-width overlay and must show all content regardless of whether sidebar-collapsed is also on the app element. The mob-open class signals this intent.

**Decision: Workspace switcher consolidated from two buttons to one dropdown (August 7, 2026)**
Raised by: User request to consolidate Switch workspace and Add workspace into a single dropdown.
Chosen: Single "Workspace" static label button with chevron opens a dropdown containing both actions. wsOpen state and wsRef added. Existing click-outside useEffect extended to cover both menus with one listener. topbar-dd-wrap class replaces both position:relative inline style wrappers in the topbar.
Why: Two separate buttons in the topbar consumed significant horizontal space. A dropdown is the standard pattern for grouped actions. The static label "Workspace" was chosen over the dynamic workspace name since the name is already shown in the crumbs below the page title.

**Decision: dl-modal padding moved to dl-modal-pad inner wrapper (August 7, 2026)**
Raised by: dl-modal.md and dl-modal.xs stripped all padding on mobile via the bottom-sheet override, leaving content flush against modal edges.
Chosen: Remove padding from dl-modal.md and dl-modal.xs CSS definitions. Add dl-modal-pad class with padding: 16px 20px 20px. Content sections go inside dl-modal-pad inside dl-modal-bd. The modal container never has padding.
Why: When padding is on the container, the mobile override (padding: 0) removes it. When padding is on an inner wrapper child, the mobile override never touches it. Content remains padded at all screen sizes. This is the same pattern as modal-bd vs modal-backdrop in the existing modal system.

**Decision: RiskSection insight popups converted to bottom sheets via dl-modal pattern (August 7, 2026)**
Raised by: Screenshot showing PressureModal as a centered floating box on mobile, not a bottom sheet. Also all inline styles with no dark mode support.
Chosen: PressureModal, DistributionModal, IncidentUpsellModal all converted to dl-modal-back z-top with dl-modal.md or dl-modal.xs. Sticky header via dl-modal-hd. Scrollable body via dl-modal-bd. Content padding via dl-modal-pad. All section labels use dl-section-lbl navy. All panels use dl-panel and dl-panel-row.
Why: The setup document requires full-screen or bottom-sheet modals on mobile. The dl-modal classes handle the responsive conversion automatically. Section labels use var(--navy) via the CSS class instead of hardcoded #1F2854, fixing dark mode.

**Decision: rs-ghost-btn replaces JS onMouseEnter/onMouseLeave for hover color (August 7, 2026)**
Raised by: View insights and View all buttons used JS event handlers to swap color on hover. On touch devices these events fire incorrectly or not at all.
Chosen: rs-ghost-btn class with CSS :hover rule (color: var(--navy)) replaces both buttons. JS handlers removed entirely.
Why: CSS :hover is the correct mechanism for hover state. JS handlers for visual state changes are a known touch device anti-pattern and a rules violation (dynamic visual changes via CSS class toggle, not style properties on elements).

**Decision: filter-bar wraps at 900px not 640px (August 7, 2026)**
Raised by: At 768px with sidebar collapsed to 84px, content area is approximately 684px. Five filter fields at min-width:140px each require 700px minimum plus gaps, causing horizontal overflow with flex-wrap:nowrap.
Chosen: Add @media (max-width: 900px) { .filter-bar { flex-wrap: wrap; } .filter-field { flex: 1 1 calc(50% - 6px); } }.
Why: The existing 640px override was too late. At 768px (tablet), the filter bar already overflows. 900px catches the range where sidebar is 84px and content is ~816px, giving the filter bar enough room to wrap cleanly to two columns before becoming single-column at 640px.

**Decision: rb-grid canvas column reordered first on tablet and mobile via CSS order (August 7, 2026)**
Raised by: rb-grid collapses to single column at 1024px in DOM order: Block Library, Canvas, Settings. Users must scroll past the entire library to reach the canvas on tablet and mobile.
Chosen: CSS order property at max-width:1024px. rb-left: order:2, rb-canvas-wrap: order:1, rb-settings: order:3.

---

### Session: Risk Matrix Config, Scoring Bands, Filter-Responsive Stats (August 10, 2026)

**Decision: workspace_matrix_config as a dedicated table, not JSONB on tenants (August 10, 2026)**
Raised by: Where to store per-workspace matrix config (band thresholds, scale, labels).
Chosen: Dedicated table workspace_matrix_config with one row per tenant, unique constraint on tenant_id. Seeded with GAS-correct defaults on workspace creation and for all existing tenants via migration.
Why: The scoring engine reads this on every risk write. A clean indexed table with typed columns is faster to query, easier to validate in Pydantic, and simpler to extend than a JSONB blob on the tenants row. Follows the existing pattern of separate service tables.

**Decision: GAS scoring thresholds (5/10/17) replace the incorrect backend constants (6/12/20) (August 10, 2026)**
Raised by: Discrepancy found between services/risk.py (_LEVEL_MEDIUM=6, _LEVEL_HIGH=12, _LEVEL_CRITICAL=20) and GAS View_Frameworks.html (Low 1-4, Medium 5-9, High 10-16, Critical 17-25).
Chosen: GAS thresholds are the source of truth. _LEVEL_* constants removed. _score() now reads from MatrixConfig. Fallback (when config unavailable) uses GAS values: medium_min=5, high_min=10, critical_min=17.
Why: GAS is the production system clients are already familiar with. The backend constants were wrong from the start. Correcting them as part of this migration is the right time since all risks are being re-scored anyway.

**Decision: level_index (int 1-5) stored on risk as positional signal for badge colors (August 10, 2026)**
Raised by: Custom band labels (e.g. "Severe" instead of "Critical") break all string-based badge color mappings across RiskTable, RiskDetailModal, report service, and dashboard service.
Chosen: level_index (1=lowest, up to band_count=highest) stored on risk at scoring time. All badge color rendering uses levelIndexClass(level_index) instead of matching the level string. The level field stores the display label. is_elevated boolean also stored at scoring time.
Why: String matching is fragile for a configurable system. Positional index is label-agnostic and remains correct regardless of what users name their bands. This is the same pattern already established for level_index in Phase 16 scope.

**Decision: is_elevated boolean stored on risk, formula max(band_count-1, 2) (August 10, 2026)**
Raised by: Dashboard KPI and report service need to identify "elevated" risks without knowing each tenant's band count at query time.
Chosen: is_elevated pre-computed at scoring time and stored on the risk row. Formula: elevated_threshold = max(band_count - 1, 2). For 5-band: index >= 4 (Critical + Extreme). For 4-band: index >= 3 (High + Critical). For 3-band: index >= 2 (top 2). For 2-band: index >= 2 (top band only).
Why: Avoids a join to workspace_matrix_config on every dashboard and report query. The formula is the cleanest general rule: always the top 2 bands are elevated, except for 2-band where only the single top band qualifies.

**Decision: likelihood and impact_level removed from LookupEditor (August 10, 2026)**
Raised by: LookupEditor allowed users to edit likelihood and impact_level arrays, which conflicted with the matrix config owning the scale.
Chosen: Both fields removed from LOOKUP_KEYS, LOOKUP_LABELS, schemas/lookup.py, services/lookup.py. DB columns preserved (no drop migration). RiskForm now generates scale options from matrix config (1..n) instead of lookup arrays.
Why: Two sources of truth for the same data is an error surface. Matrix config is the correct owner. DB columns are left in place to avoid a potentially risky migration with no user-facing benefit.

**Decision: re-score all workspace risks synchronously on matrix config save (August 10, 2026)**
Raised by: When band thresholds or labels change, existing risks carry stale level values.
Chosen: Single bulk SQL UPDATE in update_config sets level, level_index, and is_elevated for all active risks in one statement. No Python loop. Block save if any risk has likelihood or impact_score above the new scale dimensions.
Why: At the 1000-risk workspace cap, a single SQL UPDATE completes in milliseconds. Synchronous re-score keeps the register consistent immediately. The hard block on out-of-range scores prevents silent data corruption when the scale shrinks.

**Decision: band count ceiling extended to 5, default remains 4 (August 10, 2026)**
Raised by: Client requirement for 5 severity bands. Existing ceiling was 4.
Chosen: band_count accepts 2-5. Band 5 named Extreme, color deep purple #6b21a8. Added via migration 020 (band_extreme_min, band_extreme_max, band_5_label). All scoring, validation, bulk SQL, and frontend updated to handle index 5.
Why: The additive nature of the implementation (one more entry in band_defs, BANDS, BAND_MINS, BAND_MAXS, levelIndexClass, levelBadgeClass) made the extension low risk. 5 bands covers every known GRC framework in use by current clients.

**Decision: stat cards pass active register filters to /api/v1/risks/stats (August 10, 2026)**
Raised by: Stat cards fetched from the unfiltered register regardless of active filter state. Filtering by "Financial" showed global totals, not Financial-only totals.
Chosen: get_stats() backend accepts category, level, treatment, owner, search as optional query params and applies the same WHERE chain as list_risks. Stats useEffect in RiskRegister passes active filter state and re-runs on every filter change. cancelled guard prevents stale setState on rapid filter changes.
Why: Stat cards are contextual KPIs. When a filter is active, the user expects the cards to reflect that context. The backend already had the filter logic in list_risks; wiring it to stats was additive only.

**Decision: risk level filter in register reads band labels from matrix config (August 10, 2026)**
Raised by: Level filter dropdown had hardcoded options: Critical, High, Medium, Low. Custom labels and variable band count make these immediately wrong.
Chosen: useMatrix hook imported in RiskRegister. Level filter options generated from band_count (highest index first) using band_{n}_label fields. Fallback to four default labels while matrix config is loading.
Why: The filter value is compared against risk.level in the backend, and risk.level now stores the custom display label. The filter options must match those stored values exactly.

**Decision: workspace-driven, token-baked permission enforcement with perm_version invalidation (August 11, 2026)**
Raised by: RolesTab in Settings saved perm_* fields to workspace_settings JSONB but _ROLE_DEFAULTS in services/auth.py was hardcoded. Permission matrix changes had zero enforcement effect.
Chosen: _ROLE_DEFAULTS removed. _role_permissions() reads perm_* fields from tenant.workspace_settings at token build time. _PERM_DEFAULTS provides fallback for fresh workspaces. perm_version INTEGER column added to tenants table. update_settings increments perm_version whenever any perm_* key is saved. perm_version is baked into the JWT. Per-member permissions JSONB still overrides role defaults.
Why: Per-request DB enforcement on every protected route adds a DB read at every API call and does not scale. Token-baked permissions are stateless, work at the edge, and are horizontally scalable. The 15-minute token expiry plus 10-minute silent refresh cycle means permission changes propagate within one refresh cycle without forced logout. perm_version is the future invalidation primitive for SSO and enterprise RBAC.

**Decision: member deactivation writes DEACTIVATED not INACTIVE (August 11, 2026)**
Raised by: services/user.py wrote member.status = "INACTIVE". GAS contract, frontend filter value, and StatusBadge all use "DEACTIVATED". Status filter was dead for all deactivated members.
Chosen: Changed to "DEACTIVATED" in deactivate_member. Single character change, no migration needed as no existing rows carry "INACTIVE" in production.
Why: The GAS is the authoritative contract for status string values. The frontend filter and badge already used "DEACTIVATED". The backend was the outlier.

**Decision: invite email is fire-and-forget, never blocks the add_member transaction (August 11, 2026)**
Raised by: Email delivery failures (Resend API key misconfigured, rate limit, invalid address) should not roll back a successful member addition.
Chosen: send_invite_email called after db.flush() inside try/except in add_member. Exception caught and logged as warning. Member record is committed regardless of email outcome.
Why: The DB write is the authoritative action. Email is a notification. These must never be coupled. The invited member still exists and can log in even if the email fails. The warning log surfaces delivery issues without surfacing them to the API caller.

**Decision: AI settings wired via get_ai_config() fetched at call time, not injected at app startup (August 11, 2026)**
Raised by: All five AI settings (ai_enabled, ai_model, ai_confidence, ai_auto_run, ai_policy) were persisted to workspace_settings JSONB and returned by the settings API but ignored by every AI service. Services used module-level constants for model and system prompt.
Chosen: get_ai_config(db, tenant_id) added to services/settings.py. Returns AIConfig TypedDict with enabled, model, confidence, policy, auto_run. Each AI service fetches this at the top of every AI function call. All module-level _MODEL constants removed from ai_risk, ai_incident, and ai_report services.
Why: Per-call fetch ensures settings changes take effect on the next request without any restart or cache invalidation. The fetch is a single indexed SELECT on the tenant row, already warm in the Postgres buffer cache for active workspaces. The alternative (injecting settings at startup or middleware) would require cache invalidation logic and couples AI config to the request pipeline.

**Decision: ai_policy injected into system prompt between persona and formatting rules, not user prompt (August 11, 2026)**
Raised by: Policy text must govern AI behaviour without overriding structured output formatting rules.
Chosen: For risk and incident AI, policy appended to system prompt after the base system instruction. For report AI, policy injected between the per-block persona system prompt and _FORMATTING_RULES. User prompts are unchanged.
Why: System prompt is the correct layer for governance instructions. Formatting rules are placed last so they take final precedence over any policy instruction that conflicts (e.g. a policy saying "use bullet points" cannot override the plain text formatting rule). Policy excluded from suggest_category and suggest_severity calls because those must return an exact value from a fixed list.

**Decision: ai_policy_config stored as four flat JSONB keys alongside assembled ai_policy string (August 11, 2026)**
Raised by: Structured policy builder UI requires state restoration on page reload. Storing only the assembled string makes it impossible to reconstruct which chips were selected.
Chosen: Four additional keys in workspace_settings JSONB: ai_policy_industry, ai_policy_tone, ai_policy_sensitivity (comma-joined flag keys), ai_policy_extra. On save, frontend assembles ai_policy string from these and sends all five fields in one PATCH. AI services read only ai_policy. Policy config keys are UI metadata only.
Why: No schema migration needed (JSONB absorbs new keys). AI services remain decoupled from UI structure. Flat keys follow the existing pattern for all other settings fields. Single PATCH avoids two round trips.

**Decision: confidence value standardised to assertive throughout, aggressive retired (August 11, 2026)**
Raised by: Settings UI stored assertive. AIInsightRequest schema validated against aggressive. CONF_HINTS in AIModal used aggressive. Mismatch meant the confidence fallback from workspace settings would fail Pydantic validation on every auto-run call.
Chosen: Standardised to assertive everywhere: schema validator, _CONFIDENCE_LINES dict key, AIModal option value and CONF_HINTS key, frontend TypeScript confidence union type.
Why: Assertive is the correct term for a GRC product. Aggressive carried an inappropriate connotation. The settings UI was already correct; the backend and modal were the outliers.

**Decision: auto-run AI on new risk uses FastAPI BackgroundTasks with its own session (August 11, 2026)**
Raised by: ai_auto_run setting had no enforcement. The create_risk route session closes when the HTTP response is sent, so inline AI execution would either delay the response or run against a closed session.
Chosen: BackgroundTasks added to create_risk route. _auto_run_ai background function opens its own AsyncSessionLocal session, fetches ai_cfg, returns immediately if disabled or auto_run off, calls generate_insights for the single new risk, commits its own session. Failures logged silently and never surface to the caller.
Why: Background tasks run after the response is sent, so the create_risk response is always instant regardless of AI latency. The function owns its session lifecycle cleanly. Haiku model keeps single-risk generation under two seconds in typical conditions.

**Decision: band_extreme_min and band_extreme_max added to MatrixConfigResponse (August 11, 2026)**
Raised by: Band 5 (Extreme) range inputs always showed empty on settings load. Band 1-4 ranges restored correctly.
Root cause: MatrixConfigResponse was missing band_extreme_min and band_extreme_max. The ORM model had both columns. MatrixConfigUpdate had both fields. The API omitted them from the response. Frontend spread ({ ...query.data }) landed undefined on these two form fields, overwriting the MATRIX_DEFAULTS values.
Chosen: Both fields added to MatrixConfigResponse. Two lines. No migration, no service change.
Why: The model already persisted the values correctly. The schema was the sole gap.

**Decision: module gating deferred, flagged as first item in Phase 16 checklist (August 11, 2026)**
Raised by: Full gap analysis completed this session. The setup document defines module gating rules (Section 12) but nothing enforces them in v2. All routes accessible regardless of modules. Sidebar shows all nav items. Report builder shows all 20 blocks. Dashboard renders all sections. LookupEditor shows all taxonomy keys.
Gap surfaces identified: backend missing require_module dependency; Sidebar nav ungated; App.tsx routes ungated; report block selector shows incident blocks to risk-only workspaces; dashboard incident section visible to risk-only; LookupEditor shows incident taxonomy keys to risk-only; AI auto-run field visible to incident-only.
Chosen: Not built this session. Flagged as first item in Phase 16 checklist with full surface list documented.
Why: Module gating is many shallow, well-contained changes once the backend dependency and frontend useModules utility are in place. The active workstream (AI settings wiring, bug fixes) was higher priority. Documenting the full surface now ensures no gaps are missed when the work begins.

Why: DOM order stays unchanged for accessibility and tab order. CSS order only affects visual rendering. Canvas-first is the correct priority on narrow screens since it is the primary build surface.

---

### Session: Audit Log, Settings Restructure, Invite Flow, Remove Member (August 12, 2026)

**Decision: require_permission("risks") is not a valid permission key (August 12, 2026)**
Raised by: Audit log returning 403 for all roles after the 403 fix was applied.
Root cause: `routes/audit.py` used `require_permission("risks")`. Valid token keys are manage_risks, manage_incidents, generate_ai, print_reports, manage_users, manage_settings, review_resolve. "risks" matches nothing, so the permission check always fails.
Chosen: Changed to `require_permission("manage_risks")` on both the list route and the CSV export route. manage_risks is True for Owner and Manager by default, False for Analyst, which matches the intended access level.
Why: One-character-group fix, no schema change.

---

### Session 17: August 17, 2026 — Hardening, Performance, Reliability

**Decision: 401 interceptor retries token refresh before logout (August 17, 2026)**
Raised by: Users randomly kicked to login screen mid-session when access token expired.
Root cause: services_api.ts 401 handler immediately called logout() and redirected. No refresh attempt. Any background fetch (TanStack Query refetch, presence heartbeat, dashboard interval) firing on an expired token caused immediate logout.
Chosen: _attemptRefresh() tries POST /api/v1/auth/refresh first. Shared _refreshPromise prevents concurrent refresh races when multiple requests fail simultaneously. Original request retried with new token on success. Logout only fires if refresh itself returns 401 or fails.
Why: Refresh cookie lives 7 days. Access token is 15 minutes. The gap is intentional but the interceptor was never built to bridge it. This is the standard pattern for short-lived access tokens with long-lived refresh cookies.

**Decision: dashboard queries parallelised with asyncio.gather and isolated sessions (August 17, 2026)**
Raised by: Dashboard fired 13 sequential DB round trips. At 15-30ms per hop to Supabase, total latency was 195-390ms before response.
Chosen: _run() helper creates a fresh AsyncSessionLocal session per sub-function. asyncio.gather runs all 13 concurrently. pool_size raised from 5 (default) to 10, max_overflow=5 to support concurrent connections.
Why: asyncpg does not allow concurrent queries on the same connection. Separate sessions are the only way to achieve true parallelism. Each sub-function is fully independent (no result dependencies between them). _build_attention runs after gather since it needs kpis and incident_health.

**Decision: APScheduler Postgres job store reverted (August 17, 2026)**
Raised by: Phase 16 checklist item: Postgres job store for scheduler resilience.
Attempted: SQLAlchemyJobStore from apscheduler.jobstores.sqlalchemy with psycopg2-binary.
Failure: SQLAlchemy 2.0 raises MissingGreenlet when SQLAlchemyJobStore calls metadata.create_all() synchronously inside FastAPI's async lifespan context.
Chosen: MemoryJobStore retained. APScheduler 4.x has native async support and would solve this cleanly but is a breaking API change from 3.x.
Why: The workaround (run_sync in thread executor) adds complexity that exceeds the benefit for five cron-style jobs with fixed schedules. If the server restarts, jobs resume at their next scheduled time with no data loss. Flag APScheduler 4.x upgrade for a dedicated future session.

**Decision: useRisks and useIncidents migrated from raw useState to TanStack Query (August 17, 2026)**
Raised by: Both hooks used imperative fetch() calls with no caching. Every page visit and every filter change fired a fresh network request. No deduplication, no background updates, no cache.
Chosen: useQuery with parameterised queryKey drives list fetching. keepPreviousData keeps previous page visible during pagination. useMutation per operation with onSuccess invalidation. Adapter functions (create, update, remove) preserve existing call signatures so modal code required only surgical changes. dataUpdatedAt exposed from useRisks to drive the stats useEffect dependency.
Why: TanStack Query ownership means the same filter combination is instant on revisit. Mutations automatically trigger background refetch of only the current query. The refreshKey integer pattern is eliminated entirely. keepPreviousData makes pagination feel instant.

**Decision: IncidentDetailDrawer onDeleted prop changed to () => void (August 17, 2026)**
Raised by: Incidents.handleDeleted was calling remove(id) after the drawer already called incidentsApi.deleteIncident() directly, causing a double DELETE against an already-deleted record.
Chosen: onDeleted prop type changed from (id: string) => void to () => void. handleDeleted uses qc.invalidateQueries instead of remove(). Drawer call site updated to onDeleted() with no argument.
Why: The drawer owns the delete API call. The parent only needs to know it happened so it can invalidate the cache. Passing the ID implies the parent should act on it, which caused the double-delete bug.

**Decision: ServerError added to exception system (August 17, 2026)**
Raised by: routes_reports.py contained 15 raise HTTPException() calls returning {"detail": "..."} instead of the {"data": null, "error": "...", "meta": {}} envelope. Frontend interceptor could not read these.
Chosen: ServerError class added to core_exceptions.py. Registered in _EXCEPTION_MAP at status 500. All 15 HTTPException raises replaced with ServerError, ValidationError, or ResourceNotFoundError. HTTPException removed from routes_reports.py and routes_external.py imports entirely.
Why: Every route in the system now speaks the same language. The frontend reads error.response?.data?.error everywhere consistently without format-specific fallbacks.

**Decision: control effectiveness scale corrected to 1-5 (August 17, 2026)**
Raised by: RiskForm showed 10%/20%/.../100% dropdown. GAS production system uses 1-5 numeric scale stored in the Lookups sheet. DashboardService.gs confirms numeric values with .map(x => Number(x)).filter(x => !isNaN(x) && x > 0).
Chosen: CTRL_EFF constant in RiskForm changed to 1/2/3/4/5 with None (0) option. schemas_risk.py validation changed from le=100 to le=5 on RiskCreate, RiskUpdate, and the third carrying schema. No migration needed (Integer column, no DB constraint).
Why: V2 must match GAS data. GAS stores 1-5. The percentage scale was invented during initial V2 build without reading the GAS source.

**Decision: lazy loading for 8 frontend pages (August 17, 2026)**
Raised by: All pages loaded in one JS bundle. ReportBuilder (recharts, PDF logic, block canvas) and Settings (matrix editor, lookup editor, color picker) significantly inflate initial bundle size.
Chosen: ReportBuilder, Settings, Frameworks, Help, AuditLog, Users, ExternalRisk, ExternalIncident converted to React.lazy(). Dashboard, RiskRegister, Incidents remain eager (most-visited pages). Auth pages remain eager (small, entry point). Suspense boundary inside PageShell so sidebar and topbar stay visible during chunk load.
Why: Vite automatically code-splits on dynamic import(). First meaningful paint for Dashboard-landing users no longer pays the cost of ReportBuilder and Settings. Estimated 30-50% initial bundle reduction. The valid key set is defined in services/auth.py _PERM_MAP and must be the sole reference for all future permission gate strings.

**Decision: paginated API responses must use direct api.get, not apiGet (August 12, 2026)**
Raised by: Audit log table always showed 0 entries despite data existing in the database.
Root cause: `apiGet<T>` returns `res.data.data` — the inner data field only. For paginated endpoints the envelope is `{ data: [...], error: null, meta: { total, page, page_size } }`. Calling `apiGet<AuditListResponse>` returns only the array, discarding meta. The hook typed the result as `AuditListResponse = { data: AuditEntry[], meta: {...} }` so `data.data` resolved to undefined at runtime.
Chosen: Replace `apiGet` with `api.get<PaginatedResponse<T>>` and manually read both `res.data.data` and `res.data.meta`. This is the same pattern already used in `services/risks.ts listRisks`.
Why: `apiGet` is correct for simple non-paginated responses. Paginated responses need the full envelope. `PaginatedResponse<T>` already exists in `types/api.ts`. Rule: any hook that needs both items and total/page data must use `api.get` directly.

**Decision: CSV export uses authenticated blob download, not window.open (August 12, 2026)**
Raised by: Export CSV button produced no file. In dev it hit the Vite dev server without the auth header. In production it navigated to the frontend domain entirely.
Root cause: `window.open(relativeUrl)` is a browser navigation. It cannot send the `Authorization: Bearer` header that `require_permission` checks.
Chosen: `api.get(url, { responseType: "blob" })` then `URL.createObjectURL` and a programmatic anchor click. The axios interceptor attaches the token header. This is safe in a first-party document context (not a GAS iframe).
Why: Authenticated file downloads require the token. The axios instance already has the interceptor. Blob download is the standard pattern for this case throughout the project.

**Decision: Alerts tab removed from Settings, My Notifications merged into Risk Brief (August 12, 2026)**
Raised by: Product decision to consolidate Settings from 9 tabs to 7. Alerts tab removed entirely. My Notifications tab content (brief_frequency, opted_out) moved into Risk Brief tab.
Chosen: AlertsTab function deleted. alerts and notif entries removed from TABS array and their panel divs removed. NotificationPrefs component rendered inside BriefTab as a final section after Send Test Brief. NotificationPrefs title updated to "My Brief Preferences". Alert fields (thresholds, recipients, digest) remain in backend schema and database but are no longer exposed in the UI.
Why: Alerts and notification routing are not yet connected to live email dispatch logic. Removing them reduces UI surface that cannot yet deliver value. The Risk Brief tab is the correct logical home for per-user brief frequency preferences since they are brief-specific controls.

**Decision: Send Test Brief bypasses brief_enabled guard via force_enabled parameter (August 12, 2026)**
Raised by: Clicking Send Test Brief when Brief Status is Off returned "Brief not enabled" error instead of sending the test.
Root cause: `build_brief_payload` returns `ok=False, skip=True` when `brief_enabled != "on"`. The send-test route checked `payload.ok` and returned the error to the frontend. The GAS reference explicitly forced `briefEnabled: 'on'` for test sends.
Chosen: `force_enabled: bool = False` added to `build_brief_payload`. Guard changed to `if not force_enabled and ...`. The send-test route passes `force_enabled=True`. All other callers (scheduler) pass the default False.
Why: Test sends are explicitly intended to work regardless of whether the workspace has enabled the live brief schedule. Isolating the bypass to a single parameter keeps the scheduler behaviour unchanged.

**Decision: audit gaps for PERMANENT_DELETE, APPROVE, RETURN closed immediately (August 12, 2026)**
Raised by: Three categories of actions produced no audit trail despite GAS logging all of them.
Chosen: `permanent_delete` in services/recycle.py gains a `deleted_by` parameter and writes a PERMANENT_DELETE entry. `approve_submission` and `return_submission` in services/external.py each write their respective action after the status flush, inside the transaction, before the non-blocking email block. COMM action has no V2 function yet, nothing to log.
Why: The audit log is a compliance feature. Gaps in coverage for destructive actions (permanent delete, submission decisions) undermine its purpose. All three fixes were targeted inserts with no schema change. The rule going forward: every destructive or governance action that modifies data permanently must write an audit entry.

**Decision: B2B invite uses custom JWT token via Resend, no Supabase invite email (August 12, 2026)**
Raised by: The existing invite flow sent an informational email linking to the GAS v1 app. Invited users could not log in because no Supabase auth record was created.
Chosen: Custom JWT invite token (type=invite, 48h expiry, signed with JWT_SECRET) generated in add_member. Token embedded in invite link sent via Resend: `{FRONTEND_URL}/accept-invite?token={token}`. Frontend AcceptInvite page validates the token, shows password setup for new users or sign-in redirect for existing users. accept_invite backend creates Supabase user via `admin.create_user` with `email_confirm=True`, stores supabase_uid, signs in, returns a workspace token directly. No Supabase invite email fired at any point.
Why: Resend-only keeps the email fully branded and under our control. Supabase invite emails use Supabase's template system and would duplicate the Resend email. The custom JWT approach follows the same pattern as the existing reset-password flow and requires no additional infrastructure. `email_confirm=True` skips email verification because the user proved ownership by clicking the invite link.

**Decision: supabase_uid column added to accounts to distinguish registered users from invite placeholders (August 12, 2026)**
Raised by: `add_member` creates a placeholder Account row with no Supabase auth record. Normal registration also creates an Account row but with a Supabase auth record. Without a distinguishing field, `validate_invite` cannot tell which case it is.
Chosen: `supabase_uid TEXT UNIQUE NULLABLE` added to accounts via migration 026. Set during normal `register()` from `result.user.id`. Set during `accept_invite` after `admin.create_user`. NULL means the account is a placeholder with no Supabase credentials yet.
Why: The alternative (querying Supabase's user list by email) requires a paginated admin API call that is expensive and not guaranteed to be consistent. A local nullable column is a single indexed read. NULL/NOT NULL is an unambiguous signal. UNIQUE constraint prevents duplicate Supabase UID assignments.

**Decision: password chosen over magic link for invited users (August 12, 2026)**
Raised by: Architecture decision required before building the accept-invite flow.
Chosen: Password. Invited users set a password on first access via the AcceptInvite page.
Why: GRC users open the app daily for the risk brief, incident reviews, and governance actions. Magic links expire and require a new link on every session once expired. For a consumer app this is a minor friction. For a B2B compliance tool where analysts log in at 7am to review overnight briefs, a failed magic link blocks a governance workflow. Password authentication is the correct choice for a tool with daily recurring professional use.

**Decision: re-invite after removal correctly handled by existing flow without code changes (August 12, 2026)**
Raised by: Question of whether removing then re-adding a member sends a fresh invite and works cleanly.
Analysis: `remove_member` deletes the WorkspaceMember row. `add_member` on re-invite finds the existing Account, creates a new WorkspaceMember, generates a fresh 48h invite token, sends a new Resend email. If the user had not previously accepted (no supabase_uid): `accept_invite` creates a Supabase user normally. If the user had previously accepted (supabase_uid set): `validate_invite` detects `is_existing_user=True` and the page redirects them to sign in with their existing password, where the new workspace appears in their picker.
Chosen: No code change. Flow handles both cases correctly as built.
Why: The Account row persists after WorkspaceMember deletion. supabase_uid presence is the authoritative flag for credential state. The invite token is stateless and time-bounded, so re-generating one is trivially safe.

**Decision: remove member is distinct from deactivate, permanently deletes WorkspaceMember row (August 12, 2026)**
Raised by: Request to add a Remove button to the Edit User modal alongside Deactivate/Reactivate.
Chosen: New `remove_member` service function deletes the WorkspaceMember row. New `DELETE /{member_id}/remove` route added, distinct from `DELETE /{member_id}` which deactivates. token_version bumped on removal to cut the active session within 15 minutes. REMOVE_USER audit entry written. Cannot remove yourself or the last Owner. Frontend: `useRemoveUser` hook added, separate `confirmRemove` state in EditModal to prevent interference with deactivate confirm state, two-step confirm pattern matches deactivate.
Why: Deactivate is reversible (Reactivate undoes it). Remove is permanent and appropriate when a person leaves the organisation entirely.

---

### Session: August 14, 2026

**Decision: trial expiry comparison uses datetime boundary, not ISO string comparison (August 14, 2026)**
Raised by: All protected routes returning 403 after workspace select in dev environment.
Root cause: core_dependencies.py compared `datetime.now(timezone.utc).isoformat()` (e.g. "2026-08-14T10:30:00.123456+00:00") against `date.isoformat()` (e.g. "2026-08-14") as plain strings. Since the left string is longer and shares the prefix, it is always greater from midnight UTC on the expiry day. Trials lost their final full day.
Chosen: Parse trial_expires_at with date.fromisoformat(trial_expires_at[:10]), construct midnight UTC of that date, add timedelta(days=1) to get the end-of-day boundary. Compare datetime.now(timezone.utc) >= boundary.
Why: Proper datetime objects are the correct tool for datetime comparison. The slice [:10] future-proofs against token variants that may carry a full datetime string rather than a date-only string.

**Decision: single /expired page with plan-aware copy, not two separate pages (August 14, 2026)**
Raised by: Need to handle both TrialExpiredError and PlanExpiredError with appropriate UI.
Chosen: One /expired route, one PlanExpired.tsx component. Reads plan from JWT claims (plan === "TRIAL" vs plan === "EXPIRED") to switch headline and body copy. CTA and sign-out are identical in both cases.
Why: The gate behaviour is identical. Two pages means two interceptor targets, two route registrations, and two components that are 90% the same. Single page is simpler to maintain. Copy branching is two ternary expressions.

**Decision: 403 interceptor matches exact error strings, non-expiry 403s fall through (August 14, 2026)**
Raised by: Need to distinguish expiry 403s (redirect to /expired) from permission 403s (surface as normal error).
Chosen: Interceptor checks error.response.data.error against the exact strings "Your trial has expired." and "This workspace has expired. Please renew to continue." before the generic backendMessage handler. If neither matches, falls through. Window.location guard prevents redirect loop.
Why: String matching on known error messages is precise and doesn't require a backend code field addition. The two expiry messages are stable constants defined in exception classes. Permission denied messages are different strings and fall through correctly.

**Decision: trial warning banner at 7 days (amber) and 2 days (red), per-session dismiss (August 14, 2026)**
Raised by: Product requirement confirmed by Ceekay.
Chosen: TrialBanner mounted in PageShell. trialDaysRemaining computed from claims.trial_expires_at. 7 >= days > 2: amber banner with renewal CTA. 2 >= days > 0: red banner with explanation of what expiry means (workspace pauses, data preserved, access suspended until plan activated). Dismiss state is useState(false), per-session only.
Why: 7 days is half the trial duration and gives meaningful lead time. 2 days triggers urgency and adds the consequence explanation so users are not surprised. Per-session dismiss is appropriate because the window is so narrow. Per-day persistence would be annoying for a 2-day warning.

**Decision: FeedbackWidget uses useReducer, not multiple useState calls (August 14, 2026)**
Raised by: ESLint rule flagging synchronous setState calls inside useEffect as cascading renders.
Chosen: Single useReducer with OPEN action resets all widget state (isOpen, rating, hovered, comment, submitting, submitted) in one dispatch. useEffect dispatches OPEN once. All interaction handlers dispatch typed actions.
Why: useReducer is the React-recommended pattern when multiple state variables change together. One dispatch is one re-render. Eliminates the cascading render warning and is semantically cleaner: the full open/close/submit state machine is expressed as explicit typed actions rather than scattered setState calls.

**Decision: feedback submit errors are always non-blocking (August 14, 2026)**
Raised by: API failure during feedback submit should not block the thanks state.
Chosen: apiPost call wrapped in try/catch with empty comment. stampCooldown and dispatch SUBMITTED always fire after the catch block, regardless of API outcome.
Why: Feedback submission is a best-effort telemetry action, not a transactional operation. A network error should never result in the user seeing an error state on a widget they voluntarily opened. The thanks state is the correct terminal state regardless of delivery outcome.

**Decision: permission gating is render-time filtering, not DOM manipulation (August 14, 2026)**
Raised by: GAS uses applyRoleGating_() to toggle display:none after render. v2 needed an equivalent.
Chosen: Two approaches working in tandem. (1) Sidebar: visibleNav computed by filtering NAV array against live claims at render time. Unauthorized items are never in the DOM. (2) Route guards: RequirePermission and RequireModule components in App.tsx redirect to / immediately if claims do not satisfy the check. Direct URL navigation is blocked, not just hidden.
Why: The GAS approach causes a flash of ungated content because the DOM manipulation fires after render. React renders synchronously from JWT claims that are available at mount time, so there is no flash. Route guards add a second layer the GAS could not provide: typing /settings in the URL bar redirects an Analyst even if they somehow had the URL.

**Decision: Audit Log gated to manage_settings (Owner-only by default) (August 14, 2026)**
Raised by: GAS does not gate the Audit Log. v2 needed a decision on access.
Chosen: /audit route wrapped with RequirePermission(manage_settings). manage_settings is Owner-only and not workspace-configurable (hardcoded in _role_permissions()). Audit Log is not visible in the sidebar for Managers or Analysts by default.
Why: The Audit Log exposes every write action in the workspace by every user. This is sensitive operational data appropriate only for the workspace Owner. The GAS did not gate it because GAS permissions were less mature. manage_settings is the closest existing key to an admin-level check.

**Decision: ReportBuilder output buttons disabled with tooltip, not hidden (August 14, 2026)**
Raised by: print_reports gates Download PDF and Send by Email. Whether to hide or disable them.
Chosen: Disabled with title="Requires Manager or Owner role" rather than hidden. The report builder is a numbered step flow (step 3 = output). Hiding step 3 entirely would be confusing.
Why: Hiding an element in a numbered sequence breaks the step communication. The user needs to understand that step 3 exists but is not available to them, and why. Disabled with a tooltip achieves this. All other gated buttons (Add Risk, Add Incident, etc.) are hidden because they are toolbar actions without step numbering.

**Decision: feedback trigger wiring deferred to next session (August 14, 2026)**
Raised by: Feedback widget system complete but triggers not yet wired into individual components.
Chosen: Documented here, deferred to next session. Trigger call: useFeedbackStore.getState().trigger(event, label) inside success handler (not during render). Use .getState() not the hook selector since it is called imperatively inside async callbacks.
Trigger sites:
- add_risk / "How was adding your first risk?" -> AddRiskModal on submit success
- import_risk / "How was the import experience?" -> ImportModal on import success
- print_pdf / "How was the report generation?" -> PrintModal on generate success
- ai_insights / "How were the AI insights?" -> AIModal on AI run complete
- ai_dashboard / "How was the AI dashboard summary?" -> dashboard AI summary on complete
- log_incident / "How was logging your first incident?" -> Incidents add handler on success
- invite_user / "How was the invite experience?" -> Users InviteModal on success

---

### Session 15: August 14, 2026 — Logo, Module Enforcement, Feedback Triggers, Module Gating

**Decision: product logo URL is the sole brand image used across all pages and emails (August 14, 2026)**
Raised by: Login page and all auth pages used a placeholder SVG icon. Email header had no image. Favicon pointed to a non-existent /favicon.svg.
Confirmed URL: https://smartrisksheets.com/wp-content/uploads/2025/09/cropped-Smartrisksheets-favicon-v2.png. Source: App.html line 6, Github_index.html line 7, Unified_code.gs line 457.
Chosen: This URL used in frontend/index.html (favicon), app/services/email.py _ext_header() (email header image), and all 8 auth/onboarding page brand icons replacing placeholder SVGs. Sizes: 40x40 on auth-shell pages (Login, Register, ForgotPassword, ResetPassword), 36x36 on picker and expired pages (WorkspacePicker, CreateWorkspace, AcceptInvite, PlanExpired).
Why: Single URL confirmed from three independent GAS reference files. Centralised as _PRODUCT_LOGO constant in email.py so it is defined once for all email templates.
**Decision: Supabase Auth dropped in favour of self-managed bcrypt passwords (August 15, 2026)**
Raised by: Supabase Auth created a structural CI gap (login tests required live Supabase), split user identity across two systems (auth.users + accounts), and ran two JWT systems simultaneously with only one actually used for session management.
Chosen: password_hash TEXT column added to accounts (migration 029). bcrypt via direct import handles hashing and verification. hash_password and verify_password added to core/security.py. login() and register() in services/auth.py rewritten to use local bcrypt. accept_invite() in services/invite.py sets password_hash directly instead of calling Supabase admin.create_user. supabase_uid column retained in schema but no longer written to. Supabase Storage (logo uploads) unaffected.
Why: Pre-launch with no real users is the correct moment to make this change. The codebase already had bcrypt imported. Self-managed auth eliminates the Supabase Auth dependency, makes CI fully hermetic, simplifies the invite flow, and removes the identity split entirely.

**Decision: password reset implemented with 15-minute JWT tokens via Resend (August 15, 2026)**
Raised by: ForgotPassword.tsx and ResetPassword.tsx used supabase.auth.resetPasswordForEmail and supabase.auth.updateUser. Both broken after Supabase Auth removal.
Chosen: create_reset_token() in core/security.py generates a JWT with type=reset and 15-minute expiry. POST /auth/forgot-password generates the token and sends it via send_reset_email() in services/email.py using Resend. POST /auth/reset-password validates the token and updates password_hash. token_version is incremented on reset to invalidate all existing sessions. Frontend reads ?token= query param from URL instead of Supabase auth state change event.
Why: Consistent with the existing invite token pattern (same JWT secret, same jose library). No new DB columns needed. 15-minute expiry is tighter than the previous 60-minute Supabase default and appropriate for a security-sensitive action.

**Decision: asyncpg statement_cache_size=0 for Supabase transaction pooler (August 15, 2026)**
Raised by: OSError Network unreachable on Render with direct Supabase connection (IPv6 vs IPv4). Switched to transaction pooler. Pooler uses pgbouncer which does not persist prepared statements between connections, causing InvalidSQLStatementNameError.
Chosen: statement_cache_size=0 in connect_args on the SQLAlchemy async engine. Forces asyncpg to use simple queries instead of prepared statements.
Why: Transaction pooler is the correct connection method for a hosted backend on Render. The statement cache is an optimisation that only works with persistent connections. Disabling it has negligible performance impact at current scale.

**Decision: Vercel SPA routing via vercel.json (August 15, 2026)**
Raised by: Direct URL navigation to /login and other routes returned 404 because Vercel was looking for static files at those paths.
Chosen: frontend/vercel.json with a single catch-all rewrite rule routing all paths to /index.html.
Why: Standard requirement for any React SPA deployed to Vercel without Next.js.

**Decision: CI test suite uses Alembic migrations not create_all() (August 15, 2026)**
Raised by: SQLAlchemy create_all() failed with asyncpg on Windows because the Tenant model uses server_default="ARRAY['risk']" which asyncpg rejects inside CREATE TABLE DDL.
Chosen: setup_db fixture runs alembic upgrade head in a subprocess with os.environ.copy() so the test DATABASE_URL overrides .env. Teardown drops and recreates the public schema.
Why: Alembic uses raw op.execute() SQL which asyncpg handles correctly. Also guarantees the test schema is always identical to production migrations, not an ORM approximation.

**Decision: auth-brand-icon and picker-brand-icon divs removed when replacing with product logo img (August 14, 2026)**

Raised by: The CSS classes applied a teal background behind the placeholder SVG. The product logo image has its own background and would render incorrectly over a teal layer.
Chosen: The wrapping div is removed entirely. The img tag uses inline style for borderRadius and flexShrink only. These are one-off values on a single element and meet the inline style exception rule in the setup document.
Why: Keeping the div would double-background the image. Two simple inline values are cleaner than a new CSS class for a single element across 8 pages.

**Decision: require_module() follows the require_permission() pattern exactly (August 14, 2026)**
Raised by: Backend routes were accessible to any authenticated user regardless of workspace module configuration.
Chosen: require_module(module) returns an async dependency that calls get_active_tenant and checks module in claims["modules"]. Returns claims dict. For read-only routes that previously used get_active_tenant, require_module replaces it directly. For mutation routes that already use require_permission, require_module is added as a side-effect dep (_: dict = Depends(require_module(...))). FastAPI deduplicates get_active_tenant since it is the same function object.
Why: Identical pattern to require_permission means no new concepts. Side-effect dep on mutation routes preserves the existing claims variable name and avoids renaming parameters. Deduplication is a FastAPI guarantee, not a runtime risk.

**Decision: ai_dashboard feedback trigger skipped permanently (August 14, 2026)**
Raised by: 7 trigger sites documented in previous session. ai_dashboard listed as dashboard AI summary on complete.
Root cause: V2 dashboard Executive Intelligence section (UnifiedSection and RiskSection) is statically computed from data already fetched by useDashboard. There is no user-triggered AI call, no button, and no async action to attach the trigger to. GAS had a similar computed section. Neither version has an on-demand AI generate action on the dashboard.
Chosen: Trigger skipped. Not deferred. No dashboard AI generate button will be added to accommodate the trigger.
Why: Adding a UI element whose sole purpose is to satisfy a telemetry trigger inverts the product design. The feedback system captures reactions to deliberate user actions. Viewing a computed section is not an action worth instrumenting.

**Decision: LookupEditorContent receives visibleKeys as prop, saves all LOOKUP_KEYS regardless (August 14, 2026)**
Raised by: incident_category and incident_severity must be hidden for risk-only workspaces without wiping their DB values on save.
Chosen: visibleKeys prop controls which keys render in the chip editor. handleSave and isDirty still iterate full LOOKUP_KEYS. Hidden keys remain in state initialised from lookups on mount, so their values are unchanged and the save patch sends them back as-is.
Why: The alternative (filtering LOOKUP_KEYS in handleSave) would send an incomplete patch and potentially blank incident keys for risk-only workspaces that later upgrade to unified. Sending all keys on every save is idempotent and safe.

**Decision: Google Analytics confirmed absent from GAS version (August 14, 2026)**
Raised by: Ceekay mentioned GA was possibly added to the GAS version.
Finding: Searched every .gs and .html file in the project for gtag, G-, UA-, googletagmanager, analytics.js. Zero results. GA was not added to the GAS version.
Chosen: GA4 will be added fresh to V2. Pending: user to provide GA4 Measurement ID (G-XXXXXXXXXX). Implementation: add gtag script block to frontend/index.html. No backend changes required. Both are destructive in different ways and must be visually distinct but consistently guarded. The WorkspaceMember row deletion leaves the Account intact so the person retains any other workspace access they have.

---

### Session: August 13, 2026 — Report Builder PDF Alignment, Preview Editability, Activity Feed Fix

**Decision: PDF cover page redesigned to match GAS Puppeteer-rendered HTML (August 13, 2026)**
Raised by: Side-by-side comparison of V2 PDF and GAS PDF. V2 cover was minimal with no left border, no serif title, inline metadata, no disclaimer.
Chosen: ReportLab cover page rebuilt with navy 5pt left border via LINEBEFORE on wrapper Table. Times-Bold 26pt title (closest ReportLab serif to GAS Georgia). Eyebrow text "RISK MANAGEMENT REPORT" in 8pt bold navy. Stacked metadata grid with small-caps labels (Prepared For, Date Prepared, Distribution, Report Reference). Disclaimer paragraph. Navy footer bar with org name and ref value. Confidentiality chip as bordered Table with teal dot (&#9679;) using Paragraph XML font tags.
Why: GAS uses Puppeteer (HTML to PDF). ReportLab cannot replicate CSS natively. Translation targets the visual intent of each GAS element using the closest ReportLab primitive. Navy LINEBEFORE on a wrapper Table is the ReportLab equivalent of CSS border-left.

**Decision: two-pass canvas class used for Page X of N footer (August 13, 2026)**
Raised by: GAS PDF shows "Page 1 of 8" on every page. V2 showed "Page 1" only.
Chosen: _make_canvas_cls factory returns a Canvas subclass that overrides showPage (snapshots state) and save (replays all states with total page count). Footer is drawn in save, not in _on_page. doc.build(story, canvasmaker=canvas_cls) activates two-pass rendering.
Why: ReportLab's BaseDocTemplate does not know total page count during first pass. The two-pass canvas subclass is the standard ReportLab pattern for this. _on_page handles only the header bar. Footer ownership moved entirely to the canvas class to avoid double-drawing.

**Decision: LINEAFTER corrected to LINEBEFORE throughout AI callout and rec cards (August 13, 2026)**
Raised by: All teal left borders were appearing on the right side of callout boxes.
Root cause: LINEAFTER in a single-column Table draws the right edge of the cell. LINEBEFORE draws the left edge. GAS uses CSS border-left which maps to LINEBEFORE in ReportLab.
Chosen: All LINEAFTER replaced with LINEBEFORE in _ai_callout and _render_rec_card.
Why: One-line fix per occurrence. No structural change needed.

**Decision: _render_residual_risk_trend uses line chart, exposure trend uses bar chart (August 13, 2026)**
Raised by: GAS uses svgLine_() for residual risk trend and svgBar_() for exposure trend. V2 used bar chart for both.
Chosen: New _render_line_chart function added translating svgLine_(). PolyLine for the line, Polygon for area fill at alpha=0.12, Circle dots, String labels. _render_residual_risk_trend and _render_incident_analytics route through it. Exposure trend and incident trend remain bar charts.
Why: Residual risk trend is a continuous metric (average score over time) — a line chart shows the trajectory. Exposure index is a discrete monthly snapshot — a bar chart is appropriate. GAS made this distinction explicitly.

**Decision: donut chart added to Risk Distribution PDF block (August 13, 2026)**
Raised by: GAS PDF shows a donut chart with legend on the left and BY CATEGORY table on the right. V2 showed two plain tables.
Chosen: _make_donut_drawing function added using ReportLab Wedge shapes. Outer radius 20mm, inner hole radius 11mm. Single-slice case splits into two 180-degree wedges (ReportLab degenerates on a 360-degree Wedge). Center total text and inline legend embedded in the Drawing. Level table replaced with the Drawing in the left column.
Why: ReportLab does not render SVG natively. Manual Wedge-based donut is the correct translation of GAS svgDonut_(). The Drawing approach integrates cleanly into Platypus flowable layout.

**Decision: all residuals rounded to whole numbers in report service (August 13, 2026)**
Raised by: GAS uses Math.round(r.residual) throughout. V2 used round(..., 1) producing one decimal place. Top risks residuals were raw floats from the database (e.g. 10.08, 11.52).
Chosen: round(..., 1) changed to round() in compute_risk_snapshot, compute_residual_risk_trend, compute_findings, compute_risk_ownership. r.residual wrapped in round() in compute_top_risks and compute_top_emerging_risks.
Why: GRC reports are executive documents. Decimal residual scores add noise without precision value since the inputs (likelihood × impact) are integers. Whole number residuals match GAS behavior and are cleaner to read.

**Decision: all AI-generated text in Report Preview made editable via NarrativeTA (August 13, 2026)**
Raised by: After running Generate AI Narrative, all AI callout boxes became read-only divs. Users could not correct or refine the AI output before exporting.
Chosen: AICallout component deleted. All AI block components (AIExecSummary, ExecutiveCommentary, TopRisksTable, MajorIncidentsTable, RecommendationsBlock, ExecutiveDashboardBlock) now render NarrativeTA pre-filled with AI text. Edits call onEdit(blockKey, value) which writes to aiData[blockKey]. aiData is passed to build_pdf as ai_data on export so edits flow to the PDF.
Why: The GAS preview uses textareas for all narrative content including AI output. Users must be able to refine AI text for their specific context. Making AI output non-editable contradicts the purpose of a preview panel.

**Decision: non-AI block narrative edits flow to PDF via ai_text override (August 13, 2026)**
Raised by: Editing NarrativeTA for blocks like risk-snapshot updated aiData[blockKey] but the PDF renderer ignored it, always using data.get("narrative") from blockData.
Chosen: All non-AI block renderers where _ai parameter was previously unused now use ai_text or data.get("narrative"). Parameter renamed from _ai to ai_text on all affected functions.
Why: The NarrativeTA edit path already correctly writes to aiData. The PDF builder already passes ai_data[key] as ai_text to every renderer. The only gap was the renderers discarding it. Renaming _ai to ai_text and adding the or fallback is the minimal correct fix with no API or data model changes.

**Decision: ActivityFeed insight float precision fixed with two-decimal rounding (August 13, 2026)**
Raised by: Score change insight showed "improvement of 2.6399999999999997 points" due to IEEE 754 float subtraction.
Chosen: rise = Math.round(Math.abs(n - o) * 100) / 100. fmt helper formats whole numbers as integers, others as .toFixed(2). Applied to o, n, and rise in the template string.

---

## Session: August 14, 2026 — Phase 16 QA fixes, Risk Register feature completions

**Decision: last_login never stamped on login (August 14, 2026)**
Raised by: Users page Last Login column showed dash for all users. Column existed on Account model and was returned by the route but was never written.
Chosen: In services/auth.py login(), after the account is confirmed to exist and before tokens are built, set account.last_login = datetime.now(timezone.utc), db.add(account), await db.flush(). Runs on every successful login regardless of workspace count or PIN flow.
Why: The fix must be inside login() so it applies to all login paths. Placing it after the account fetch and before any branching ensures every authenticated login records the timestamp.
New imports: datetime, timezone added to the existing from datetime import timedelta line in services/auth.py.

**Decision: source column added to risks table to track external-origin risks (August 14, 2026)**
Raised by: Every risk row showed a hardcoded "Internal" badge. Risks approved from external submissions had no distinguishing marker.
Chosen: Migration 028 adds source VARCHAR NOT NULL DEFAULT 'internal' to the risks table. models/risk.py gains source = Column(String, nullable=False, server_default='internal'). RiskCreate gains source: str | None = None. RiskResponse gains source: str = 'internal'. services/risk.py create_risk() maps source=payload.source or 'internal' into the Risk() constructor. services/external.py approve_submission() passes source='external' in the RiskCreate payload for risk-type submissions. types/risk.ts Risk interface gains source: string. RiskTable source badge is now data-driven: teal background and teal text for 'external', existing blue for 'internal'.
Why: The source origin must be set at creation time in the approval flow. Storing it on the Risk row means no join is needed at query time and the information survives long after the ExternalSubmission record is archived.

**Decision: AI modal target redesign, confidence dropdown removed (August 14, 2026)**
Raised by: AI modal only offered New Risks and All Risks. No way to run AI on the currently filtered view or on individually selected risks. Confidence dropdown in the modal was redundant with the workspace ai_confidence setting in AI and Automation settings.
Chosen: Three UI targets: New Risks (maps to backend target 'empty'), Filtered Risks (resolves all matching IDs via listRisks with current filter params and page_size 1000, sends as target 'selected' with risk_ids), Selected Risks (uses checked checkbox IDs, disabled when nothing checked). Confidence dropdown removed from modal entirely. Backend schemas/risk.py AIInsightRequest confidence changed from str = 'balanced' to str | None = None. Validator updated to allow None and skip validation in that case. Backend service already does payload.confidence or ai_cfg['confidence'] so None correctly falls through to workspace setting. Frontend AIInsightRequest type removes confidence field. Existing frontend-backend confidence mismatch ('aggressive' in type vs 'assertive' in schema) resolved by removal.
Why: Centralising confidence in the workspace AI settings is more consistent with the GRC model where settings are configured by the workspace owner and applied uniformly. Per-run overrides added complexity without clear user value. The filtered and selected targets use the same backend 'selected' path with resolved risk_ids to avoid any backend schema change.

**Decision: Risk register multi-select checkboxes (August 14, 2026)**
Raised by: No way to select individual risks for targeted AI insight generation.
Chosen: selectedIds: Set<string> state in RiskRegister. handleToggle adds/removes a single ID. handleToggleAll toggles all IDs on the current page (adds if any unchecked, removes all if all checked). Both wrapped in useCallback. RiskTable gains selectedIds, onToggle, onToggleAll props. Checkbox column added as the first column with a select-all header checkbox. Clicking the checkbox cell stops propagation so the row detail modal does not open. Selection persists across page navigation so users can check risks on multiple pages before running AI.
Why: Set<string> is the correct structure for ID membership checks. useCallback with risks dependency ensures handleToggleAll always references the current page. Propagation stop is required to preserve the existing row-click-to-detail UX.

**Decision: bell button pending count badge (August 14, 2026)**
Raised by: Bell icon in the Risk Register toolbar showed no indication of pending external submissions. Users had no way to know submissions were waiting without clicking through.
Chosen: usePendingCount() hook already existed and returns count from GET /api/v1/external/pending/count. Imported in RiskRegister, pendingCount derived as data?.count ?? 0. .notif-count CSS class added to index.css: absolute positioned, top -5px right -5px, teal background, white text, 16px height, pill shape. Badge rendered inside the bell button when pendingCount > 0.
Why: The endpoint and hook were already built in Phase 9. This is pure wiring. The notif-count class is modelled after gs-pulse but is a labelled count rather than a dot.

**Decision: AI insight table column empty after generation, root cause and fix (August 14, 2026)**
Raised by: AI modal showed correct updated count but risks table ai_insight column remained empty after closing the modal.
Root cause: handleGenerateAI called setRefreshKey(k => k + 1) which schedules a useEffect re-fetch asynchronously. The re-fetch fires after the current render cycle. By the time the user closed the modal, the fetch may not have completed or the risks state may not have settled. The risks data was written to the DB correctly but the in-memory state was stale when the user saw the table.
Chosen: await fetchRisks({ ...currentFilterParams, page, page_size: PAGE_SIZE }) explicitly inside handleGenerateAI after generateAI resolves, before returning the result to the modal. setRefreshKey is kept alongside to trigger the stats re-fetch. Because handleGenerateAI awaits fetchRisks, the risks state is updated with fresh data before the modal shows the success screen. When the user closes the modal, the table already reflects the AI insights.
Why: Relying on useEffect indirection introduced a timing gap. Awaiting the fetch directly in the handler makes the refresh deterministic and synchronous within the async flow.

**Decision: AI row flash after generation (August 14, 2026)**
Raised by: No visual feedback on which rows were updated after AI generation, unlike the teal flash applied to newly added or edited risks.
Chosen: New aiFlashIds: Set<string> state in RiskRegister. After fetchRisks completes in handleGenerateAI, aiFlashIds is set to new Set(r.updated_ids) then cleared with setTimeout after 2400ms, matching the add/edit flash duration. RiskTable gains aiFlashIds?: Set<string> prop (optional for backwards compatibility). Row className ORs flashId === r.id and aiFlashIds?.has(r.id) against the same row-flash class. Flash only fires when r.updated_ids.length > 0.
Why: The updated_ids array is already in AIInsightResult. Reusing the existing row-flash CSS class means no new animation or CSS is needed. Optional prop keeps the component backwards-compatible.

**Decision: print CSV scope resolution and page_size cap alignment (August 14, 2026)**
Raised by: CSV export from Print modal only exported the current page (PAGE_SIZE = 5 risks) instead of the full register. Two root causes: scope 'filtered' used the in-memory risks array (current page only); scope 'all' API call used page_size 9999 which exceeded the backend le=200 constraint and returned 422, causing silent fallback to the current page.
Chosen: Backend routes/risks.py page_size cap raised from le=200 to le=1000, matching the workspace risk limit enforced by the quota system. Frontend page_size changed from 9999 to 1000 in both handlePrint and handleGenerateAI. Both 'all' and 'filtered' scopes in handlePrint now call listRisks with page_size 1000, spreading current filter params for 'filtered' and passing no filters for 'all'. The in-memory risks array is never used as a CSV source. If the API call fails, a toast error fires and the function returns early instead of silently falling back to partial data.
Why: 1000 is the correct semantic ceiling because the quota system enforces a hard limit of 1000 risks per workspace. No workspace can have more than 1000 risks, so page_size 1000 guarantees a complete result in one call.
Why: Math.round(x * 100) / 100 eliminates 15-digit floating point noise at 2 decimal places. The fmt helper avoids trailing zeros (2.00 becomes 2). Both old and new scores formatted for consistency.