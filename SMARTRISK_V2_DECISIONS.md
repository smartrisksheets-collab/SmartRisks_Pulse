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

**Decision: global font-weight base correction (August 21, 2026)**
Raised by: V2 UI appeared thicker and heavier than V1 across all text, table cells, and inputs.
Root cause: `body`, `button/input/select/textarea`, and `table/th/td` all had `font-weight: 600` globally in index.css. GAS V1 sets no global font-weight, defaulting to browser 400.
Chosen: Drop all three selectors to `font-weight: 400`. All component-specific weights (700 on .btn, 900 on thead th, 800 on .card-title) remain and continue to override upward.
Why: The blanket 600 base was the single cause of the heavy appearance. No component changes needed.

**Decision: im-card hover lift with :has() flicker suppression (August 21, 2026)**
Raised by: Adding translateY(-4px) lift to im-card:hover caused flickering on cards with interactive children. The card lifts 4px, the cursor exits the child element hit area, hover deactivates, card drops, cursor re-enters, loop repeats.
Chosen: `.im-card:has(.af-feed-row):hover, .im-card:has(.ap-plan-link):hover { transform: none; box-shadow: var(--shadow); }`. Cards with interactive clickable content do not lift. All other im-cards keep the full hover animation.
Why: :has() is self-maintaining, requires no JSX class changes, and is supported in all modern browsers as of 2023.

**Decision: gauge mount sweep animation (August 21, 2026)**
Raised by: Risk Distribution bar chart has Recharts built-in entry animation. Risk Health gauge had no equivalent.
Chosen: `useState(0)` for animatedFill, `useEffect` with 50ms setTimeout sets animatedFill to real fillLen. Existing CSS transition on strokeDasharray plays the sweep. Extended to 0.8s ease-out.
Why: 50ms delay is required to allow the browser to paint the initial empty arc before the transition fires. Without it the browser batches the update with the initial render and the animation does not play.

**Decision: health status neutral class for Monitoring badge (August 21, 2026)**
Raised by: Monitoring badge (51-75 range) returned empty string from healthStatusCls so .sr-delta rendered with no background or color, appearing as plain dark text.
Chosen: healthStatusCls returns 'neutral' for 51-75. `.sr-delta.neutral { background: #f8fafc; color: #94a3b8; }` matching V1 base .sr-delta gray pill style.
Why: Named class is cleaner than relying on base class fallback. Matches V1 exactly.

**Decision: control signal scale conversion, two locations (August 21, 2026)**
Raised by: Control Strength always displayed as single-digit value and never reached the 50 or 70 thresholds.
Root cause: control_effectiveness column stores 1-5 integers. Both services_risk.py (stat card) and services_dashboard.py (dashboard KPI) passed raw values directly as percentages.
Chosen: Multiply by 20 in both locations. `avg_eff = round((sum(eff_vals) / len(eff_vals)) * 20)` in services_risk.py. `round(float(risk_row.avg_ctrl or 0) * 20, 1)` in services_dashboard.py.
Why: 5 * 20 = 100 is the correct ceiling. 1 * 20 = 20 is the correct floor. No cap needed.

**Decision: MatrixSettings preset highlight persistence (August 21, 2026)**
Raised by: Switching to ISSCL preset and saving works but navigating away and returning resets the highlight to SmartRisk default.
Root cause: activePreset initialises to 'smartrisk' as hardcoded useState default. On remount local state resets regardless of saved config. Init block populated form but never updated activePreset.
Chosen: detectPreset(data) iterates PRESETS entries and returns the matching preset name if every key matches, otherwise 'custom'. Called on query.data init and on handleReset.
Why: Comparing saved values against preset values is the only reliable source of truth.

**Decision: Executive Insights AI rewrite architecture (August 21, 2026)**
Raised by: Engineering brief (executive-insights-dev-brief.pdf). Current static RiskNarrative produced unsupported claims with no data backing. Brief specifies 4-sentence, 50-word, fact-only summary.
Chosen: New GET /api/v1/dashboard/exec-insights endpoint. Backend derives all input fields from existing dashboard data via get_dashboard(), no new DB queries except for distinct owners list. Calls claude-haiku-4-5 with exact system prompt from brief. Returns JSON with summary HTML, action items, word count, and owners list. Frontend uses TanStack Query with 30-min staleTime.
Exposure reduction deduplication: activity feed entries deduplicated by risk_id before counting to mitigate OI feed duplicate-entry bug.
['exec-insights'] added to useRisks invalidate() so any risk mutation triggers regeneration.
Action plan modal: xl size (860px), owner dropdown per item (local state only, not persisted), Export as PDF via window.open + print(), white header matching other modals, ap-horizon-tag color corrected from #7fe8cf to #01b88e for white background visibility.
Why: Single AI call returning JSON covers summary and action plan in one round trip. Haiku is sufficient for structured factual output. 30-min staleTime balances freshness with cost. Lazy load keeps main dashboard latency unaffected.

**Decision: duplicate POST /risks/ai route causing AIInsightRequest AttributeError (August 22, 2026)**
Raised by: AttributeError: 'AIInsightRequest' object has no attribute 'rows' on the AI insight endpoint.
Root cause: Two handlers were registered for POST /risks/ai. FastAPI matched the first, which passed AIInsightRequest into risk_service.bulk_import(). That function immediately accessed payload.rows, which does not exist on AIInsightRequest.
Chosen: Removed the first (stale) handler entirely. The second handler calls ai_risk_service.generate_insights with the correct permission (generate_ai) and rate limiter. request: Request param retained for slowapi.
Why: The first handler was a stale copy left during a refactor. Removing it restores correct routing with no behaviour change to the surviving handler.

**Decision: dashboard DeltaBadge signal arrows reintroduced (August 22, 2026)**
Raised by: Signal arrows (▲/▼) missing from DeltaBadge in IncidentSection and UnifiedSection. RiskSection health delta already had arrows inline.
Chosen: DeltaBadge updated in both files to render ▲ +X% / ▼ X% using Math.abs to prevent double sign on negatives. Optional period prop added for native title tooltip on hover, matching GAS sr-dtip data-tipText pattern. period derived from snapshot_delta.has_data and snapshot_delta.period_label at component level.
Why: DeltaBadge is a local helper in each file. The change is isolated and does not affect any other component.

**Decision: 30-Day Action Plan owner persistence via identity pattern (August 22, 2026)**
Raised by: Assigned owners reset to blank every time the modal was closed and reopened because state lived inside ActionPlanModal which unmounts on close.
Chosen: assignedOwners state lifted to ExecInsightCard where it survives the modal lifecycle. State stored as { summary: string, owners: Record<number, string> } rather than a plain Record. During render, assignedOwners resolves to saved owners only if ownersState.summary matches data.summary. On mismatch (new AI cycle) it resolves to {} automatically. setOwner stamps the current data.summary at assignment time so the match persists.
Why: useEffect(() => reset, [data]) was the naive alternative but React flags it as a cascading-renders anti-pattern. The identity pattern achieves the same reset behaviour during render with no extra effect and no extra cycle.

**Decision: PDF report parity pass approach — systematic GAS HTML to ReportLab translation (August 22, 2026)**
Raised by: PDF output from services_pdf_report.py diverged from GAS Reportservice.gs across cover page, all block renderers, font sizes, padding, colors, and level badge styles.
Chosen: Section-by-section comparison of raw GAS HTML output (including CSS class definitions) against ReportLab code. Each disparity recorded in a table before any patch is written. Changes applied as surgical find/replace per section. Shared helpers (_kpi_table, _ai_callout, _S["body"], _level_badge_cell) fixed once and cascade to all call sites.
Notable decisions within the pass:
- _S["body"] color corrected from #0f172a to #333333 matching GAS global td/p color rule.
- _kpi_val_paragraph value font corrected from 18pt to 15pt (GAS 20px × 0.75).
- _ai_callout padding corrected from 8pt to 12pt/14pt matching GAS .ai-callout { padding: 12px 14px }.
- executive-dashboard posture row: GRID removed, value font 20pt → 13pt, padding 4px → 12px.
- _level_badge_cell added as a shared helper matching GAS levelBadge_gs_() pill badge spec exactly.
- key-risk-movements has-data branch fully implemented (was a stub returning empty).
- Commentary section icons corrected: Impact ▲ (△ U+25B3), Recommended Focus ✓ (U+2713).
Why: Systematic comparison before coding prevents compounding errors. Shared helper fixes are preferable to per-site fixes because they cascade correctly and are maintained in one place.

**Decision: matrix-aware risk distribution donut (August 22, 2026)**
Raised by: Risk distribution donut hardcoded ORDER = ["Low", "Medium", "High", "Very High"] and LEVEL_COLORS keyed by label string. Any workspace with custom matrix labels (e.g., "Moderate") gets an empty donut and wrong colors.
Chosen: Three-layer fix. (1) MatrixConfig fetched in build_context and stored on ReportContext. (2) compute_risk_distribution reads band labels from ctx.matrix_config and includes them as band_labels in the payload. (3) _make_donut_drawing replaced LEVEL_COLORS string-keyed dict with _BAND_COLORS_BY_POS list (green → amber → red → dark red → very dark red by position). Slices built as (label, count, color_hex) tuples keyed by ORDER index. ORDER read from data.get("band_labels") with fallback.
Why: Level colors must be positional (band 1 = green regardless of label) not nominal (label == "Low" = green). Any string-keyed approach breaks for custom labels. Position-based assignment is the only correct approach for a label-agnostic system.

**Decision: print CSV scope resolution and page_size cap alignment (August 14, 2026)**
Raised by: CSV export from Print modal only exported the current page (PAGE_SIZE = 5 risks) instead of the full register. Two root causes: scope 'filtered' used the in-memory risks array (current page only); scope 'all' API call used page_size 9999 which exceeded the backend le=200 constraint and returned 422, causing silent fallback to the current page.
Chosen: Backend routes/risks.py page_size cap raised from le=200 to le=1000, matching the workspace risk limit enforced by the quota system. Frontend page_size changed from 9999 to 1000 in both handlePrint and handleGenerateAI. Both 'all' and 'filtered' scopes in handlePrint now call listRisks with page_size 1000, spreading current filter params for 'filtered' and passing no filters for 'all'. The in-memory risks array is never used as a CSV source. If the API call fails, a toast error fires and the function returns early instead of silently falling back to partial data.
Why: 1000 is the correct semantic ceiling because the quota system enforces a hard limit of 1000 risks per workspace. No workspace can have more than 1000 risks, so page_size 1000 guarantees a complete result in one call.

**Decision: label-agnostic report compute functions (August 22, 2026)**
Raised by: Audit of services_report.py revealed six locations where band label strings ("Medium", "Low", "High or Critical") were hardcoded. Any workspace using custom matrix labels (e.g., "Moderate", "Extreme") received incorrect counts (zero) or misleading narrative text.
Chosen: Four-part fix. (1) compute_risk_snapshot counts by level_index (== 1 for low, == 2 for mid) instead of by_level string lookup. Band label names read from ctx.matrix_config.band_1_label and band_2_label for narrative. (2) compute_top_risks and compute_top_emerging_risks now include level_index in the returned risk dict for PDF consumption. (3) compute_risk_distribution narrative reads band labels from matrix_config before string assembly; mc block moved above narrative to make labels available. (4) compute_executive_dashboard bullet rephrased to "elevated risk bands" — label-agnostic by design since the elevated group can span multiple bands.
Why: Any approach that matches level names as strings is fragile against workspace customisation. level_index is the authoritative positional signal; band label strings are display-only. All logic that branches on level must use the index, never the string.

**Decision: position-based PDF level colors (August 22, 2026)**
Raised by: _level_badge_cell and _level_color in services_pdf_report.py used string matching ("critical", "very high", "high", "medium"). Custom labels such as "Extreme" or "Moderate" fell through to the green (low) fallback, producing incorrect badge colors in generated PDFs.
Chosen: Both functions accept an optional level_index: int | None = None parameter. When supplied, color is read from _BAND_COLORS_BY_POS[level_index - 1] (a position-keyed list, not a label-keyed dict). Added parallel _BAND_BG_COLORS_BY_POS for badge background tints. String-match fallback retained for callers where level_index is unavailable (incident severity in _render_major_incidents has no matrix index and correctly stays string-matched). _mov_section call site passes r.get("previous_level_index") ready for when risk history schema stores it; code path is currently unreachable (has_data: False always).
Why: Same principle as the compute layer — positional assignment is the only correct approach for a label-agnostic system. String matching is a display convenience, not a reliable branch condition.

**Decision: AI confidence setting wired to Anthropic temperature (August 22, 2026)**
Raised by: ai_confidence workspace setting (values: conservative, balanced, assertive) was fetched by get_ai_config and returned as the confidence key, but services_ai_report.py used a hardcoded _TEMPERATURE = 0.5 on every call. The workspace setting had no effect.
Chosen: _TEMPERATURE removed. _CONFIDENCE_TEMPERATURE dict maps conservative → 0.3, balanced → 0.5, assertive → 0.7. _call() accepts temperature: float = 0.5 and passes it to the Anthropic messages.create call. generate_report_narrative resolves temperature via _CONFIDENCE_TEMPERATURE.get(ai_cfg['confidence'], 0.5).
Why: The three-value range (0.3, 0.5, 0.7) maps directly to the intent of the GAS option labels without producing erratic output at extremes. The default 0.5 fallback ensures safe behaviour if an unknown value appears in the JSONB.

**Decision: AI sub-policy fields wired through to report prompts (August 22, 2026)**
Raised by: ai_policy_industry, ai_policy_tone, ai_policy_sensitivity, ai_policy_extra are stored in workspace JSONB and surfaced in the settings UI but get_ai_config only returned ai_policy. The four sub-policy fields were never available to services_ai_report.py.
Chosen: AIConfig TypedDict extended with policy_industry, policy_tone, policy_sensitivity, policy_extra. get_ai_config fetches all four with empty-string defaults. generate_report_narrative assembles a combined policy string from all non-empty fields in order, with labelled prefixes for industry/tone/sensitivity ("Industry context:", "Tone:", "Sensitivity:"). Combined policy appended to system prompt as before. auto_run confirmed correctly consumed in routes_risks.py for risk creation; not a report pipeline concern, no change made.
Why: All four fields exist in the schema and settings UI for a reason. Omitting them from the prompt assembly silently discards workspace customisation that the user has explicitly configured.

**Decision: trial workspace tooltip approach — inline reveal instead of floating bubble (August 22, 2026)**
Raised by: Trial users needed feedback explaining why "Switch workspace" and "+ Add workspace" are disabled. Native title attribute does not fire on pointer-events: none buttons. Floating CSS ::after tooltip clipped by overflow: hidden on .topbar-dropdown and pushed off viewport at the right edge.
Chosen: Two-variant CSS approach. Base .tooltip-wrap uses bottom-positioned ::after for open contexts (workspace picker page, where there is vertical space). .tooltip-wrap--inline overrides ::after to position: static, rendering the tip text as an inline block directly below the disabled item inside the dropdown. overflow: hidden removed from .topbar-dropdown (6px padding makes it redundant; no visual side effect). Both variants use data-tip attribute on the wrapper span so the disabled button's pointer-events: none does not block hover detection.
Alternatives rejected: right-positioned floating tooltip went off screen (dropdown is at right edge). Left-positioned floating tooltip overlapped page content and appeared partially obscured. Native title attribute invisible on disabled elements.
Why: Inline reveal is reliable regardless of container overflow or viewport position. It matches the visual weight of a dropdown hint rather than a tooltip bubble, which is appropriate for a constrained dropdown context.

**Decision: Google OAuth implicit flow with userinfo verification, no google-auth package (August 23, 2026)**
Raised by: Google login required for both register and login pages. Backend needs to verify the Google token and find or create an account.
Chosen: Frontend uses @react-oauth/google useGoogleLogin with flow: 'implicit'. Callback provides access_token. Frontend POSTs access_token to /api/v1/auth/google. Backend calls Google userinfo endpoint (https://www.googleapis.com/oauth2/v3/userinfo) via httpx to verify token and retrieve email and name. No google-auth package added to requirements.
Alternatives rejected: ID token flow (GoogleLogin component) requires google-auth package for JWT verification. Auth code flow requires GOOGLE_CLIENT_ID secret on backend, adds complexity. httpx is already in requirements; using it for userinfo avoids any new dependency.
Why: httpx is already present. Userinfo endpoint verification is simpler than JWT signature verification and requires no new package. Implicit flow with a custom-styled button matches the product design without forcing Google's native button rendering.
Drawback recorded: Google Cloud Console OAuth client must have authorised JavaScript origins explicitly listed. Wildcard domains are not accepted. Dynamic Vercel preview URLs cannot be pre-authorised; staging uses a fixed Vercel alias (staging.smartrisksheets.com) instead.

**Decision: onboarding wizard as a single 6-step component with atomic submission (August 23, 2026)**
Raised by: The existing pages_CreateWorkspace.tsx was a single-page form (workspace name + industry dropdown only). Reference HTML designs showed a 6-step wizard with rail navigation, progress bar, and industry tiles.
Chosen: Single React component with internal step state (1-6). All wizard data held in a WizardData object in useState. Submitted atomically on Launch: POST /api/v1/workspaces, POST /api/v1/auth/select-workspace, PATCH /api/v1/lookups (categories, non-blocking), POST /api/v1/settings/logo + PATCH /api/v1/settings (logo, non-blocking), POST /api/v1/users per invite (fire-and-forget).
Alternatives rejected: Per-step persistence via separate API calls per step creates orphaned tenant records on drop-off and requires a token dance (workspace must exist to get tenant-scoped token, but token is needed for PATCH calls on subsequent steps). Multi-route wizard (separate URL per step) adds route configuration and URL-based state management with no user benefit for a linear 6-step flow completed in one sitting.
Why: Atomic submission is the correct approach when all data is collected in one sitting and there is no multi-day or resume use case. Failure is clean: single error, no partial records.

**Decision: wizard fields added as tenant columns, org_name stored in JSONB (August 23, 2026)**
Raised by: Wizard collects org_size, framework, timezone, date_format, org_name, currency. These needed to persist at workspace creation time.
Chosen: Migration 031 adds org_size, framework, timezone, date_format as proper VARCHAR columns on tenants. currency maps to the existing currency_symbol column. org_name goes into workspace_settings JSONB (no migration needed; that column already exists). Rationale for org_name in JSONB: it is display-only context, not a field that drives any backend logic. Framework, timezone, date_format are proper columns because they drive report formatting and settings queries.
Why: framework, timezone, date_format were already being stored in workspace_settings JSONB by the settings service. Promoting them to columns makes them queryable and removes dependence on JSONB parsing for fields with well-defined types. services_settings.py updated to read from columns with JSONB fallback for existing rows.

**Decision: risk categories wizard step appends to defaults, not replaces (August 23, 2026)**
Raised by: services_lookup.py seeds every new workspace with hardcoded category defaults (Strategic, Operational, Financial, Compliance, Reputational, Technical) via _merge_defaults. A PATCH from the wizard with only the user's chosen categories would silently replace all defaults with only those entries. A user who skips the step keeps the defaults; a user who engages loses them.
Chosen: Wizard launch handler fetches existing categories first (GET /api/v1/lookups), merges user choices using Set deduplication, then PATCHes the merged list. Skip leaves defaults untouched. User additions extend the defaults without overwriting them.
Alternatives rejected: Replacing entirely (Option B) produces a worse outcome for engaged users than for users who skip. Awareness-only with no persistence (Option C) makes the step feel pointless.
Why: Append preserves value in both paths: skip is safe, engagement is additive. The defaults are good starting points (they mirror the GAS LOOKUP_DEFAULTS). User additions are supplementary.

**Decision: report builder AI narrative step changed from Required to Optional (August 23, 2026)**
Raised by: step3Disabled was gated on rb.step < 3, meaning export (Download PDF, Send by Email) was blocked until AI narrative was generated. AI generation is a non-trivial operation and not all users need it for every export.
Chosen: step3Disabled changed to rb.step < 2. Export is available immediately after preview (step 2). AI narrative can still be generated at any point before export but is no longer a gate. Tag changed from Required to Optional. Preview toast updated to reflect the new flow.
Why: Blocking export on AI generation adds friction for users who want a clean PDF without narrative commentary, or who want to export quickly for an urgent meeting. The AI step remains visible and accessible; making it optional does not remove it.

**Decision: left accent border removed from trial warning and unsaved changes banners (August 23, 2026)**
[existing content unchanged]

**Decision: org_name JSONB key corrected from "org_name" to "organization" (August 28, 2026)**
Raised by: Wizard stored org_name under JSONB key "org_name" but services_settings.py _build_response reads _s("organization"). Key mismatch meant organization name was written to DB and silently lost, never appearing in Settings.
Chosen: routes_workspaces.py changed ws_settings["org_name"] to ws_settings["organization"]. No migration needed; workspace_settings is a JSONB column.
Why: Single character of key disagreement. Fix is surgical and non-breaking. No data migration needed for existing rows because JSONB reads fall back to empty string default for missing keys.

**Decision: TIMEZONES and FRAMEWORKS in wizard constants aligned to Settings dropdown values (August 28, 2026)**
Raised by: Wizard TIMEZONES used human-readable codes ("WAT (UTC+1)") while settings_WorkspaceSettings.tsx uses IANA identifiers ("Africa/Lagos") as option values. Wizard FRAMEWORKS had "NIST RMF" while Settings has "NIST CSF". Saved values never matched any Settings dropdown option, causing blank or wrong selections after onboarding.
Chosen: utils_constants.ts TIMEZONES replaced with IANA identifiers matching Settings exactly. FRAMEWORKS updated to match Settings option set (added NIST CSF, COBIT, ISO 27001; removed NIST RMF). INITIAL_DATA.timezone default changed from "WAT (UTC+1)" to "Africa/Lagos". Settings WorkspaceSettings INDUSTRIES list updated to include "Oil & gas" to match wizard tile key.
Why: A single source of truth for option values is mandatory. Wizard-saved values must resolve to valid select options in Settings or the form appears corrupted on first visit.

**Decision: WorkspacePicker fetches workspace list from API on mount (August 28, 2026)**
Raised by: WorkspacePicker read exclusively from authStore.workspaces (in-memory). After forced logout or token expiry during wizard, the store was empty even though DB had valid workspace_members rows. User saw empty picker with no way to access their workspace.
Chosen: WorkspacePicker useEffect fetches GET /api/v1/workspaces on mount, maps response to WorkspaceInfo[], calls setWorkspaces. Store data shown as fallback if fetch fails. routes_workspaces list endpoint updated to include member role in each workspace entry (required for WorkspaceInfo type).
Alternatives rejected: Reading only from store (current broken behavior). Relying on login to always populate the store (fails after forced re-login flow).
Why: The picker must reflect actual DB state at render time. API fetch on mount is the only reliable way to guarantee this.

**Decision: setWorkspaces called after wizard launch; queryClient cleared before navigation (August 28, 2026)**
Raised by: handleLaunch created the workspace and called setToken but never called setWorkspaces. Sidebar reads authStore.workspaces.find() which returned undefined for the new workspace, falling back to "SmartRisk". queryClient was not cleared before navigate("/"), meaning stale cache (settings, lookups) was served after navigation.
Chosen: After setToken, manually construct WorkspaceInfo with known values (role: "Owner", plan: "TRIAL", modules: ["risk"]) and call setWorkspaces. Call queryClient.clear() immediately before navigate("/").
Why: setWorkspaces is the only mechanism the sidebar uses to resolve workspace names. queryClient.clear() ensures all queries refetch fresh data scoped to the new workspace token on first load.

**Decision: refresh_access_token issues base token for accounts with no workspaces (August 28, 2026)**
Raised by: Users spending more than 15 minutes on the wizard had their access token expire. The refresh endpoint queried workspace_members for the account. New accounts with no workspaces returned empty rows, raised InvalidTokenError, returned 401. The interceptor then force-logged out the user, losing all wizard state.
Chosen: In refresh_access_token, when rows is empty, issue a fresh base token (same shape as login issues for no-workspace accounts) instead of raising. New refresh token also issued. Return both without a 401.
Alternatives rejected: Extending access token lifetime for all users (breaks the 15-minute security window for active sessions). Skipping refresh for no-workspace accounts (leaves the user with an expired token, same outcome).
Why: The no-workspace state is a legitimate application state during onboarding, not an error. The refresh must succeed so the wizard can complete workspace creation.

**Decision: Settings form dirty state fixed with key prop and post-save sync pattern (August 28, 2026)**
Raised by: WorkspaceSettings initialized form via useState from the settings prop. When query.data changed after mount (background refetch or mutation onSuccess updating cache), the prop updated but form did not. isDirty then fired the unsaved banner with no user interaction.
Chosen: WorkspaceSettings receives a key prop in pages_Settings.tsx tied to stable identity fields (name|organization|industry). Forces clean remount when data meaningfully changes. Additionally, all tab components (WorkspaceSettings, RolesTab, AITab, BriefTab, LookupEditorContent) sync their form state to the server response in their mutation onSuccess callbacks to prevent dirty state immediately after a successful save.
Alternatives rejected: useEffect to reset form on settings change (wipes mid-edit state on background refetch). Storing a baseline snapshot (adds state complexity).
Why: The key approach addresses the root cause (stale form from old prop). Post-save sync closes the secondary gap (form not matching normalized server response).

**Decision: Get Started drawer updated to remove wizard-covered steps, add matrix step (August 28, 2026)**
Raised by: Steps 7 (Brand your workspace) and 8 (Build your team) directly overlap with wizard Steps 1 and 6. Users arriving from the wizard would see these as unchecked even though they had just completed them. Risk matrix customization was deferred by the wizard but had no corresponding prompt in the drawer.
Chosen: Steps 7 and 8 removed. New step 3 added: "Customise your risk matrix" pointing to /settings. Step 2 description updated to acknowledge wizard-seeded categories. TOTAL_STEPS corrected from 8 to 7.
Why: The drawer should guide users through post-onboarding tasks, not repeat onboarding tasks. The matrix step closes the explicit deferral made in the wizard.

**Decision: auth left panels redesigned with auth-feature row pattern; legal footer added (August 28, 2026)**
Raised by: Design files (login.html, forgot-password.html, Create_Account_step1.html) provided updated left panel content. Current app used auth-info-card (glass cards with checkmark circles). Design used auth-feature rows (icon + title + subtitle). Each page had page-specific messaging rather than generic brand copy. Footer lacked legal registration information.
Chosen: New auth-feature, auth-features, auth-feature-icon, auth-feature-title, auth-feature-sub CSS classes added to index.css. All three pages updated with page-specific eyebrow, headline, description, and feature rows using Lucide icons (matching app brand, not Tabler icons from design). Legal footer added: NDPC/DCP/12625, ISO 31000 & COSO ERM, SmartRisk Sheets Technologies Limited, RC 9170218. auth-left h2 size increased from 26px to 34px to match design impact. No gradients added (brand rule maintained).
Alternatives rejected: Adopting Tabler icons (app uses Lucide throughout). Adding radial-gradient background (no gradients brand rule).
Why: Page-specific messaging improves conversion. Login says "Welcome back." Register says brand pitch. Forgot password says recovery-specific content. Legal footer is a compliance requirement.

**Decision: reset password token expiry confirmed as 15 minutes, not 24 hours (August 28, 2026)**
Raised by: Design HTML said "valid for 24 hours." The email body in send_reset_email said "15 minutes." create_reset_token uses timedelta(minutes=15). The left panel copy was initially written as "24 hours" matching the design, which was wrong.
Chosen: Left panel copy corrected to "15 minutes" to match the actual token expiry. Email body unchanged (already correct at 15 minutes). Token expiry unchanged.
Why: Copy must match the actual system behavior. Users who wait 24 hours before clicking a 15-minute link will receive an expired token error.

**Decision: send_reset_email wrapped in asyncio.run_in_executor (August 28, 2026)**
Raised by: send_reset_email calls resend.Emails.send() which is a synchronous blocking HTTP call. It was called directly inside the async forgot_password service, blocking the asyncio event loop for the duration of the Resend HTTP roundtrip.
Chosen: Wrapped in asyncio.get_event_loop().run_in_executor(None, send_reset_email, to, reset_link) to offload to a thread pool executor.
Why: Consistent with how other blocking calls are handled in the codebase. The email delivers identically; the event loop is no longer held.

**Decision: GoogleSignInButton network guard and pending state added (August 28, 2026)**
Raised by: When network is unavailable, clicking "Continue with Google" triggered the OAuth popup (or failed silently) with no feedback for up to 2 minutes. No loading state existed between button click and onSuccess firing.
Chosen: navigator.onLine checked before triggering login(). If offline, onError called immediately with network message. googlePending state added: true on click, false on onSuccess or onError. Button shows spinner and "Connecting to Google…" while pending. onError checks navigator.onLine at callback time to distinguish cancellation from network loss. Applied to both pages_Login.tsx and pages_Register.tsx.
Why: Users deserve immediate feedback. Two minutes of silent waiting is unacceptable UX. navigator.onLine is not 100% reliable but catches the most common case and costs nothing.

**Decision: Report Builder state persisted across navigation via Zustand store (August 28, 2026)**
Raised by: useReports state lived entirely inside the ReportBuilder page component. React Router unmounted the page on navigation. Every return visit reset canvas, settings, step, preview data, and AI narratives to defaults.
Chosen: New reportBuilderStore (Zustand, no persist middleware) holds activeBlocks, settings, step, blockData, aiData. useReports initializes useState from store on mount and writes back via set() whenever any of these fields change. reset() clears both store and local state atomically. "New report" button added to report builder header with confirm dialog before clearing. No localStorage used; state is session-level only (resets on page reload, which triggers loadSavedSettings from API as before).
Alternatives rejected: localStorage/sessionStorage (serialization complexity, size limits with blockData). Lifting useReports to app level (architectural change, affects all pages). CSS visibility (renders all pages simultaneously, wasteful).
Why: Zustand without persist is the lightest session-level persistence mechanism in the existing stack. Zero architectural change to the rest of the app. The reset button gives users explicit control over when to start fresh.

**Decision: PDF content width corrected from 170mm to 180mm to match GAS portrait margins (August 28, 2026)**
Raised by: GAS portrait CSS uses `@page{margin:18mm 15mm 22mm 15mm}`. Python used `margin = 20 * mm` giving 170mm content width. GAS content width = 210 - 15 - 15 = 180mm. The 10mm gap caused KPI label wrapping, narrower cells, and unnecessary vertical growth on the executive dashboard.
Chosen: `_make_doc` margin changed from 20mm to 15mm. All content page elements (HRFlowable at 100%, posture row, bullet rows, KPI table) inherit the wider frame automatically. Dashboard-specific hardcoded 170mm references updated to 180mm.
Why: Root cause fix rather than compensating with smaller fonts. Matches the actual GAS geometry.

**Decision: _kpi_table restructured as flat table; LINEBEFORE on first column only (August 28, 2026)**
Raised by: Previous implementation wrapped each KPI in a nested Table with its own LINEBEFORE, creating a colored vertical divider before every metric. GAS reference has a single colored left-edge accent on the strip, no inter-cell borders. The nested tables also doubled padding overhead (inner 10+6pt + outer 4pt = 20pt per cell dead space), causing label text to wrap.
Chosen: Flat multi-row Table where all KPI values share row 0 and all labels share row 1. LINEBEFORE applied to (0,0)-(0,-1) only (first column across all rows). First KPI color used for the single left accent. Padding tightened to 8pt left, 4pt right, 7pt top on value row, 6pt bottom on last row.
Alternatives rejected: Keeping nested tables but suppressing LINEBEFORE on all but the first — workable but still carries the double-padding problem. Complete redesign of the KPI component — ruled out by spec.
Why: Flat table eliminates nested padding overhead, resolves label wrapping, and produces the correct single-accent visual matching GAS.

**Decision: Control Strength KPI added via control_effectiveness field on RiskRow (August 28, 2026)**
Raised by: `compute_executive_dashboard` had only 5 KPIs. GAS computes 6 including Control Strength from `ctrlEffToNum_` / `_ctrlStrength`. `RiskRow` dataclass had no `control_effectiveness` field so the value was silently dropped in `_fetch_risks`.
Chosen: `control_effectiveness: int` added to `RiskRow`. `_fetch_risks` reads it from the ORM Risk model. `compute_executive_dashboard` computes `_ctrl_strength` as the average of non-zero values (assumes 0-100 scale, matching GAS default when lookup max = 100). Color thresholds: green ≥75, amber ≥50, red <50. Inserted fifth, between High Risks and Avg Residual.
Why: Data is already in the DB. The field just was not plumbed through the reporting layer. No migration required.

**Decision: _PillChip custom Flowable replaces rectangular Table chip on cover (August 28, 2026)**
Raised by: ReportLab Table does not support border-radius. The confidentiality chip was rendered as a Table with BOX border, producing a rectangle. GAS uses `border-radius:20px` producing a pill.
Chosen: `_PillChip(Flowable)` draws a rounded rect via `canvas.roundRect()` with radius = height/2 for a full pill shape. Placed in the same Table cell slot as the previous chip. `Flowable` added to platypus imports.
Alternatives rejected: Approximating with a small border-radius via ReportLab rounded corners (not available on Table). Using SVG (heavyweight, not needed).
Why: `canvas.roundRect()` is the correct ReportLab primitive for this geometry. Custom Flowable is the standard pattern when Tables cannot reproduce the required shape.

**Decision: Cover _meta_gap computed dynamically from frame height (August 28, 2026)**
Raised by: Cover used `Spacer(1, 6*mm)` before the metadata grid, leaving the metadata compressed into the top half of the cover. GAS uses `margin-top: auto` to push metadata toward the bottom.
Chosen: `_meta_gap = max(10*mm, frame_height - _top_est - _bot_est)`. Frame height = 297-18-14 = 265mm portrait. `_top_est` = 90mm (brand row + 48mm spacer + eyebrow + title + period + rule). `_bot_est` = 78mm (meta table + small spacer + disclaimer + footer bar), calibrated after a first render at 57mm overshot the target position by 16mm. Final gap = 97mm.
Why: Dynamic computation is preferred over an arbitrary large Spacer. The formula ties the gap to the actual frame height so it degrades gracefully for landscape or non-standard page sizes.

**Decision: PageTemplate sequencing fixed — NextPageTemplate before PageBreak (August 28, 2026)**
Raised by: `NextPageTemplate("content")` was placed after `PageBreak()` in the story. ReportLab allocates a new page's template at the point of the page break using the most recently processed `NextPageTemplate`. Placing it after meant the first content page used the cover template (`_on_cover_page`) and received no navy header.
Chosen: `NextPageTemplate("content")` moved immediately before `PageBreak()`. The trailing duplicate after the block pages comment removed.
Why: `NextPageTemplate` is a flowable that sets state for the next break. Its position relative to `PageBreak` in the story is what determines which template the new page receives.

**Decision: Report email wired to executive-dashboard block data; posture row and AI bullets added (August 28, 2026)**
Raised by: `_build_email_html` ignored `block_data["executive-dashboard"]` entirely, always using 4 hardcoded KPIs from individual blocks and a derived fallback for bullets. GAS prioritises `ed.bullets` from `computeExecutiveDashboard_`. AI-generated executive dashboard text was not passed to the email function at all. Org name was not shown in the email header.
Chosen: `_build_email_html` signature gains `ai_data` and `org_name`. KPIs sourced from `ed["kpis"]` (6 data-driven) when present, fallback to 4 hardcoded. Posture row (Status / Trend / Confidence) inserted when `ed["posture"]` is present. Bullet priority: AI text → `ed["bullets"]` → `_derive_bullets` fallback. `_esc()` added on all user-sourced strings. `send_report_email` gains `ai_data` and `org_name` parameters. Route passes `payload.ai_data` and `_org`.
Alternatives rejected: Keeping hardcoded KPIs (loses Control Strength and Avg Residual in email). Skipping posture row (useful executive context, data already present, one table row).
Why: Email should reflect the same data the PDF shows. Wiring the executive dashboard block closes the gap between the PDF and the email summary.

**Decision: RESEND_FROM_EMAIL updated to no-reply display name format (August 28, 2026)**
Raised by: Report emails were sent from bare `info@smartrisksheets.com` with no display name, making the sender unrecognisable and implying a monitored reply inbox.
Chosen: `RESEND_FROM_EMAIL=SmartRisk Pulse <noreply@smartrisksheets.com>`. Resend accepts RFC 5322 `Name <address>` format in the from field directly. Domain already verified. No code changes required.
Why: No-reply address sets correct expectations. Display name improves recognisability in recipient inboxes. Environment variable is the correct layer for this — the code passes the value through unchanged.
Raised by: Both banners had border-left: 4px solid applied alongside a 1px uniform border, creating an asymmetric visual extrusion on the left edge that conflicted with the card-style design language of the rest of the app.
Chosen: border-left removed from trial-warn--amber, trial-warn--red, and unsaved-banner. Uniform 1px border retained on all sides. Dark mode override for border-left-color on unsaved-banner also removed.
Alternatives considered: Top accent strip (border-top: 3px solid), icon-led no-border variant, compact pill. User decision to proceed with simple uniform border pending final design pass on the banner family.
Why: Uniform border is the least disruptive change and consistent with other card components in the app. The tinted background already provides sufficient visual signal for the warning state without a directional accent.
Raised by: Trial users needed feedback explaining why "Switch workspace" and "+ Add workspace" are disabled. Native title attribute does not fire on pointer-events: none buttons. Floating CSS ::after tooltip clipped by overflow: hidden on .topbar-dropdown and pushed off viewport at the right edge.
Chosen: Two-variant CSS approach. Base .tooltip-wrap uses bottom-positioned ::after for open contexts (workspace picker page, where there is vertical space). .tooltip-wrap--inline overrides ::after to position: static, rendering the tip text as an inline block directly below the disabled item inside the dropdown. overflow: hidden removed from .topbar-dropdown (6px padding makes it redundant; no visual side effect). Both variants use data-tip attribute on the wrapper span so the disabled button's pointer-events: none does not block hover detection.
Alternatives rejected: right-positioned floating tooltip went off screen (dropdown is at right edge). Left-positioned floating tooltip overlapped page content and appeared partially obscured. Native title attribute invisible on disabled elements.
Why: Inline reveal is reliable regardless of container overflow or viewport position. It matches the visual weight of a dropdown hint rather than a tooltip bubble, which is appropriate for a constrained dropdown context.

---

## Session: August 28, 2026 — Foundations Phase (Stream A and B Prerequisites)

**Decision: Residual risk formula corrected from percentage to scaled 1-5 (August 28, 2026)**
Raised by: User reported residual risk on the register table not visibly subtracting control effectiveness from inherent risk. Root cause: the August 17 decision changed `control_effectiveness` to a 1-5 integer scale but never updated the scoring formula. `_score()` still used `ce = value / 100`, giving a maximum reduction of 5% (severity=15, CE=5 → residual=14.25, rounds to 14). The stat card already converted 1-5 to percentage via `* 20`, confirming the 1-5 scale intent.
Chosen: `ce = (control_effectiveness or 0) / 5` in `app/services/risk.py _score()` and `src/utils/scoring.ts computeScore()`. Maps 1→20%, 2→40%, 3→60%, 4→80%, 5→100%. Standard formula `residual = severity × (1 - ce)` is unchanged. Verified against ISO 31000 / COSO ERM standard: residual = inherent × (1 - control effectiveness%). GAS used direct subtraction which is non-standard and breaks at low severity values.
Why: The stat card's `* 20` conversion was already treating 5 as 100% effective. The scoring formula had to match that interpretation. Direct subtraction (GAS pattern) is mathematically incorrect on a 1-25 severity scale.

**Decision: RiskUpdate.control_effectiveness le=100 corrected to le=5 (August 28, 2026)**
Raised by: The August 17 decision stated all three schemas carrying `control_effectiveness` were corrected to `le=5`. `RiskCreate` was fixed. `RiskUpdate` was missed and still had `le=100`. `BulkImportRow` was also missed and still had `le=100`.
Chosen: Both corrected to `le=5` in `app/schemas/risk.py`.
Why: A user editing an existing risk could submit CE=60, the formula would compute `ce=12.0`, and residual would go negative. The validator must enforce the same bounds as the form.

**Decision: Unevidenced control freshness state added as computed field (August 28, 2026)**
Raised by: Build brief for External Submission Link requires that promoted risks show no misleading residual when no control test has been logged. The existing `freshness` field tracks risk review recency from `last_reviewed_at`. A separate concept is needed for control test recency.
Chosen: `control_freshness` added to `RiskResponse` as a Pydantic v2 `@computed_field` derived from `control_last_tested`. Returns `'Unevidenced'` when `control_last_tested` is null, then `'Fresh'` / `'Aging'` / `'Stale'` using the same 15/30-day thresholds as `compute_freshness`. No DB column added — it is derived on every read. The residual cell badge in `RiskTable` switches from `r.freshness` to `r.control_freshness`. `RiskFreshness` type gains `'Unevidenced'`. `freshnessClass`, `freshnessColor`, `FRESH_META`, `.freshness-unevidenced`, and `.fresh-tip.unevidenced` all extended.
Alternatives rejected: Storing a separate `control_freshness` column (adds a migration and requires a write on every control_last_tested change). Modifying `compute_freshness` to use `control_last_tested` instead of `last_reviewed_at` (breaks existing freshness semantics for risk review tracking).
Why: The two freshness concepts are distinct: risk review recency (`freshness`, drives activity feed and phase-one tracking) and control test recency (`control_freshness`, drives residual credibility). Keeping them separate avoids conflating two independent governance clocks.

**Decision: Four new columns added to risks table for register enhancement (August 28, 2026)**
Raised by: Stream A Risk Register Enhancement requires Root Cause, Financial Exposure, Linked Decision, and Control Assertion Source fields on risks. These were not in the original schema.
Chosen: Migrations 032 and 033 add `root_cause TEXT`, `financial_exposure TEXT`, `linked_decision TEXT`, `control_assertion_source TEXT` to the `risks` table, all nullable, each in its own `op.execute()` call. All four added to `RiskCreate`, `RiskUpdate`, and `RiskResponse` schemas. `create_risk` constructor maps all four. `update_risk` handles them automatically via `model_dump(exclude_unset=True)`.
Why: All four are optional analyst-entered fields with no constraints or FK dependencies. TEXT nullable is the correct type. No existing query is affected.

**Decision: appetite_thresholds table created as a standalone service table (August 28, 2026)**
Raised by: Stream A adds an Appetite column to the risk register. Each risk must be compared against a per-category residual threshold set by the workspace. This data cannot live in `workspace_settings` JSONB because it is queried per-category on every register read and benefits from a typed indexed column.
Chosen: Migration 034 creates `appetite_thresholds` with `(tenant_id, category)` unique constraint, `threshold INTEGER` (1-25 scale matching severity), `rationale TEXT`, `set_by TEXT`, `set_at`, `updated_at`. Index on `tenant_id`. `AppetiteThreshold` ORM model and `AppetiteThresholdUpsert` / `AppetiteThresholdResponse` schemas created. Routes and frontend service deferred to Stream A.
Alternatives rejected: Storing thresholds in `workspace_settings` JSONB (non-queryable per category, requires full blob read and Python-side filter on every register load). Adding a `threshold` column to `lookups` (lookups stores label arrays, not per-category numeric values, mixing concerns).
Why: A standalone indexed table is the correct pattern for per-category numeric config that is read alongside every risk list query. Consistent with `matrix_config` pattern already established in this project.

**Decision: Two product streams scoped and sequenced (August 28, 2026)**
Raised by: Four uploaded files (risk register mock, appetite settings mock, submission form mock, build brief PDF) define two distinct build streams requiring sequencing.
Stream A: Risk Register Enhancement. Appetite thresholds settings tab, register table redesign (columns: Risk ID, Description, Owner, Business Impact, Severity, Level, Financial Exposure, Appetite, Decision Required), Decision Required tracking, Add/Edit modal updates (Root Cause, Financial Exposure, Control Assertion section with Last Tested and Assertion Source).
Stream B: External Submission Link. Tokenised public form, submission_tokens and risk_submissions tables, triage queue, scoring and promotion flow, five submitter notifications, rate limiting via DB counter table.
Chosen: Foundations first (this session), then Stream A, then Stream B.
Why: Stream A ships visible value to existing users with no new public attack surface. Stream B depends on Unevidenced state (now in foundations) and is the higher security surface. Scenario Mode deferred entirely: it belongs in a dedicated tab inside the risk detail view, not the Add/Edit modal, and requires a product decision on tier gating and storage model before building.
Why: Math.round(x * 100) / 100 eliminates 15-digit floating point noise at 2 decimal places. The fmt helper avoids trailing zeros (2.00 becomes 2). Both old and new scores formatted for consistency.

---

## Session: August 28, 2026 — Stream A: Risk Register Enhancement

**Decision: Appetite service uses select-then-upsert pattern, not INSERT ON CONFLICT (August 28, 2026)**
Raised by: The appetite PUT endpoint must insert if no record exists for the category, update if one does.
Chosen: Select first, branch on result: new record uses `db.add(row)`, existing record uses direct attribute assignment. `db.flush()` + `db.refresh(row)` follow in both branches. `# type: ignore[assignment]` on Column attribute writes per Pylance rules.
Alternatives rejected: `insert().on_conflict_do_update().returning()` — valid but more complex and harder to type safely under Pylance. Raw asyncpg upsert — bypasses ORM, breaks the project flush/refresh convention.
Why: Consistent with the pattern used in every other upsert in this codebase. Pylance-clean. No raw SQL.

**Decision: Appetite status uses 75% near-zone boundary (August 28, 2026)**
Raised by: The Appetite column needs a three-tier status (Within, Near, Exceeds) from residual vs category threshold.
Chosen: `exceeds` when `residual > threshold`; `near` when `residual > threshold * 0.75`; `within` otherwise. Validated against all four mock data points.
Alternatives rejected: Equal-to-threshold as "Within" — R-001 counterexample (residual=15, threshold=15 shows Near in mock). Fixed-point bands — fragile across the 1-25 scale.
Why: Percentage boundary adapts proportionally. The last 25% of a threshold triggers a caution state, matching standard GRC appetite governance logic.

**Decision: useEffect state reset replaced by key prop on RiskDetailModal mount (August 28, 2026)**
Raised by: `decisionText` state in `RiskDetailModal` needed resetting when a different risk was opened. Initial implementation used `useEffect(() => setDecisionText(''), [risk?.id])`, which React 19 flags as calling setState synchronously in an effect body.
Chosen: Remove the `useEffect` entirely. Apply `key={selected?.id ?? 'none'}` to the `RiskDetailModal` mount in `RiskRegister.tsx`. React remounts the component on key change, resetting all useState to initials automatically.
Alternatives rejected: `useEffect` with state setter — React 19 anti-pattern, cascading render warning. `useRef` to track previous id — adds complexity without correctness benefit.
Why: Idiomatic React identity-reset pattern. No effect needed. The detail modal remounts infrequently (only when selected risk changes), so there is no performance cost.

**Decision: undecided filter implemented as backend query param with separate count query (August 28, 2026)**
Raised by: The undecided button needs a workspace-wide count and must filter the risk list to undecided risks only.
Chosen: `undecided: bool | None = None` added to `list_risks` service and route. `Risk.linked_decision.is_(None)` applied when True. Frontend adds `undecided?: boolean` to `ListRisksParams`. A dedicated TanStack Query (`queryKey: ['risks', 'undecided-count']`, `page_size: 1`) reads `meta.total` for the button label independently of the main list query.
Alternatives rejected: Deriving count from current page risks — counts current page only, misleading when paginated. Dedicated `/risks/count` endpoint — extra route for no added capability since `list_risks` already returns total.
Why: Cheapest way to get a workspace-wide undecided count. TanStack Query caches and deduplicates independently. Auto-invalidated by any risk mutation since `['risks']` prefix matching covers `['risks', 'undecided-count']`.

**Decision: control effectiveness fields grouped into form-section card in RiskForm (August 28, 2026)**
Raised by: Three new control fields (Last Tested, Assertion Source) join existing Controls and Effectiveness fields. Four fields together need visual grouping to signal they form one governance unit.
Chosen: `.form-section` wrapper `gridColumn: span 12` inside the outer `.row`, containing a nested `.row` for the four control fields plus a `.form-section-note` explaining the governance clock relationship.
Alternatives rejected: Flat field layout alongside other form fields — no visual distinction in a long form. Section header as plain `<hr>` or text divider — insufficient affordance.
Why: Consistent with `.settings-section` pattern used throughout Settings. Signals to analysts that effectiveness, last tested, and assertion source are three aspects of one control quality assertion.

**Decision: Treatment filter UI removed from RiskRegister, state retained (August 28, 2026)**
Raised by: Treatment is no longer a table column. Keeping a filter for a column not visible in the table is confusing.
Chosen: Remove the Treatment `<select>` from the filter bar JSX. Retain `treatment` state, `setTreatment`, and all query param wiring.
Alternatives rejected: Full removal of all seven treatment references — correct long-term, deferred to avoid scope creep.
Why: The state always resolves to `undefined` in query params via `|| undefined`. No query is affected. The cleanup is a one-line find-replace on next RiskRegister touch.