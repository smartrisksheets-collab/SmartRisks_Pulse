# SmartRisk Pulse v2 — Build Phase Document
 
**Product:** SmartRisk Pulse v2
**Stack:** FastAPI + React + Supabase + Render + Vercel
**Setup document:** SMARTRISK_V2_SETUP.md
**Last updated:** August 22, 2026
 
---
 
## HOW TO READ THIS DOCUMENT
 
This document is read at the start of every session, after SMARTRISK_V2_SETUP.md and SMARTRISK_V2_DECISIONS.md. It tells Claude exactly where the build is, what was completed, and what the next action is. Claude does not ask what to do next. It reads this file and continues from the marked position.
 
At the end of every session Claude outputs a fresh version of this file with all completed items checked, the current status updated, and the next session starting point written clearly.
 
---
 
**Phase:** Stream B complete. External Submission System fully built and pushed to staging.
**Status:** Session 20, August 31, 2026: Stream B fully built. Staging/production split configured. See session log below.
**Next action:** Begin next session by reading SMARTRISK_V2_SETUP.md, SMARTRISK_V2_DECISIONS.md, then this file. First task: staging QA with tester across all Stream B surfaces (public form, submissions inbox, token manager, promotion flow). Second task: address any bugs found in staging QA.
 
---
 
## KNOWN ISSUES AND PENDING DECISIONS

- Windows has a native Postgres installation on port 5432. Docker is mapped to port 5433 to avoid conflict. `DATABASE_URL` in `.env` must always use port 5433. Same applies to SQLTools connection in VS Code.
- Python version on this machine is 3.13.5, not 3.12. All native type hint rules still apply. No breaking differences for this build.
- Supabase schema sync is deferred to Phase 16. All migrations run only against local Docker Postgres during development.
- Supabase dashboard must have redirect URLs configured before password reset works: `https://your-domain.vercel.app/reset-password` and `http://localhost:5173/reset-password`.
- `@supabase/supabase-js` is installed on the frontend and used only in `src/lib/supabase.ts`, `src/pages/ForgotPassword.tsx`, and `src/pages/ResetPassword.tsx`.
- Category and treatment filter dropdowns in RiskRegister are now driven by useLookups (resolved August 7, 2026 — previously hardcoded).
- Owner filter in RiskRegister reads from lookups.risk_owner (resolved August 7, 2026 — previously built from current page only).
- PrintModal Generate Report button closes the modal only. Actual PDF/CSV generation wired in Phase 7.
- PendingSubmissionsModal shows empty state only.
- Manual browser QA of Phase 15 responsive checklist (375px, 768px, 1024px, 1280px) still outstanding. Must be completed before Phase 16 deployment.
- Likelihood and impact_score dropdowns in RiskForm still use fixed SCALE = [1,2,3,4,5]. These could be driven by lookups.likelihood and lookups.impact_level but the form types them as number. Deferred — no user request to change these yet.
- NotificationPrefs tab in Settings does not have an unsaved-changes banner. Its save is per-field toggle (no bulk form), so the pattern does not apply. Correct as-is.
- BillingTab in Settings has no save action (read-only). No banner needed. Correct as-is. Live approval queue wired in Phase 9.
- ExternalLinkModal URL built from window.location.origin + tenant UUID. Public form route built in Phase 9.
- Delta labels on stat cards (cards 1 and 2) require snapshot comparison data from Phase 6. Structure is in place, data will populate in Phase 6.
- db.refresh(risk) must always follow db.flush() in any service function that calls model_validate on a Risk ORM object. This applies to any future service functions added in Phase 5 onward.
- Incident owner dropdowns (Reported By, Assigned Owner) populate from risk_owner lookup array. Full workspace members fetch from users endpoint deferred to Phase 6.
- Incident Business Unit filter renders only when lookups.business_unit.length > 0. Users add business units via Settings, which is Phase 8.
- Lookup editing UI (Settings page) not yet built. Phase 8.
- 15-minute access token expiry is intentional. Inactivity logout now handled by useInactivityLogout hook mounted in PageShell. Hook silently refreshes the token every 10 minutes of activity via POST /api/v1/auth/refresh. Warning banner appears at 14 minutes of inactivity. Logout fires at 15 minutes. ACCESS_TOKEN_EXPIRE_MINUTES=15 is correct and should not be changed.
- Dark mode CSS must always use CSS variables from the start. Any new CSS class must use var(--card), var(--line), var(--accent), var(--text) etc. Hardcoded colors in new classes are not permitted.
---
 
## BUILD PHASES
 
---
 
### Phase 1: Project Scaffold and Local Environment
 
**Goal:** Both servers running locally, database connected, Alembic ready, folder structure in place.
 
**Checklist:**
 
- [x] Docker Compose file created and Postgres container running (port 5433)
- [x] Backend virtual environment created and activated
- [x] All Python dependencies installed from requirements.txt
- [x] Backend folder structure created with all `__init__.py` files
- [x] `.env` and `.env.example` created and populated
- [x] `app/core/config.py` created with all constants
- [x] `app/db/base.py` created with SQLAlchemy Base
- [x] `main.py` created, health check route working at `http://localhost:8000/api/health`
- [x] Alembic initialised and `alembic/env.py` configured for async
- [x] Alembic `alembic current` runs without error
- [x] Frontend created with Vite React TypeScript template (`--template react-ts`), React Router, TanStack Query, Zustand, Axios
- [x] Frontend dev server running at `http://localhost:5173`
- [x] `.gitignore` configured
- [x] VS Code extensions installed and settings configured
**Status:** Complete
 
---
 
### Phase 2: Database Migrations and Schema
 
**Goal:** All tables created in local Postgres via Alembic. All indexes applied. Schema matches SMARTRISK_V2_SETUP.md exactly.
 
**Prerequisite:** Phase 1 complete.
 
**Checklist:**
 
- [x] Migration 001: accounts table
- [x] Migration 002: tenants table with created_by foreign key
- [x] Migration 003: workspace_members table
- [x] Migration 004: risks table
- [x] Migration 005: incidents table
- [x] Migration 006: audit_logs table
- [x] Migration 007: activity_feed table
- [x] Migration 008: risk_history table
- [x] Migration 009: snapshots_monthly table
- [x] Migration 010: snapshots_daily table
- [x] Migration 011: recycle_bin table
- [x] Migration 012: lookups table
- [x] Migration 013: external_submissions table
- [x] Migration 014: notification_prefs table
- [x] Migration 015: all indexes applied (19 indexes, each in its own op.execute call)
- [x] Migration 016: token_version column added to accounts
- [x] Migration 017: pin_attempts and pin_locked_until columns added to tenants
- [x] `alembic upgrade head` runs clean with no errors
- [x] All tables verified in local Postgres via SQLTools
- [ ] Same SQL run in Supabase SQL editor for hosted environment (deferred to Phase 16)
**SQLAlchemy models created:**
 
- [x] `models/account.py`
- [x] `models/tenant.py`
- [x] `models/workspace_member.py`
- [x] `models/risk.py` (composite PK: id + tenant_id)
- [x] `models/incident.py` (composite PK: id + tenant_id)
- [x] `models/audit_log.py`
- [x] `models/activity_feed.py`
- [x] `models/risk_history.py`
- [x] `models/snapshot.py` (SnapshotMonthly + SnapshotDaily in one file)
- [x] `models/recycle_bin.py`
- [x] `models/lookup.py`
- [x] `models/external_submission.py`
- [x] `models/notification_pref.py`
- [x] `models/__init__.py` exports all models
**Status:** Complete
 
---
 
### Phase 3: Authentication and Workspace Management
 
**Goal:** Account login, registration, JWT issuance, workspace selection, workspace creation, workspace switching, password reset all working end to end.
 
**Prerequisite:** Phase 2 complete.
 
**Backend checklist:**
 
- [x] `core/exceptions.py`: all custom exception classes
- [x] `core/security.py`: JWT creation, verification, PIN hashing, type claim on access tokens, token_version on refresh tokens
- [x] `core/rate_limit.py`: slowapi Limiter singleton
- [x] `core/dependencies.py`: get_db, get_current_account, get_active_tenant, require_permission
- [x] `db/session.py`: async SQLAlchemy session factory, asyncpg driver enforced via URL replace
- [x] `schemas/auth.py`: LoginRequest, RegisterRequest, WorkspaceSelectRequest, PINVerifyRequest, TokenResponse, WorkspaceInfo
- [x] `schemas/user.py`: AddMemberRequest, UpdateMemberRequest, WorkspaceMemberResponse, CreateWorkspaceRequest, WorkspaceResponse
- [x] `services/auth.py`: login, register, select_workspace, verify_pin_and_issue_token, refresh_access_token. Supabase client lazy-loaded via `_get_supabase()`
- [x] `services/user.py`: list_members, add_member, update_member, deactivate_member, reactivate_member
- [x] `api/v1/routes/auth.py`: POST /login, POST /register, POST /select-workspace, POST /refresh, POST /verify-pin, POST /logout
- [x] `api/v1/routes/workspaces.py`: POST /workspaces, GET /workspaces, GET /workspaces/:id
- [x] `api/v1/routes/users.py`: GET /users, POST /users, PATCH /users/:id, DELETE /users/:id, POST /users/:id/reactivate
- [x] `middleware/tenant.py`: TenantMiddleware resolves tenant_id from JWT on every request
- [x] Rate limiting: 5/min login, 3/min register, 10/min select-workspace and verify-pin, 20/min refresh
- [x] Trial expiry check on workspace access in get_active_tenant
- [x] Workspace ownership limit read from database, not JWT claims
- [x] Token versioning: token_version stamped on refresh tokens, checked on every refresh, incremented on deactivate
- [x] PIN lockout: 5 failed attempts locks PIN for 15 minutes
- [x] Last owner protection: cannot deactivate last Owner of a workspace
- [x] Type claim: access tokens carry `type: "access"`, get_current_account rejects non-access tokens
- [x] `app/main.py`: CORS, TenantMiddleware, slowapi, all exception handlers, all routers mounted
**Frontend checklist:**
 
- [x] `src/index.css`: full design system ported from GAS Styles.html
- [x] `src/types/api.ts`: already existed, kept as-is
- [x] `src/types/auth.ts`: WorkspaceInfo, AuthClaims, LoginResult, imports types from api.ts
- [x] `src/utils/constants.ts`: ROLES, PLANS, INDUSTRIES arrays appended to existing file
- [x] `src/services/api.ts`: axios instance, interceptors, apiGet, apiPost, apiPatch, apiDelete
- [x] `src/store/authStore.ts`: Zustand with persist
- [x] `src/store/uiStore.ts`: Zustand with persist, theme management
- [x] `src/utils/permissions.ts`: canDo, useCanDo
- [x] `src/hooks/useAuth.ts`
- [x] `src/lib/supabase.ts`: Supabase JS client, isolated to this file
- [x] `src/pages/Login.tsx`
- [x] `src/pages/Register.tsx`
- [x] `src/pages/ForgotPassword.tsx`
- [x] `src/pages/ResetPassword.tsx`
- [x] `src/pages/WorkspacePicker.tsx`
- [x] `src/pages/CreateWorkspace.tsx`
- [x] `src/components/layout/Sidebar.tsx`
- [x] `src/components/layout/Topbar.tsx`
- [x] `src/components/layout/PageShell.tsx`
- [x] `src/App.tsx`: all routes, RequireAuth, RequireToken guards
**Incomplete, first task next session:**
 
- [ ] Real-time inline validation on blur for all auth page inputs
- [ ] `.invalid` CSS class applied to input when it fails validation
- [ ] Field-level error message displayed below each input
- [ ] Password strength indicator on Register and ResetPassword
- [ ] Name minimum 2 characters enforced on Register
- [ ] Final submit-time pass validates all fields before API call
**Status:** Backend complete. Frontend complete except validation.
 
---
 
### Phase 4: Risk Module

**Goal:** Full risk CRUD, scoring engine, bulk import, AI insights, PhaseOne tracking all working.

**Prerequisite:** Phase 3 complete. Complete.

**Reference files read:** RiskService.gs, RegisterAI.gs, PhaseOne.gs, RecycleBinService.gs, View_Register.html, Modal_EditRisk.html, Modal_RiskDetail.html, Modal_AI.html, Modal_Import.html, Modal_Print_Risk.html, AppJS.html (row rendering)

**Backend checklist:**

- [x] `schemas/risk.py`: RiskCreate, RiskUpdate, RiskResponse, RiskListResponse, RiskQuotaInfo, BulkImportRequest/Response, AIInsightRequest/Response, RiskStatsResponse and all sub-schemas
- [x] `services/risk.py`: list, get, create, update, delete, bulk_import, get_stats, scoring engine
- [x] `services/phase_one.py`: compute_movement, compute_freshness, log_risk_history, log_activity with cap
- [x] `services/ai_risk.py`: generate_insights via Anthropic SDK, semaphore concurrency limit 3
- [x] `services/recycle.py`: soft_delete, list_bin, get_bin_count, restore_item, permanent_delete, purge_expired
- [x] `api/v1/routes/risks.py`: GET list, GET stats, GET one, POST create, PATCH update, DELETE soft delete, POST import, POST AI
- [x] `api/v1/routes/recycle.py`: GET list, GET count, POST restore, DELETE permanent
- [x] `app/main.py`: risks and recycle routers mounted
- [x] Quota enforcement: soft warning at 80%, hard block at 100%
- [x] Bulk import: quota checked first, slots computed, skipped rows reported
- [x] Audit log entry on every create, update, delete, restore
- [x] `services/auth.py`: _ROLE_DEFAULTS added, Owner/Manager/Analyst default permissions set in token

**Frontend checklist:**

- [x] `src/types/risk.ts`: all risk TypeScript types including RiskStats
- [x] `src/utils/scoring.ts`: computeScore, levelClass, movementClass, freshnessClass
- [x] `src/services/risks.ts`: all risk and recycle bin API calls
- [x] `src/hooks/useRisks.ts`: fetch, create, update, remove, importRisks, generateAI
- [x] `src/hooks/useRecycleBin.ts`: fetch, restore, purge
- [x] `src/pages/RiskRegister.tsx`: stat cards, quota warning, toolbar (7 actions), filter bar (6 fields), table, pagination, all modals wired
- [x] `src/components/risks/StatCards.tsx`: 4 cards, CSS gauge, concentration list, control signal
- [x] `src/components/risks/RiskTable.tsx`: correct GAS columns, Risk ID + source badge, residual + delta + freshness, AI insights cell with confidence and status lines
- [x] `src/components/risks/RiskForm.tsx`: matches GAS Modal_EditRisk.html layout exactly, .row grid, no score preview, Control Effectiveness select, editId readonly field
- [x] `src/components/risks/AddRiskModal.tsx`: wraps RiskForm, clean props
- [x] `src/components/risks/EditRiskModal.tsx`: wraps RiskForm with editId, pre-populated initial values
- [x] `src/components/risks/RiskDetailModal.tsx`: sr-detail-grid layout, sr-detail-section blocks, footer with Delete + Edit
- [x] `src/components/risks/ImportModal.tsx`: 3-step wizard (Upload, Map, Review), SheetJS parsing, auto-mapping, drag-and-drop, valid/invalid preview table
- [x] `src/components/risks/AIModal.tsx`: target labels (New Risks/All Risks), confidence labels (Low/Medium/High in UI, conservative/balanced/aggressive for backend), dynamic hint text below both dropdowns, Run AI button
- [x] `src/components/risks/PrintModal.tsx`: new component, scope and format selects, Generate Report button, matches GAS Modal_Print_Risk.html
- [x] `src/components/risks/ExternalLinkModal.tsx`: new component, URL from window.location.origin + tenant UUID, Copy Link with 2s feedback
- [x] `src/components/risks/PendingSubmissionsModal.tsx`: new component, clean empty state, placeholder for Phase 9
- [x] `src/components/risks/DeleteModal.tsx`: new component, confirmation modal with risk ID and description display, red Delete button, spinner on confirm, replaces native confirm()
- [x] `src/components/risks/ImportModal.tsx`: numbered checklist in step 1, error banner tail text fixed, valid badge checkmark added, animated progress bar loading screen with stage labels and shimmer, Download Template button in footer, footer restructured to match GAS
- [x] `src/components/risks/RiskForm.tsx`: category changed to select with GAS default static list, owner changed to select populated from /api/v1/users fetch on mount
- [x] `src/components/risks/RiskTable.tsx`: residual rounded to whole number, freshness hover tooltip with state-colored background (green/amber/red), position:fixed tooltip using getBoundingClientRect to escape table overflow and prevent flicker, flashId prop wired for row flash on create and edit
- [x] `src/components/risks/RiskDetailModal.tsx`: residual rounded to whole number matching table
- [x] `src/components/recycle/RecycleBinModal.tsx`: list with restore and permanent delete
- [x] `src/components/layout/Sidebar.tsx`: Frameworks and Help nav items added, Reports renamed to Report Builder, Admin section removed, Users and Settings in flat nav, footer shows role and plan instead of email, copyright line added
- [x] `src/components/layout/PageShell.tsx`: frameworks and help routes added to ROUTE_META, audit route removed
- [x] `src/pages/RiskRegister.tsx`: PAGE_SIZE changed to 10, flashId state set on create and edit, delete modal state and handlers, toolbar icon buttons wired (link to ExternalLinkModal, bell to PendingSubmissionsModal, print to PrintModal), all new modals mounted, loading state only shows on initial load not background refresh
- [x] `src/index.css`: field-hint, btn-ai, imp-checklist, imp-loading, imp-progress-track/fill/shimmer, imp-progress-stage, fresh-wrap, fresh-badge, fresh-tip with fresh/aging/stale modifier classes, tipFade animation, duplicate fresh-tip block removed
- [x] `app/services/risk.py`: sort changed from created_at.desc() to id.asc() for stable register order, db.refresh(risk) added after db.flush() in create_risk and update_risk to resolve MissingGreenlet on updated_at
- [x] `app/api/v1/routes/users.py`: model_validate(m) removed, response dict built directly from both m (WorkspaceMember) and a (Account), fixes 500 on /api/v1/users

**Status:** Complete
 
---
 
### Phase 5: Incident Module
 
**Goal:** Full incident CRUD, AI impact analysis, AI corrective actions, category and severity suggestion.
 
**Prerequisite:** Phase 4 complete.
 
**Reference files:** `IncidentService.gs`, `IncidentAI.gs`
 
**Backend checklist:**

- [x] Migration 018: 19 missing columns added to incidents table
- [x] Migration 019: business_unit column added to lookups table
- [x] `models/incident.py` updated with all 19 new columns
- [x] `models/lookup.py` updated with business_unit column
- [x] `schemas/incident.py`: IncidentCreate, IncidentUpdate, IncidentResponse, IncidentListResponse, IncidentStatsResponse, AI schemas
- [x] `schemas/lookup.py`: LookupResponse, LookupPatch
- [x] `services/incident.py`: list, create, update, delete, get_stats, INC-YYYY-NNN ID generation, auto resolved_at on status change
- [x] `services/ai_incident.py`: generate_impact, generate_actions (DB write), suggest_category, suggest_severity (stateless), Anthropic SDK
- [x] `services/lookup.py`: get_lookups (get_or_create with defaults), patch_lookups
- [x] `api/v1/routes/incidents.py`: list, create, update, delete, stats, AI impact, AI actions, suggest-category, suggest-severity
- [x] `api/v1/routes/lookup.py`: GET /api/v1/lookups, PATCH /api/v1/lookups
- [x] `app/main.py`: risks, recycle, incidents, lookup routers all registered
- [x] Soft delete via recycle bin, reuses Phase 4 recycle service
- [x] Audit log on every write

**Frontend checklist:**

- [x] `src/types/incident.ts`
- [x] `src/services/incidents.ts`
- [x] `src/services/lookups.ts`
- [x] `src/hooks/useIncidents.ts`
- [x] `src/hooks/useLookups.ts`
- [x] `src/components/incidents/IncidentStatCards.tsx`: 4 cards matching GAS
- [x] `src/components/incidents/IncidentTable.tsx`: 7 columns matching GAS
- [x] `src/components/incidents/IncidentDetailDrawer.tsx`: view, edit, resolve, delete, AI in one srs-* drawer
- [x] `src/components/incidents/IncidentPrintModal.tsx`: scope and format selects, Generate stubbed for Phase 7
- [x] `src/components/incidents/IncidentExternalLinkModal.tsx`: copy link with Copied! feedback, backdrop close
- [x] `src/pages/Incidents.tsx`: stat cards, toolbar, filter bar, table, add drawer, all modals, owner nudge banner, Business Unit filter dynamic from lookups
- [x] `src/App.tsx`: Placeholder replaced with Incidents page
- [x] `src/index.css`: im-* stat card classes, srs-* drawer classes, inc-row--new flash, all using CSS variables
- [x] `src/index.css`: comprehensive dark mode pass covering sidebar, risk stat cards, auth pages, workspace picker, status badges, delta pills, intel badges

**Status:** Complete
 
---
 
### Phase 6: Dashboard
 
**Goal:** All KPI cards, snapshot delta indicators, activity feed, needs attention section, all loading fast.
 
**Prerequisite:** Phase 5 complete.
 
**Reference files:** `DashboardService.gs`, `SnapshotService.gs`, `PhaseOne.gs`
 
**Backend checklist:**
 
- [ ] `schemas/dashboard.py`
- [ ] `services/dashboard.py`: KPIs, risk cards, incident cards, attention list
- [ ] `services/snapshot.py`: monthly snapshot, daily snapshot, delta calculation
- [ ] `api/v1/routes/dashboard.py`: dashboard, snapshot delta, activity feed, movement summary
- [ ] All KPI aggregation done in SQL, not Python loops
- [ ] Report builder block queries run concurrently
**Frontend checklist:**
 
- [ ] `src/pages/Dashboard.tsx`
- [ ] `src/components/dashboard/KPICards.tsx`
- [ ] `src/components/dashboard/AttentionCard.tsx`
- [ ] `src/components/dashboard/ActivityFeed.tsx`
- [ ] `src/components/dashboard/RiskDistributionChart.tsx`
- [ ] `src/components/dashboard/IncidentTrendChart.tsx`
- [ ] `src/hooks/useDashboard.ts`
- [ ] `src/services/dashboard.ts`
- [ ] Skeleton loaders on all dashboard cards
- [ ] TanStack Query background refetch every 5 minutes
**Status:** Not started
 
---
 
### Phase 7: Report Builder

**Goal:** All 20 report blocks computing correctly, AI narrative generation, PDF export, email delivery.

**Prerequisite:** Phase 6 complete.

**Reference files read this session:** `Reportservice.gs` (2902 lines, fully read), `Briefservice.gs` (1058 lines, fully read), `View_ReportBuilder.html` (2610 lines, fully read)

**Backend checklist:**

- [x] `alembic/versions/020_create_report_tables.py`: migration for report_templates and report_settings tables, hand-written raw SQL, one op.execute() per DDL statement
- [x] `app/models/report_template.py`: ReportTemplate ORM model (blocks as JSONB, settings as JSONB, is_default bool, created_by string), ReportSettings ORM model (tenant_id unique, settings JSONB)
- [x] `app/schemas/report.py`: Pydantic schemas, ReportPreviewRequest, AIReportRequest, ReportExportRequest, ReportEmailRequest, TemplateSaveRequest, TemplateOut, ReportSettingsSaveRequest, SignoffSettings, ReportSettingsPayload
- [x] `app/services/report.py`: all 20 named compute blocks (exposure-index, risk-snapshot, key-risk-changes, incident-stability, ai-exec-summary, executive-commentary, exposure-trend, residual-risk-trend, risk-distribution, incident-trend, top-risks, top-emerging-risks, major-incidents, findings, recommendations, conclusion, risk-ownership, incident-analytics, executive-dashboard, key-risk-movements), BLOCK_REGISTRY dict, get_report_data entry point, template CRUD helpers (list, save, get, delete, set_default), report settings helpers (get, save with upsert)
- [x] `app/services/ai_report.py`: AsyncAnthropic SDK, generate_report_narrative function, 7 AI-capable blocks with structured prompts matching GAS generateBlockNarrative_ logic, semaphore-free asyncio.gather, safe fallback on 401 or other API error
- [x] `app/services/pdf_report.py`: ReportLab Platypus, build_pdf entry point, per-block renderers for all 20 blocks, KPI grid helper, trend bar chart using SVG Drawing, cover page, sign-off section, brand colors Navy #1F2854 and Teal #01b88e, no gradients
- [x] `app/services/email.py`: Resend API, send_report_email function, HTML summary email body matching GAS generateEmailSummaryHtml_ layout, PDF attachment as base64
- [x] `app/api/v1/routes/reports.py`: POST /preview, POST /ai-narrative, POST /export, POST /email, GET /templates, POST /templates, GET /templates/{id}, DELETE /templates/{id}, POST /templates/{id}/default, GET /settings, POST /settings. All responses follow data/error/meta envelope.
- [x] `app/main.py`: reports router registered

**Frontend checklist:**

- [x] `src/types/report.ts`: BlockKey union type (20 keys), all block data interfaces, ReportSettings, SignoffSettings, DEFAULT_SETTINGS constant, DatePreset, DateRange, BuildStep, BLOCK_LABELS map (moved from ReportPreview.tsx per Fast Refresh rule)
- [x] `src/services/reports.ts`: previewReport, generateAINarrative, exportReport, emailReport, listTemplates, saveTemplate, getTemplate, deleteTemplate, setDefaultTemplate, getReportSettings, saveReportSettings, downloadPDF helper. All functions use apiPost/apiGet without extra .data unwrap.
- [x] `src/hooks/useReports.ts`: useReports hook, full state for activeBlocks, blockData, aiData, settings, step, previewing, generatingAI, exporting, templates, loadingTpls. Actions: preview, generateAI, exportPDF, addBlock, removeBlock, reorderBlocks, updateSettings, updateSignoff, saveSettings, loadSavedSettings, updateNarrative, loadTemplates, saveTemplate, applyTemplate, deleteTemplate, getRange.
- [x] `src/components/reports/BlockSelector.tsx`: 4 groups (Executive 9 items, Visuals 4 items, Tables 4 items, Final Layer 3 items), on-canvas greyed state, click to add
- [x] `src/components/reports/ReportPreview.tsx`: per-block inline renderers for all 20 blocks, editable narrative textareas, AI callout display, AI placeholder prompt, bar chart SVG for trend blocks, level color helpers
- [x] `src/components/reports/BlockCanvas.tsx`: HTML5 native drag-and-drop reorder, remove button per block, signoff footer, previewing overlay spinner
- [x] `src/pages/ReportBuilder.tsx`: 3-panel grid layout (240px left, 1fr center, 250px right), header with date preset select (5 options including custom range), Templates dropdown (Load, Save), 3-step flow (Preview and Edit, Generate AI Narrative, Send by Email / Download PDF), SaveTemplateModal, LoadTemplateModal, EmailModal, SettingsPanel with sign-off accordion, confirm dialog for re-preview and download, auto-save settings debounced 1200ms
- [x] `src/index.css`: Report Builder CSS block appended (all .rb-* classes using CSS variables for dark mode compatibility)
- [x] `src/App.tsx`: /reports route added pointing to ReportBuilder

**Known issues and deferred items:**

- PDF layout has visual imperfections (KPI box sizing, trend chart bar proportions). Deferred to UI polish phase.
- Report Builder UI has styling gaps (spacing, mobile layout). Deferred to UI polish phase.
- key-risk-movements block always returns has_data: false. Requires a dedicated level-change history table not yet in the schema. Tracked for a future phase.
- Anthropic API key must be set in .env as ANTHROPIC_API_KEY for AI narrative to work.
- Resend API key and sender email must be set in .env as RESEND_API_KEY and RESEND_FROM_EMAIL for email delivery to work.
- Supabase SQL for the two new tables (report_templates, report_settings) is deferred to Phase 16 along with all other migrations.

**Bug fixes applied during this session:**

- SQLAlchemy Column[T] type casting added throughout services/report.py fetch functions (str() casts, type: ignore annotations per new TYPE SAFETY RULES)
- strftime("%-d") replaced with .day integer attribute in both pdf_report.py and email.py (Windows cross-platform fix)
- BLOCK_REGISTRY typed as dict[str, Any] replacing invalid dict[str, callable]
- date | None arithmetic in MTTR computation fixed by extracting to named variables with is not None checks
- Column[bool] assignment annotated with type: ignore[assignment] in set_default_template
- JSONB column return wrapped in dict() in get_report_settings
- ColumnElement[bool] comparisons replaced with str() comparison in get_template, delete_template, set_default_template
- KPI table in pdf_report.py restructured from one row two columns to two rows one column (ReportLab rowHeights mismatch)
- apiPost/apiGet envelope unwrap bug fixed in services/reports.ts, all functions removed extra .data access
- BLOCK_LABELS moved from ReportPreview.tsx to types/report.ts (Fast Refresh rule)
- Section component lifted out of FindingsBlock render scope to module scope as FindingSection
- RecommendationsBlock, MajorIncidentsTable, ExecutiveDashboardBlock, FindingsBlock unused onEdit/blockKey params removed
- SimpleTrendChart type fixed from index signature to explicit optional fields
- useReports.ts catch bindings replaced with binding-free catch { }
- repreviewing unused state removed from ReportBuilder.tsx

**Status:** Complete
 
---
 
### Phase 8: Settings, Lookups, and Notifications

**Goal:** Workspace settings, logo upload, currency selector, PIN management, lookup editor, notification preferences.

**Prerequisite:** Phase 7 complete.

**Reference files read:** `SettingsService.gs` (551 lines, fully read), `LookupService.gs` (159 lines, fully read), `View_Settings.html` (1073 lines, fully read)

**Backend checklist:**

- [x] `app/schemas/settings.py`: SettingsResponse, SettingsUpdate (all optional), PINSet with 6-digit validator, NotificationPrefResponse, NotificationPrefUpdate
- [x] `app/services/settings.py`: get_settings, update_settings (JSONB merge + top-level column writes), set_pin, remove_pin (Owner only), get_notification_prefs, update_notification_prefs, _get_or_create_pref, _build_response with all GAS defaults
- [x] `app/services/lookup.py`: complete from Phase 5, no changes needed
- [x] `app/api/v1/routes/settings.py`: GET /api/v1/settings, PATCH /api/v1/settings, POST /api/v1/settings/pin, DELETE /api/v1/settings/pin
- [x] `app/api/v1/routes/lookup.py`: complete from Phase 5, no changes needed
- [x] `app/api/v1/routes/notifications.py`: GET /api/v1/notifications/prefs, PATCH /api/v1/notifications/prefs
- [x] `app/core/exceptions.py`: ValidationError added
- [x] `app/main.py`: settings_router and notifications routers registered, ValidationError: 422 added to exception map
- [x] Logo stored in Supabase Storage bucket: `workspace-logos` public bucket. Frontend uploads directly from browser using Supabase JS client, backend stores returned public URL in tenant.logo_url. Two bucket policies required: INSERT for authenticated, SELECT for anon and authenticated.

**Frontend checklist:**

- [x] `src/types/settings.ts`: SettingsData (renamed from WorkspaceSettings to avoid naming conflict), SettingsUpdate, NotificationPref, NotificationPrefUpdate
- [x] `src/services/settings.ts`: fetchSettings, patchSettings, setPin, removePin, fetchNotificationPrefs, patchNotificationPrefs. All paths use full /api/v1/ prefix.
- [x] `src/hooks/useSettings.ts`: useSettings (query + update + setPinMutation + removePinMutation), useNotificationPrefs (query + update)
- [x] `src/store/settingsStore.ts`: Zustand store for global currency symbol. Currency updated on every patchSettings success, dispatches to all consumers without reload.
- [x] `src/pages/Settings.tsx`: 8 tabs (Workspace, Risk Config, Users & Roles, AI & Automation, Alerts, Risk Brief, My Notifications, Billing). Tab visibility via CSS class toggling, preserves form state across tab switches. RolesTab, AITab, AlertsTab, BriefTab, BillingTab all defined at module scope. Each tab calls useSettings() independently, TanStack Query deduplicates the cache. Each tab patches only its own field subset.
- [x] `src/components/settings/WorkspaceSettings.tsx`: Workspace tab and PIN tab combined. Identity form, brand colors, theme mode, logo upload via Supabase Storage, currency selector. Supabase JS client instantiated inside handleLogoChange only, not module level.
- [x] `src/components/settings/LookupEditor.tsx`: Chip-based taxonomy editor for all 8 lookup keys. Split into LookupEditorContent (inner, lazy useState from prop) and LookupEditor (outer gate). No useEffect needed. Saves full lookup object on each Save Configuration click.
- [x] `src/components/settings/NotificationPrefs.tsx`: Per-user brief frequency and opt-out. Split into NotificationPrefsContent (inner, lazy useState) and NotificationPrefs (outer gate). No useEffect needed.
- [x] PINSettings.tsx: folded into WorkspaceSettings.tsx as a section, not a separate file. PIN set and remove both in the Workspace tab.
- [x] `src/index.css`: tab-panel and tab-panel.active for CSS-driven tab visibility. brand-grid, logo-box, logo-preview, color-row, swatch, all tax-* classes (tax-card, tax-card-hd, tax-card-hd-title, tax-card-hd-actions, tax-card-bd, tax-chips, tax-chip, tax-chip-del, tax-add-row). Dark mode overrides for all new settings classes.
- [x] `src/App.tsx`: Settings route wired, Frameworks and Help routes added

**Also completed in this session (overlaps Phase 13):**

- [x] `src/pages/Frameworks.tsx`: full 7-section accordion page. Section 01 open by default. Section 06 has nested fw-fwork-card mini-accordions. All content matches GAS View_Frameworks.html exactly. No API calls. Data in module-level constants. Chevron component defined at module scope.
- [x] `src/pages/Help.tsx`: searchable FAQ accordion (one open at a time), quickstart navigation strip using useNavigate, permission matrix table, external links to docs and support. All FAQ content matches GAS View_Help.html exactly. No API calls. FAQ data in module-level FAQS array. ChevronDown and Dot components defined at module scope.
- [x] `src/index.css`: fw-* classes (all Frameworks page styles, translated to CSS variables). hlp-* classes (all Help page styles, translated to CSS variables). Responsive overrides for both.

**Bugs fixed this session:**

- setState-in-useEffect in LookupEditor.tsx and NotificationPrefs.tsx replaced with outer gate plus inner content component pattern. useEffect import removed from both files.
- Duplicate identifier `WorkspaceSettings` (interface name clashing with component import name): interface renamed to `SettingsData` in types/settings.ts. All references updated across services/settings.ts, hooks/useSettings.ts, components/settings/WorkspaceSettings.tsx, and pages/Settings.tsx.
- Frontend API paths missing /api/v1/ prefix in services/settings.ts. All six functions corrected. Settings was resolving to http://localhost:8000/settings (404) instead of http://localhost:8000/api/v1/settings.

**Status:** Complete
 
---
 
### Phase 9: External Submissions
 
**Goal:** Public risk and incident submission forms working, approval queue, return to submitter with message.
 
**Prerequisite:** Phase 8 complete.
 
**Reference files read:** `ExternalRiskService.gs` (522 lines, fully read), `DoGet.gs` (routing section confirmed), `External_Add_Risk.html` (298 lines, fully read), `External_Add_Incident.html` (662 lines, fully read)
 
**Backend checklist:**
 
- [x] `app/schemas/external.py`: ExternalRiskSubmit, ExternalIncidentSubmit, ExternalSubmitResponse, PendingSubmissionItem, PendingListResponse, PendingCountResponse, ApproveRequest, ReturnRequest
- [x] `app/services/external.py`: submit_risk, submit_incident, list_pending, get_pending_count, approve_submission (promotes to risks or incidents table in same session), return_submission. All email calls non-blocking (try/except, logged as warnings).
- [x] `app/api/v1/routes/external.py`: POST /external/submit/risk (public), POST /external/submit/incident (public), GET /external/lookups/{tenant_id} (public), GET /external/pending (auth), GET /external/pending/count (auth), POST /external/{id}/approve (auth), POST /external/{id}/return (auth). Auth endpoints use get_active_tenant.
- [x] `app/services/email.py`: send_submission_confirmation, send_approval_email, send_return_email added. Shared _ext_header, _ext_footer, _ext_wrap helpers. Branded HTML matching GAS email templates. All use existing _init() and resend.Emails.send() pattern.
- [x] `app/main.py`: external router imported and mounted at /api/v1

**Frontend checklist:**
 
- [x] `src/types/external.ts`: ExternalRiskPayload, ExternalIncidentPayload, ExternalSubmitResponse, PendingSubmissionItem, PendingListResponse, PendingCountResponse
- [x] `src/services/external.ts`: fetchPendingCount, fetchPendingSubmissions, approveSubmission, returnSubmission. Uses apiGet/apiPost from services/api.ts.
- [x] `src/hooks/useExternalSubmissions.ts`: usePendingSubmissions, usePendingCount, useApproveSubmission (invalidates external/pending, risks, incidents, dashboard on success), useReturnSubmission (invalidates external/pending on success)
- [x] `src/pages/ExternalRisk.tsx`: public form at /external/risk?workspace_id={tenantId}. No auth wrapper. Department dropdown hydrated from /external/lookups/{tenantId}?key=business_unit. Category from hardcoded GAS list. Validates all required fields with per-field highlight. Success state replaces form. Uses plain fetch (no auth token needed). Inline styles used only for one-off values (minHeight on textarea), not layout-critical or dark-mode-affected.
- [x] `src/pages/ExternalIncident.tsx`: public form at /external/incident?workspace_id={tenantId}. No auth wrapper. Category hydrated from incident_category lookup, business_unit from business_unit lookup. Teal header matching GAS. All fields from GAS External_Add_Incident.html including date, time, channel, affected asset, financial impact. Submit Another button on success state.
- [x] `src/components/risks/PendingSubmissionsModal.tsx`: full rebuild from 29-line placeholder. Live data via usePendingSubmissions. Each item shows type badge (risk/incident), category, truncated description, submitter name, email, date. Approve button calls useApproveSubmission. Return button expands an inline textarea; Send Return calls useReturnSubmission. Dismissed items removed from list client-side immediately after approve/return. Loading, error, and empty states all handled.
- [x] `src/index.css`: ext-* classes (ext-page, ext-wrap, ext-card, ext-hd, ext-bd, ext-title, ext-intro, ext-section-label, ext-grid2, ext-req, ext-divider, ext-footer, ext-success, ext-success-ico, ext-err, ext-submit-btn, ext-reset-btn, ext-input-invalid). psub-* classes (psub-list, psub-item, psub-top, psub-badge, psub-badge-risk, psub-badge-incident, psub-info, psub-cat, psub-desc, psub-meta, psub-actions, psub-approve-btn, psub-return-btn, psub-return-box, psub-send-btn, psub-item-done). All psub-* classes use CSS variables for dark mode. ext-* page classes use hardcoded light colors matching GAS public form design (public forms are always light mode).
- [x] `src/App.tsx`: ExternalRisk and ExternalIncident imported and mounted as top-level public routes at /external/risk and /external/incident, outside RequireAuth wrapper
- [x] `src/components/incidents/IncidentExternalLinkModal.tsx`: URL corrected from /submit-incident?workspace= to /external/incident?workspace_id= to match actual route and query param name

**Bugs fixed this session:**
 
- JSONB Column[Any] boolean check in services/external.py: three occurrences of `if r.payload` and `if sub.payload` replaced with `is not None`. dict() calls annotated with `# type: ignore[arg-type]` per project rule for JSONB column reads.

**Status:** Complete
 
---
 
### Phase 10: Brief Engine
 
**Goal:** All five cadences generating correct payloads, emails dispatching via Resend on schedule.
 
**Prerequisite:** Phase 9 complete.
 
**Reference files:** `Briefservice.gs`, `Briefemailservice.gs`
 
**Reference files read:** `Briefservice.gs` (1058 lines), `Briefemailservice.gs` (786 lines), `daily-risk-brief.html` (269 lines), `SnapshotService.gs` api_getDailyDeltas section

**Backend checklist:**

- [x] `app/schemas/brief.py`: BriefPayload, SignalRow, BriefTableRow, BriefTables, OutreachItem, DailyException, WeeklyDigest, BriefMeta, BriefReader, SendTestBriefRequest
- [x] `app/services/brief.py`: full payload builder, all five cadences, control and stale metrics, signal rows, outreach, suppression, tables. Translates BriefService.gs api_buildBriefPayload and all helpers
- [x] `app/services/snapshot.py`: write_daily_snapshot and get_daily_deltas appended. SnapshotDaily added to import. Per-risk daily JSONB blob into snapshots_daily
- [x] `app/services/email.py`: build_brief_html, build_brief_subject, send_brief_email appended. HTML structure matches daily-risk-brief.html template exactly
- [x] `app/api/v1/routes/brief.py`: GET /brief/preview (manage_risks), POST /brief/send-test (manage_settings)
- [x] `app/main.py`: converted to asynccontextmanager lifespan, AsyncIOScheduler registered with five jobs, brief router mounted

**Frontend checklist:**

- [x] `src/types/brief.ts`
- [x] `src/services/briefs.ts`: fetchBriefPreview, sendTestBrief
- [x] `src/hooks/useBrief.ts`: useBriefPreview, useSendTestBrief
- [x] `src/pages/Settings.tsx`: useSendTestBrief imported, testEmail and testMsg state added to BriefTab, Send Test Brief section added below Save button

**Bugs fixed post-output:**

- routes/brief.py: require_permission("risks") is not a valid key. Corrected to manage_settings (send-test) and manage_risks (preview)
- core_config.py: Settings() Pylance false positive suppressed with # type: ignore[call-arg]

**Status:** Complete
 
---
 
### Phase 11: Audit Log and User Management UI
 
**Prerequisite:** Phase 10 complete.
 
**Reference files:** `AuditService.gs`, `UserService.gs`
 
**Reference files read:** `AuditService.gs` (76 lines), `UserService.gs` (474 lines), `View_Users.html` (329 lines)

**Checklist:**

- [x] `app/api/v1/routes/audit.py`: GET /audit (filtered, paginated), DELETE /audit (Owner only), GET /audit/export.csv. Source: AuditService.gs api_getAuditLog and api_clearAuditLog
- [x] `src/hooks/useAudit.ts`: useAuditLog, useClearAuditLog (uses apiDelete), buildAuditExportUrl. AuditEntry and AuditFilters types inline
- [x] `src/hooks/useUsers.ts`: useUsers, useAddUser, useUpdateUser (uses apiPatch), useDeactivateUser (uses apiDelete), useReactivateUser. WorkspaceMember type inline
- [x] `src/pages/AuditLog.tsx`: period tabs (All Time, Today, Yesterday, Last 7 Days, Last 30 Days), module/action/user filters, paginated table, CSV export, Owner-only clear with confirm step
- [x] `src/pages/Users.tsx`: stat cards (Active, Deactivated, Limit, Plan), filter bar, user table with RoleBadge and StatusBadge, InviteModal, EditModal with deactivate and reactivate. RoleBadge, StatusBadge, InviteModal, EditModal all at module scope
- [x] `src/App.tsx`: AuditLog and Users imports added, both Placeholder routes replaced
- [x] `src/components/layout/Sidebar.tsx`: ClipboardList icon imported, Audit Log nav entry added after Users
- [x] `src/components/layout/PageShell.tsx`: /audit entry added to ROUTE_META

**Bugs fixed post-output:**

- useAudit.ts: useClearAuditLog replaced raw fetch with apiDelete. Import corrected
- useUsers.ts: useDeactivateUser replaced raw fetch with apiDelete. apiPatch import added for useUpdateUser

**Status:** Complete
 
---
 
### Phase 12: Scheduler Jobs
 
**Goal:** All APScheduler jobs registered, running on correct schedules, using Postgres job store.
 
**Prerequisite:** Phase 11 complete.
 
**Checklist:**

- [x] `app/scheduler/__init__.py`: package created
- [x] `app/scheduler/jobs.py`: five jobs defined. job_daily_snapshot (00:00 UTC, all tenants), job_monthly_snapshot (00:05 UTC on 1st, all tenants), job_recycle_purge (02:00 UTC, single-pass across all tenants), job_freshness_update (06:00 UTC, all tenants), job_brief_send (hourly 07-10 UTC, per-tenant send time check with duplicate send guard and weekend skip)
- [x] Scheduler starts in asynccontextmanager lifespan in main.py using AsyncIOScheduler
- [x] Job failure logging confirmed: all jobs wrapped in try/except with logger.exception
- [ ] Postgres job store: deferred to Phase 16 (MemoryJobStore in development)
- [ ] Manual trigger endpoints: deferred, jobs observable via logs

**Bug fixed post-output:**

- scheduler_jobs.py: purge_expired(db, tid) → purge_expired(db). Function signature takes only db, purges all tenants in one pass. Per-tenant loop removed

**Status:** Complete (Postgres job store and manual triggers deferred to Phase 16)
 
---
 
### Phase 13: Frontend Shell and Responsive Foundation
 
**Goal:** Full app shell complete, all routes wired, all viewports working for layout components.
 
**Prerequisite:** Phase 3 complete (can run in parallel with Phases 4 to 12).
 
**Note:** Much of this phase was completed as part of Phase 3. Remaining items are the toast system, 404 page, and theme toggle.
 
**Checklist:**
 
- [x] All CSS custom properties defined in `index.css`
- [x] Dark mode working via `[data-theme="dark"]`
- [ ] All four breakpoints defined and tested (manual QA in Phase 15)
- [x] Sidebar: full on desktop, icon-only collapsed on tablet, overlay on mobile
- [x] Topbar: workspace switcher, user menu
- [x] Topbar: theme toggle (cycles light, dark, auto via uiStore)
- [x] All page routes registered in `App.tsx`
- [x] Protected route wrapper implemented
- [x] Public route wrapper implemented
- [x] 404 page implemented (NotFound.tsx, nf-* CSS classes)
- [x] Toast notification system implemented (ToastProvider, ToastContext, useToast, toastContext.ts)
- [ ] Global loading state implemented (deferred, not blocking Phase 15)

**Additional items completed this session (not in original checklist):**
- [x] Sidebar collapse bugs fixed: nav-label class added to label spans, SVG path made static, logout button stays visible and centered in collapsed state with icon only
- [x] Get Started drawer built (GAS parity, 8 steps, localStorage state keyed by tenant, auto-open on first visit, pulse dot, never-show-again, reset)
- [x] Presence poll built: backend migration 021, POST /api/v1/presence/heartbeat, GET /api/v1/presence/active, usePresence hook, Topbar avatar strip with active count
- [x] Inactivity logout built: useInactivityLogout hook, activity event listeners (click, keydown, mousemove, touchstart), throttled to 5s, silent token refresh every 10 min of activity, 60s countdown warning banner, Stay signed in button
- [x] Switch workspace and Add workspace always visible in Topbar, disabled with tooltip on TRIAL plan
- [x] Report Builder date range select fixed: removed misused filter-field class and inline styles, replaced with rb-preset-select class

**Status:** Complete
 
---
 
### Phase 14: Frontend Per Module
 
**Goal:** Every page and component built, wired to API, all states handled (loading, success, error, empty).
 
**Prerequisite:** Phases 4 to 12 and Phase 13 complete.
 
**Checklist:**
 
- [x] Dashboard page complete (Phase 6)
- [x] Risk Register page complete (Phase 4)
- [x] Incidents page complete (Phase 5)
- [x] Report Builder page complete (Phase 7)
- [x] Settings page complete (Phase 8)
- [x] Users page complete (Phase 11)
- [x] Audit Log page complete (Phase 11)
- [x] External submission forms complete (Phase 9)
- [x] Recycle Bin modal complete (Phase 4)
- [x] All modals complete (Phases 4 to 9)

**Status:** Complete. All items built progressively across Phases 4 to 11. Phase 14 is closed without a dedicated session.
 
---
 
### Phase 15: Responsive Pass
 
**Goal:** Every component verified on mobile, tablet, and desktop. No overflow, no clipped modals, no broken tables.
 
**Prerequisite:** Phase 14 complete.
 
**Checklist:**
 
- [ ] Mobile (375px): all pages tested in browser (CSS fixes delivered, browser QA pending)
- [ ] Tablet (768px): all pages tested in browser (CSS fixes delivered, browser QA pending)
- [ ] Desktop (1024px): all pages tested in browser
- [ ] Wide desktop (1280px): all pages tested in browser
- [x] Risk table sticky column: CSS rule added (thead th:first-child left:0, tbody td:first-child position:sticky)
- [x] All modals full screen on mobile: .modal bottom sheet at 640px, dl-modal-back bottom sheet conversion, srs-drawer full-width, drawer full-width
- [x] All touch targets minimum 44px: btn, btn-icon, icon-btn, nav-item, filter-field inputs at 768px
- [x] Inline styles reviewed and reduced: ActivityFeed, RiskSection, Dashboard, Incidents, AuditLog, IncidentTable, ReportBuilder, BlockCanvas, ReportPreview all audited and extracted

**CSS additions (index.css):**
- Sticky first column: thead th:first-child left:0 z-index:6, tbody td:first-child position:sticky left:0
- Modal bottom sheet: .modal-backdrop padding:0 align-items:flex-end at 640px
- Drawer full-width: .drawer and .srs-drawer width:100% at 640px
- Touch targets: btn, btn-icon, icon-btn, mob-menu-btn, nav-item, filter-field inputs, topbar buttons min 44px at 768px
- filter-bar: flex-wrap:wrap at 900px (5+ fields overflow at tablet sidebar width)
- action-group, card-title, card-hd: flex-wrap:wrap at 640px
- Frameworks responsive: fw-summary-grid, fw-level-grid, fw-cols, fw-flow, fw-tags, fw-inc-grid at 768px and 480px
- inactivity-warn: flex-direction:column on mobile
- Mobile sidebar content: app.mob-open overrides restoring brand-info, nav-label, sidebar-foot, pill, brand, brand-mark, nav-item layout
- card-hd class added (was used in Incidents but undefined in CSS)
- dash-skeleton shimmer animation added (was used in Dashboard but undefined in CSS)
- pager.right variant for IncidentTable
- dash-topbar, dash-welcome, dash-topbar-right, dash-refresh, dash-refresh-ico, dash-updated
- inc-nudge (Incidents owner nudge banner)
- al-period-bar, al-period-btn, al-period-btn.active, al-pager, al-pager-btns, al-page-btn
- topbar-dd-wrap, topbar-dropdown-item:disabled
- dl-modal-*, af-*, rs-*, rp-grid-2 classes (full class families)
- rb-guide-text, rb-overlay-text, rb-date-custom input 44px, rb-header-controls horizontal scroll at 768px
- rs-grid-top with responsive collapse at 1024px and 640px
- rb-grid order fix: canvas first on tablet and mobile via CSS order property
- rb-block-body overflow-x:auto for table content
- rb-canvas-wrap position:relative moved to CSS

**Component changes:**
- `layout/Topbar.tsx`: Switch/Add workspace buttons consolidated into single "Workspace" dropdown with wsOpen state, wsRef, extended click-outside effect, topbar-dd-wrap replaces inline position:relative on user menu wrapper too
- `dashboard/ActivityFeed.tsx`: FeedRow JS hover removed, CSS :hover via af-feed-row. InsightStrip, FeedModal, DetailModal, main export all inline styles extracted to af-* and dl-modal-* classes
- `dashboard/RiskSection.tsx`: rs-grid-top applied to Row 1. All card inline styles replaced with rs-* classes. PressureModal, DistributionModal, IncidentUpsellModal all converted to dl-modal-back z-top bottom sheets. useNavigate imported, navigate wired to Risk Register CTA. RiskNarrative inline box replaced with rs-risk-narrative
- `reports/BlockCanvas.tsx`: position:relative inline removed, preview overlay text class added
- `pages/Dashboard.tsx`: DashSkeleton grid uses rs-grid-top, welcome strip uses dash-topbar classes
- `pages/Incidents.tsx`: card-hd inline styles removed (now backed by CSS), action-group for toolbar inner, inc-nudge for owner banner, Add button compact override removed
- `components/incidents/IncidentTable.tsx`: pager.right class replaces inline justifyContent flex-end
- `pages/AuditLog.tsx`: action-group for header buttons, al-period-bar and al-period-btn.active replaces 3 computed inline props, al-pager and al-pager-btns for pagination
- `pages/ReportBuilder.tsx`: rb-guide-text class, date inputs height 34 removed
- `reports/ReportPreview.tsx`: rp-grid-2 class on RiskDistribution and IncidentAnalyticsBlock

**Status:** CSS and component changes complete. Manual browser QA required to close the phase.

---

### Session 12: August 7, 2026 — Phase 15 Responsive Pass

**Completed this session:**

- Full responsive audit across all pages and components
- Mobile sidebar content bug fixed: app.mob-open overrides the global 980px rule that hid brand-info, nav-label, sidebar-foot. Sidebar now shows full content when open on mobile
- Workspace dropdown consolidated from two buttons to one "Workspace" dropdown with shared click-outside handler
- ActivityFeed modals and FeedRow fully extracted from inline styles to CSS classes
- RiskSection insight popup modals (Pressure, Distribution, Upsell) converted to dl-modal bottom sheets
- RiskSection card inline styles fully extracted to rs-* CSS classes
- Dashboard skeleton, welcome strip, AuditLog controls, Incidents toolbar extracted from inline styles
- Report Builder responsive rules: horizontal scroll for step flow, rb-grid order fix for canvas-first on mobile, rb-block-body table overflow, rb-canvas-wrap position fixed
- Risk Register CTA button in RiskSection wired with useNavigate to /risks
 
---
 
### Phase 16: QA, Hardening, and Deployment
 
**Goal:** App is production ready. All error paths tested. All indexes verified. Deployed to Render and Vercel.
 
**Prerequisite:** Phase 15 complete.
 
**Checklist:**
 
- [x] Module gating (backend): require_module("risk") and require_module("incident") added to core/dependencies.py. Applied to all 8 risk routes and all 9 incident routes. Read-only routes replace get_active_tenant directly. Mutation routes already using require_permission add require_module as a side-effect dep (_: dict = Depends(require_module(...))). FastAPI deduplicates get_active_tenant per request. (August 14, 2026)
- [x] Module gating (remaining surfaces): BlockSelector hides 4 incident blocks (incident-stability, incident-trend, major-incidents, incident-analytics) for risk-only workspaces via INCIDENT_BLOCK_KEYS Set and useAuthStore modules read. Dashboard incident section confirmed already gated in pages_Dashboard.tsx lines 101-103, no change needed. LookupEditor outer gate computes visibleKeys from modules, passes to LookupEditorContent as prop; incident_category and incident_severity hidden for risk-only; handleSave and isDirty continue to use full LOOKUP_KEYS so hidden values are never wiped from DB on save. AITab hides ai_auto_run field when workspace has no risk module; useAuthStore added to pages_Settings.tsx imports. (August 14, 2026)
- [x] Trial expiry gate: PlanExpired.tsx built, /expired route registered, services_api.ts interceptor redirects on expiry 403 message match, core_dependencies.py date comparison bug fixed. (August 14, 2026)
- [x] Trial warning banner: TrialBanner component in PageShell, 7-day amber, 2-day red with expiry explanation, per-session dismiss via useState. (August 14, 2026)
- [x] Feedback system: migration 027 (feedback table), models/feedback.py, schemas/feedback.py, services/feedback.py (DB write + Resend email to founder), routes/feedback.py (POST /api/v1/feedback), registered in main.py. Frontend: feedbackStore (Zustand), FeedbackWidget (useReducer, 90-day localStorage cooldown, slide-out GAS parity, auto-dismiss 20s, thanks state 2.2s). Mounted in PageShell. (August 14, 2026)
- [x] Feedback trigger wiring: 6 of 7 sites wired. add_risk in AddRiskModal on submit success, import_risk in ImportModal after result and autoAddToLookups complete, print_pdf in PrintModal on Generate click, ai_insights in AIModal after generation result confirmed, log_incident in Incidents handleAdd after inc confirmed, invite_user in InviteModal onSuccess callback. ai_dashboard skipped: dashboard Executive Intelligence section is statically computed, no user-triggered AI call exists in V2. useFeedbackStore import added to all 6 files. (August 14, 2026)
- [x] Permission gating: sidebar visibleNav filter (modules and permissions from claims). RequirePermission and RequireModule route guards in App.tsx wrapping /users, /settings, /audit, /risks, /incidents. useCanDo gating: RiskRegister print button (print_reports), RiskDetailModal edit and delete (manage_risks), Incidents add and print (manage_incidents, print_reports), IncidentDetailDrawer review section, save, resolve, delete (review_resolve) and AI (generate_ai), ReportBuilder download PDF and send by email disabled without print_reports. (August 14, 2026)
- [x] All API endpoints return correct envelope on success and error: ServerError added to core/exceptions.py and registered at 500 in _EXCEPTION_MAP. All 15 HTTPException raises in routes_reports.py replaced with ServerError, ValidationError, or ResourceNotFoundError. HTTPException wrapper removed from routes_external.py submit routes. services_api.ts interceptor reads .detail as fallback for any legacy HTTPException. Global catch-all Exception handler added to main.py. (August 17, 2026)
- [x] All custom exceptions map to correct HTTP status codes: confirmed. ServerError→500, ValidationError→422, ResourceNotFoundError→404, PermissionDeniedError→403, QuotaExceededError→429, WorkspaceLimitError→429. (August 17, 2026)
- [x] Rate limiting verified on auth and write endpoints: @limiter.limit added to all write routes across routes_risks.py, routes_incidents.py, routes_users.py, routes_external.py, routes_reports.py. AI routes 10/min, bulk import 5/min, external public submit 10/min, report AI+email 5/min, PDF export 10/min, regular writes 60/min. (August 17, 2026)
- [x] All transactions verified, rollback tested: confirmed clean. db.commit() in _auto_run_ai is intentional (owns its own AsyncSessionLocal session). No violations in any service or route. (August 17, 2026)
- [x] All indexes confirmed in production Supabase: migration 030 applied locally and SQL run in Supabase SQL editor. 7 new partial indexes: idx_risks_active, idx_risks_category, idx_risks_residual, idx_risks_logged_at, idx_incidents_active, idx_incidents_reported_at, idx_snapshots_month_key. (August 17, 2026)
- [ ] Trial expiry flow tested end to end
- [ ] Workspace limit enforcement tested
- [ ] Quota enforcement tested (80% warning, 100% block)
- [ ] PDF generation tested with large report (manual browser QA)
- [ ] Email delivery confirmed via Resend dashboard
- [x] Backend deployed to Render (Session 16)
- [x] Frontend deployed to Vercel (Session 16)
- [x] Environment variables set in both platforms (Session 16)
- [x] Health check passing on production URL (Session 16)
- [x] CORS verified between production frontend and backend (Session 16)
- [x] Supabase dashboard redirect URLs confirmed for password reset (Session 16)

**Additional items completed August 17, 2026 (beyond original checklist):**
- [x] Random logout bug fixed: services_api.ts 401 interceptor now attempts silent token refresh via _attemptRefresh() before logout. Shared promise prevents concurrent refresh races. Retry original request with new token on success.
- [x] ResetPassword.tsx: ready state converted from useState + useEffect to derived constant. Eliminates cascading render lint error.
- [x] Silent mutation failures fixed: useRisks create/update/remove/generateAI and useIncidents create/update/remove all rethrow after setting error state. Modal catch blocks now fire and surface actual backend message to user.
- [x] Native alert() replaced: IncidentDetailDrawer 4x alert() replaced with inline drawerError banner (auto-clears 5s). PendingSubmissionsModal 2x alert() replaced with rowError state.
- [x] Users page onError handlers: all 5 hardcoded error strings replaced with err.message from actual API response, with hardcoded string as fallback.
- [x] useReports silent catch blocks: saveSettings and loadSavedSettings now log to console.error instead of swallowing.
- [x] Offline detection: useOfflineDetection hook created (navigator.onLine + window online/offline events). Offline banner wired into PageShell. .offline-banner CSS added to index.css.
- [x] Control effectiveness dropdown fixed: CTRL_EFF in RiskForm changed from 0-100% scale to 1-5 matching GAS production system. schemas_risk.py validation updated from le=100 to le=5 on all three schema classes.
- [x] Dashboard staleTime fixed: useDashboard staleTime 30s → 5min, refetchOnWindowFocus false, refetchInterval 5min.
- [x] Dashboard parallelisation: asyncio.gather with _run() helper (separate AsyncSessionLocal per sub-function). 13 sequential DB round trips now run concurrently. pool_size=10, max_overflow=5 in db/session.py.
- [x] Lazy loading: 8 pages converted to React.lazy in App.tsx (ReportBuilder, Settings, Frameworks, Help, AuditLog, Users, ExternalRisk, ExternalIncident). Suspense boundaries added. .page-loader CSS class added. Initial bundle now contains only shell, auth pages, Dashboard, RiskRegister, Incidents.
- [x] useRisks migrated to TanStack Query: useQuery with keepPreviousData, useMutation per operation, adapter functions preserving call signatures. dataUpdatedAt exposed for stats effect dependency.
- [x] useIncidents migrated to TanStack Query: useQuery, separate non-blocking stats query, useMutation per operation. fetch and fetchStats removed.
- [x] RiskRegister updated: riskParams moved after state declarations, useQueryClient imported, all refreshKey references removed, dataUpdatedAt drives stats effect, fetchRisks call in handleGenerateAI removed, all setRefreshKey replaced by hook invalidation.
- [x] Incidents updated: incidentParams moved after state, useQueryClient imported, all fetch/fetchStats calls removed, loadPage simplified to setPage only, handleSaved and handleDeleted use qc.invalidateQueries, double-DELETE bug in handleDeleted fixed.
- [x] IncidentDetailDrawer: onDeleted prop type changed from (id: string) => void to () => void. onDeleted() call updated. Prevents accidental double DELETE.
- [x] APScheduler Postgres job store: attempted, reverted. SQLAlchemy 2.0 MissingGreenlet error in async lifespan context confirmed incompatible with APScheduler 3.x SQLAlchemyJobStore. MemoryJobStore retained. APScheduler 4.x native async upgrade flagged for future session.

**Status:** Active. Manual QA and GA4 remaining.

---

### Session 17: August 17, 2026 — Hardening, Performance, and Reliability Pass

**Completed:**

- Random logout bug fixed: token refresh intercept in services_api.ts
- ResetPassword.tsx setState-in-effect eliminated
- Global Exception handler added to main.py (envelope on all unhandled errors)
- Rate limiting applied to all write, AI, import, and public external submit routes
- Transaction discipline verified clean across all services and routes
- Quota enforcement and workspace limit enforcement verified correct
- Migration 030: 7 partial performance indexes added, snapshot month_key sort fixed. Applied locally and in Supabase.
- Dashboard staleTime corrected to 5 minutes, refetchOnWindowFocus disabled
- Control effectiveness dropdown corrected to 1-5 scale matching GAS
- ServerError added to exception system. All 15 HTTPException raises in routes_reports.py replaced with typed custom exceptions. HTTPException removed from routes_external.py.
- Silent mutation failures fixed: all hooks rethrow so modals surface backend error messages
- Native alert() calls replaced with inline error UI in IncidentDetailDrawer and PendingSubmissionsModal
- Users page onError handlers surface actual API message
- Offline detection: useOfflineDetection hook, offline banner in PageShell
- Dashboard queries parallelised: asyncio.gather with isolated sessions. pool_size raised to 10.
- Lazy loading: 8 pages split into separate chunks via React.lazy. Bundle size reduced significantly.
- useRisks and useIncidents fully migrated to TanStack Query with keepPreviousData
- RiskRegister and Incidents pages updated to declarative data flow. All imperative fetch calls removed.
- IncidentDetailDrawer double-DELETE bug fixed (onDeleted no longer re-calls remove)
- APScheduler Postgres job store attempted and reverted (async lifespan incompatibility with APScheduler 3.x)
 
---
 
## COMPLETED WORK LOG

### Session 7 starts with:

Read `SMARTRISK_V2_SETUP.md` first. Then read `SMARTRISK_V2_DECISIONS.md`. Then read this file.

**First task:** Phase 5 backend. Read `IncidentService.gs` first (wc -l, then sequential batch reads until complete). Then read `IncidentAI.gs`. Then read `View_Incidents.html`. Do not write any code until all three files are fully read. Then write `schemas/incident.py`, `services/incident.py`, `services/ai_incident.py`, and `api/v1/routes/incidents.py`. Confirm schema matches `models/incident.py` before writing services.

**Important reminders for Session 7:**
- Docker must be running: `docker compose ps`
- Venv active before uvicorn: `(venv)` in prompt
- Backend: `uvicorn app.main:app --reload --port 8000` from `backend/`
- Frontend: `npm run dev` from `frontend/`
- DATABASE_URL uses port 5433 not 5432
- Recycle service from Phase 4 is reused for incident soft delete. Import it, do not rewrite it
- db.refresh(risk) pattern applies to incidents too: add after db.flush() before model_validate in any write function
- Native type hints only, no Optional/Union/List/Dict from typing
- Never call db.begin() inside route or service functions

---

### Session 6: July 31, 2026

**Phase 4 polish and fixes:**
- AIModal: target and confidence labels aligned to GAS, dynamic hint text, Run AI button
- ImportModal: numbered checklist in step 1, error banner tail text, valid badge checkmark, animated progress bar loading screen with stage labels and shimmer effect, Download Template button, footer restructured
- RiskForm: category and owner changed from text inputs to selects, members fetched from /api/v1/users
- RiskTable: residual rounded to whole number, freshness tooltip with state-colored background, position:fixed tooltip using getBoundingClientRect, no flicker, row flash on edit and create
- RiskDetailModal: residual rounded to whole number
- RiskRegister: PAGE_SIZE 10, row flash on edit, delete confirmation modal replacing native confirm(), toolbar icon buttons wired, loading state only on initial load
- Sidebar: Frameworks and Help added, Reports renamed to Report Builder, Admin section removed, footer shows role and plan, copyright
- PageShell: ROUTE_META updated
- DeleteModal: new confirmation modal component
- PrintModal, ExternalLinkModal, PendingSubmissionsModal: all created
- Backend sort: list_risks changed to id.asc() for stable ordering
- Backend refresh: db.refresh(risk) added after flush in create and update
- Backend users route: model_validate removed, dict built from both ORM objects, fixes 500 on owner dropdown fetch
- CSS: duplicate fresh-tip block removed, all new classes added

**Decisions recorded this session:** See SMARTRISK_V2_DECISIONS.md entries dated July 31, 2026

---

### Session 5: July 30, 2026

**Phase 4 frontend (sessions 5 continued from session 4):**
- AIModal, PrintModal, ExternalLinkModal, PendingSubmissionsModal built
- Toolbar icon buttons wired
- btn-ai and field-hint CSS classes added

---

### Session 4: July 30, 2026

**GAS maintenance (not v2 code):**
- Delta signal system audited and fixed in View_Dashboard.html and View_Register.html
- Risk Health delta pill separated from band label, inversion logic corrected
- Control Signal Avg Residual arrow direction fixed
- Period label bug fixed, monthKey now always yyyy-MM string
- Hover tooltips added to all delta badges
- Polarity comments added to all delta blocks

**V2 work:**
- Phase 3 frontend validation completed on all four auth pages
- src/utils/validation.ts created
- Phase 4 backend fully complete (see Phase 4 backend checklist)
- Phase 4 frontend 65% complete (see Phase 4 frontend checklist)
- services/auth.py: _ROLE_DEFAULTS added, Owner default permissions fixed in JWT
- Sidebar switched to lucide-react icons
- PageShell route-based title derivation added

**Decisions recorded:**
- Delta polarity rules locked as product standard
- healthDelta to be dedicated API field in Phase 6
- monthKey always yyyy-MM plain string
- Snapshot delta inside main dashboard API response, not parallel call
- Freshness three levels: Fresh under 15 days, Aging 15-29, Stale 30+
- Movement labels match GAS: Increasing, Improving, Stable
- Real-time delta: compares previous residual to new residual on every update

---

### Session 12: August 7, 2026 — Settings Wiring, Risk Config, Import, Lookup Integrity

**Completed:**

**Brand and appearance wiring:**
- `src/utils/brand.ts`: hexToRgb and applyBrandColors extracted to utils (module-level, Fast Refresh safe)
- `src/store/settingsStore.ts`: logoUrl and setLogoUrl added to global Zustand store
- `src/hooks/useSettings.ts`: useEffect syncs brand colors, theme mode, and logo URL on every settings load and save. useUIStore imported for setTheme. applyBrandColors imported from utils/brand
- `src/components/layout/Sidebar.tsx`: useSettings called at sidebar level to trigger boot-time brand application. logoUrl read from settingsStore. Brand-mark renders img when logo exists, letter fallback otherwise. Industry shown below workspace name instead of plan

**Logo upload fix:**
- `app/services/settings.py`: upload_logo and _delete_logo_from_storage added. Uses httpx.AsyncClient with 30s timeout and service role key to bypass RLS. Old logo deleted before new upload. applyBrandColors extracted from useSettings to src/utils/brand.ts
- `app/api/v1/routes/settings.py`: POST /api/v1/settings/logo endpoint. Reads current logo_url via get_settings before upload to pass to upload_logo for deletion
- `src/services/settings.ts`: uploadLogo function using fetch + JWT header (not apiPost, which sets JSON content type)
- `src/components/settings/WorkspaceSettings.tsx`: supabase client removed from upload path, uploadLogo service called instead. Eye toggle on PIN fields with EyeOff/Eye from lucide-react. isDirty computed from all 11 form fields. Reset button disabled when clean, shows confirm modal (srs-confirm-* classes) when dirty. UnsavedBanner mounted at top of return when isDirty

**PIN and auth wiring:**
- `app/core/security.py`: passlib replaced with direct bcrypt. hashpw and checkpw called directly. Resolves passlib 1.7.4 + bcrypt 4.x incompatibility
- `app/schemas/auth.py`: tenant_id removed from PINVerifyRequest. Backend reads pending_tenant_id from JWT claims
- `src/pages/VerifyPin.tsx`: new page. Six individual digit boxes, auto-advance, backspace, paste support. Calls POST /api/v1/auth/verify-pin. Sets token and navigates to / on success. Clears boxes on failure
- `src/App.tsx`: /verify-pin route added. RequireAuth updated to redirect pending-PIN tokens to /verify-pin instead of /workspaces. RequireToken same guard added to prevent workspace picker loop

**Risk Config wiring (central source of truth):**
- `app/schemas/lookup.py`: LookupUsageResponse schema added
- `app/services/lookup.py`: check_lookup_usage queries risks and incidents tables. patch_lookups cascades null to risks and incidents for removed values. _USAGE_MAP defines field-to-model mapping. func and sa_update imported. type: ignore[arg-type] on all _merge_defaults column reads
- `app/api/v1/routes/lookup.py`: GET /api/v1/lookups/usage endpoint. Query import added. Must be declared before PATCH to avoid path conflict
- `src/services/lookups.ts`: checkUsage function added
- `src/hooks/useLookups.ts`: fully migrated from manual useState/useEffect to TanStack Query. Shared cache via LOOKUPS_KEY. All consumers update instantly on any patch. placeholderData uses _DEFAULTS. staleTime 5 minutes
- `src/components/settings/LookupEditor.tsx`: handleChipDelete async interceptor. HARD_BLOCK set (risk_owner). SOFT_WARN set (category, treatment, incident_category, incident_severity). Block modal uses srs-confirm-* classes, no proceed option. Soft warn modal shows count and Delete Anyway. isDirty compares local arrays against saved lookups element-by-element. UnsavedBanner mounted. handleSave syncs local from response after save. Case-insensitive duplicate chip check

**Dropdown wiring:**
- `src/components/risks/RiskForm.tsx`: CATEGORIES and TREATMENTS replaced with useLookups. Members fetch (users endpoint) removed. owner dropdown reads lookups.risk_owner. FALLBACK_CATEGORIES and FALLBACK_TREATMENTS kept as module-level fallbacks. useEffect and apiGet imports removed
- `src/pages/RiskRegister.tsx`: useLookups added. Category and treatment filter dropdowns read from lookups

**Import wiring:**
- `src/components/risks/ImportModal.tsx`: useLookups added. autoAddToLookups runs after successful import. Extracts new category, owner, treatment values case-insensitively, patches only fields with new values. Intra-file deduplication by description+category+owner before sending to backend. Result display shows duplicates count separately
- `src/hooks/useRisks.ts`: importRisks re-throws after catching with { cause: e } to propagate error to ImportModal catch block
- `src/services/api.ts`: 422 error interceptor added. Deduplicates FastAPI detail array, caps at 4 unique errors, appends +N more suffix
- `app/schemas/risk.py`: logged_at flexible validator parses 9 date formats plus Excel serial numbers, returns None silently on failure. duplicates field added to BulkImportResponse with default 0
- `app/services/risk.py`: bulk_import fetches existing (description, category, owner) tuples before loop. Intra-batch dedup via seen_in_batch set. Duplicates counted and returned separately from quota-skipped. Type ignores added on float(risk.residual), _score call, and ORM column assignments
- `src/types/risk.ts`: duplicates optional field added to BulkImportResult

**Unsaved changes banners:**
- `src/components/settings/UnsavedBanner.tsx`: new shared component. Amber banner with Save now CTA
- `src/index.css`: .unsaved-banner and .unsaved-banner-text classes added with dark mode overrides. .pin-shell, .pin-card, .pin-logo, .pin-row, .pin-box, .pin-err, .pin-ok, .pin-foot classes added
- `src/pages/Settings.tsx`: UnsavedBanner added to RolesTab, AITab, AlertsTab, BriefTab with isDirty computed per tab

**Status:** Complete

---

### Session 9: August 6, 2026 — Phase 8 Settings, Lookups, Frameworks, Help

**Completed:**

- Reference files read in full: SettingsService.gs (551 lines), LookupService.gs (159 lines), View_Settings.html (1073 lines), View_Frameworks.html (371 lines), View_Help.html (406 lines)
- `app/schemas/settings.py`: SettingsResponse, SettingsUpdate, PINSet (6-digit validator), NotificationPrefResponse, NotificationPrefUpdate
- `app/services/settings.py`: full settings CRUD, JSONB merge, PIN set/remove with Owner gate, notification prefs get/update, _get_or_create_pref helper, full GAS defaults dict
- `app/api/v1/routes/settings.py`: GET /settings, PATCH /settings, POST /settings/pin, DELETE /settings/pin
- `app/api/v1/routes/notifications.py`: GET /notifications/prefs, PATCH /notifications/prefs
- `app/core/exceptions.py`: ValidationError added
- `app/main.py`: settings_router and notifications routers registered, ValidationError mapped to 422
- `src/types/settings.ts`: SettingsData, SettingsUpdate, NotificationPref, NotificationPrefUpdate
- `src/services/settings.ts`: all six API functions with correct /api/v1/ prefix
- `src/hooks/useSettings.ts`: useSettings and useNotificationPrefs hooks
- `src/store/settingsStore.ts`: global currency Zustand store
- `src/pages/Settings.tsx`: 8 tab page. RolesTab, AITab, AlertsTab, BriefTab, BillingTab defined at module scope
- `src/components/settings/WorkspaceSettings.tsx`: identity, brand, logo upload, PIN management
- `src/components/settings/LookupEditor.tsx`: chip editor for 8 lookup keys, outer gate pattern
- `src/components/settings/NotificationPrefs.tsx`: per-user brief prefs, outer gate pattern
- `src/index.css`: tab-panel, brand-grid, logo-box, logo-preview, color-row, swatch, all tax-* classes, dark mode overrides, fw-* classes, hlp-* classes
- `src/App.tsx`: Settings, Frameworks, Help routes added
- `src/pages/Frameworks.tsx`: 7-section accordion, section 01 open by default, nested fw-fwork-card accordions, module-level data constants
- `src/pages/Help.tsx`: searchable FAQ, quickstart navigation, permission matrix table, external links
- Supabase Storage: workspace-logos bucket created (public), two policies configured (INSERT authenticated, SELECT anon + authenticated)
- Three bugs fixed: setState-in-useEffect in LookupEditor and NotificationPrefs, duplicate identifier WorkspaceSettings, missing /api/v1/ prefix in services/settings.ts
- 404 on GET /settings resolved (missing prefix bug confirmed and fixed)

**Phase 13 items completed during this session:**
- Frameworks and Help routes added to App.tsx, completing the informational page routes from Phase 13 scope

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md entries dated August 6, 2026

---

### Session 8: August 3, 2026 — Phase 6 Dashboard

**Completed:**

- `app/schemas/dashboard.py`: DashboardResponse, KPISummary, SnapshotDelta, TopRisk, TopIncident, TrendPoint, VelocityPoint, ActivityEntry, all incident summary schemas
- `app/services/snapshot.py`: compute_live_kpis, write_monthly_snapshot, get_snapshot_delta. healthDelta computed as -(avg_residual_delta)
- `app/services/dashboard.py`: Full KPI aggregation in SQL, no Python loops. All functions: _get_kpis, _risks_by_level, _risks_by_category, _top_risks, _top_open_incidents, _residual_trend, _incident_velocity, _incident_health, _total_incidents, _lifecycle, _avg_resolution, _activity_feed, _build_attention. date_trunc grouping fixed with literal_column. MTTR cast fixed with DateTime
- `app/api/v1/routes/dashboard.py`: GET /api/v1/dashboard, POST /api/v1/snapshots/run. Uses get_active_tenant dependency matching all other routes
- `app/main.py`: dashboard router registered
- `src/types/dashboard.ts`: All dashboard types. TopIncident added. financial_total on TotalIncidentsSummary. top_open_incidents on DashboardData
- `src/services/dashboard.ts`: fetchDashboard, runSnapshot
- `src/hooks/useDashboard.ts`: staleTime 30s, refetchInterval 3min, refetchOnWindowFocus true. dataUpdatedAt exposed for live ticker
- `src/pages/Dashboard.tsx`: Welcome strip with workspace name from claims, live updated-ago ticker from dataUpdatedAt, passive isFetching indicator, module-aware section routing, skeleton loader
- `src/components/dashboard/ActivityFeed.tsx`: Full rewrite. Tier-colored borders, insight strip, badge pills, 3-item initial limit, "View all" button, FeedModal, DetailModal with score movement section
- `src/components/dashboard/RiskSection.tsx`: Semicircle SVG gauge (140px container, text overlay), two delta signals, 1.2fr 1fr 1fr grid, PressureModal, DistributionModal with horizontal BarChart, IncidentUpsellModal, AreaChart trend with fill and hover insight, top 3 risks table, activity feed, executive insights with cross-insight row
- `src/components/dashboard/IncidentSection.tsx`: Built and functional. Visual gap-fill vs GAS deferred to Phase 6B
- `src/components/dashboard/UnifiedSection.tsx`: Built and functional. Visual gap-fill vs GAS deferred to Phase 6B
- `src/index.css`: Full Phase 6 dashboard CSS block appended. sr-dot and sr-band added. @keyframes spin added
- `src/hooks/useRisks.ts`: queryClient.invalidateQueries(['dashboard']) added after create, update, remove, importRisks
- `src/hooks/useIncidents.ts`: queryClient.invalidateQueries(['dashboard']) added after create, update, remove
- `src/App.tsx`: Dashboard and Incidents placeholders replaced with real pages

**Key fixes applied this session:**

- `--accent` confirmed as navy (#1F2854), `--primary` as teal (#01b88e). All teal borders corrected to use im-accent-teal or #01b88e directly
- activePayload cast pattern used in recharts AreaChart onMouseMove for TypeScript compatibility
- date_trunc grouping error fixed with literal_column for asyncpg compatibility
- avg_resolution MTTR fixed: func.cast replaced with cast(col, DateTime(timezone=True))
- Refresh button removed from Dashboard. Query invalidation handles freshness automatically

**Deferred to Phase 6B:**
- IncidentSection.tsx visual gap-fill vs GAS
- UnifiedSection.tsx visual gap-fill vs GAS

---

### Session 1: July 25, 2026
 
**Completed:**
 
- Full application audit of all 19 GAS service files and 3 GAS deployments
- Stack decision finalised: FastAPI, React, Vite, Supabase, Render, Vercel, Alembic, APScheduler, ReportLab, Resend, Anthropic SDK
- SMARTRISK_V2_SETUP.md created and fully populated
- Multi-workspace model designed: accounts, tenants, workspace_members
- Plan model corrected: TRIAL (14 days) and PAID (Annual, 365 days), no FREE tier
- Workspace limits set: 1 owned on trial, 3 owned on paid
- Risk and user limits set: 1,000 risks, 25 users per workspace
- 80% soft warning threshold defined
- Constants single-definition rule established in config.py and constants.ts
- Error handling patterns defined for backend and frontend
- Database indexing rules defined with all required indexes listed
- Transaction and rollback rules defined
- Query performance rules defined
- Responsive design rules defined: three breakpoints, behaviour per viewport
- Snippet output discipline defined: find, replace, plain English explanation mandatory
- File reading discipline defined: batch reads, wc -l first, no claims without reading
- Build phase document created
- Local development scaffold guide written for Windows, VS Code, Docker
- Project instructions text finalised
- TypeScript confirmed as frontend language, setup doc updated
- Product name corrected to SmartRisk Pulse throughout both documents
- Three module tiers confirmed: risk only, incident only, unified
**Files produced:**
- `SMARTRISK_V2_SETUP.md`
- `SMARTRISK_V2_BUILD.md`
- `SmartRisk_v2_Stakeholder_Brief.pdf`
---
 
### Session 2: July 26, 2026
 
**Completed:**
 
- VS Code settings.json fixed, two separate JSON objects merged into one
- Docker Compose configured, Postgres 16 container running on port 5433
- Discovered Windows native Postgres occupies port 5432, Docker remapped to 5433 permanently
- Backend virtual environment created with Python 3.13.5
- All Python dependencies installed from requirements.txt
- Backend folder structure created with all `__init__.py` files
- `app/core/config.py` created with all constants including module keys, pydantic-settings v2 pattern applied
- `app/db/base.py` created with SQLAlchemy declarative Base
- `alembic/env.py` configured for async with absolute `.env` path resolution using `Path(__file__)`
- Alembic `alembic current` running clean, no errors, connected to Docker Postgres
- SQLTools configured in VS Code pointing to port 5433
- Frontend scaffolded with `--template react-ts`
- Vite boilerplate cleaned up, full folder structure created
- `src/utils/constants.ts` populated with all constants
- `src/types/api.ts` populated with base envelope types, ModuleKey, PlanStage, UserRole, Permissions
- ESLint selected over Oxlint
**Decisions made this session:**
 
- Docker port: 5433, permanent for this machine
- Python version: 3.13.5, native type hints apply throughout
- `pydantic-settings` v2 `model_config = SettingsConfigDict(...)` confirmed as standard
- Absolute path for `.env` in `config.py` confirmed as standard to prevent Alembic path issues
---
 
### Session 3: July 27, 2026
 
**Completed:**
 
- Migrations 001 through 015 written and run, all tables verified in SQLTools
- asyncpg multi-statement limitation discovered on migration 015, fixed, rule added to setup doc and project instructions
- Migration 016: token_version column on accounts
- Migration 017: pin_attempts and pin_locked_until columns on tenants
- All 13 SQLAlchemy ORM models created in `backend/app/models/`
- Six security gaps identified and fixed: token versioning, type claim on JWT, PIN lockout, last owner protection, plan read from database, rate limiting
- `core/exceptions.py`, `core/security.py`, `core/rate_limit.py`, `core/dependencies.py` created
- `db/session.py` created with asyncpg driver enforcement
- `schemas/auth.py`, `schemas/user.py` created
- `services/auth.py` created with lazy-loaded Supabase client
- `services/user.py` created
- All auth, workspace, and user routes created
- `middleware/tenant.py` created
- `app/main.py` updated with CORS, middleware, exception handlers, routers
- `supabase`, `slowapi`, `email-validator` packages installed
- Supabase project created and environment variables populated
- JWT_SECRET generated
- Backend server starts clean
- `src/index.css` written by reading all 3,484 lines of GAS Styles.html first
- All frontend type files, stores, services, hooks, and pages created for Phase 3
- `src/lib/supabase.ts` created, Supabase JS client isolated to this file
- Auth pages: Login, Register, ForgotPassword, ResetPassword, WorkspacePicker, CreateWorkspace
- Layout components: Sidebar, Topbar, PageShell
- `src/App.tsx` replaced with full routing setup
- `@supabase/supabase-js` installed on frontend
- SMARTRISK_V2_DECISIONS.md created
- Sections 28 through 34 appended to SMARTRISK_V2_SETUP.md
- Project instructions merged and updated
**Decisions made this session:**
 
- asyncpg requires one `op.execute()` per DDL statement, never batch
- Supabase client lazy-loaded, not module-level
- Token versioning chosen over Redis blacklist for refresh token revocation
- PIN lockout tracked in database columns on tenants table
- Type claim added to all access tokens, verified in get_current_account
- Last owner protection added to deactivate_member
- Workspace plan limit read from database on every create_workspace call
- Inline styles permitted for simple one-off values, not for layout-critical or dark mode affected styles
- Frontend design system ported from GAS Styles.html, not written from scratch
- Password reset uses Supabase JS client, isolated to lib/supabase.ts
- One setup document rule locked: SMARTRISK_V2_SETUP.md is the sole source of truth
**Incomplete, carried forward:**
 
- Frontend validation on all auth pages: blur validation, .invalid class, field-level errors, password strength, name min 2 chars
---
 
## PHASE 6B — DEFERRED ITEMS (do before Phase 7 or after, owner decides)

These items were deprioritised in this session to unblock Phase 7. They are NOT blockers for the report builder.

- `IncidentSection.tsx`: Full visual gap-fill vs GAS incident dashboard. Cards to match: Incident Health Index, Cost Exposure, Resolution Performance, Incident Trend chart, Top Incident Drivers table, AI Insights cross-row. Read `View_Dashboard.html` incident section before touching any component.
- `UnifiedSection.tsx`: Full visual gap-fill vs GAS unified dashboard. Cards to match: Enterprise Risk Health, Risk Pressure, Incident Performance, Exposure Impact Drivers, Exposure Trend dual-axis chart, Risk and Incident Distribution donuts, Executive Intelligence. Read `View_Dashboard.html` unified section before touching any component.

---

---
 
### Session 9: August 6, 2026
 
**Completed:**
 
- Phase 9 fully built: External Submissions backend and frontend
- All four GAS reference files read in full before any code was written: ExternalRiskService.gs, DoGet.gs, External_Add_Risk.html, External_Add_Incident.html
- Confirmed GAS had no external incident pending queue (incidents wrote directly to createIncident). V2 adds a pending queue for both types for consistent security posture.
- Confirmed ResourceNotFoundError already existed in core/exceptions.py, no new exception class needed
- Confirmed get_active_tenant (not get_current_member) is the correct auth dependency. Claims dict used throughout.
- ExternalLinkModal URL format confirmed from risks_ExternalLinkModal.tsx (/external/risk?workspace_id=). IncidentExternalLinkModal URL corrected to match (/external/incident?workspace_id=).
- app/schemas/external.py created
- app/services/external.py created
- app/api/v1/routes/external.py created
- app/services/email.py updated: three new email functions added with shared HTML helper functions
- app/main.py updated: external router imported and mounted
- src/types/external.ts created
- src/services/external.ts created
- src/hooks/useExternalSubmissions.ts created
- src/pages/ExternalRisk.tsx created (public route, no auth)
- src/pages/ExternalIncident.tsx created (public route, no auth)
- src/components/risks/PendingSubmissionsModal.tsx fully rebuilt from placeholder
- src/index.css updated: ext-* and psub-* CSS classes appended
- src/App.tsx updated: two public route imports and two route entries
- src/components/incidents/IncidentExternalLinkModal.tsx updated: URL corrected
- Pylance bug fixed post-output: JSONB Column[Any] boolean check pattern applied to three lines in services/external.py
 
**Decisions made this session:**
 
- External incident submissions routed through pending queue in v2, unlike GAS which wrote directly to createIncident
- All external submissions (risk and incident) go through external_submissions table with PENDING status before analyst review
- Approval flow: create_risk or create_incident called first, then submission status updated in same get_db session. No separate transaction management needed.
- Emails are non-blocking: all three email calls wrapped in try/except, failures logged as warnings. Submission never fails because of an email failure.
- Public form pages (ExternalRisk, ExternalIncident) use plain fetch() not apiPost(). No dependency on auth store or interceptors.
- ext-* CSS classes use hardcoded light colors. Public forms are always light mode. psub-* classes use CSS variables for dark mode compatibility.
- URL standardised: /external/risk?workspace_id= and /external/incident?workspace_id= for both form types
- ItemRow defined at module scope in PendingSubmissionsModal.tsx, not inside the parent component body, per Fast Refresh and type safety rules.
 
---

### Session 10: August 6, 2026 — Phases 10, 11, 12

**Completed:**

- Phases 10, 11, and 12 closed in one session
- Reference files read in full before any code written: Briefservice.gs, Briefemailservice.gs, daily-risk-brief.html, SnapshotService.gs (getDailyDeltas section), AuditService.gs, UserService.gs, View_Users.html, services_auth.py (permission keys confirmed before wiring brief routes)

**Backend new files:**
- app/schemas/brief.py
- app/services/brief.py
- app/api/v1/routes/brief.py
- app/scheduler/__init__.py
- app/scheduler/jobs.py
- app/api/v1/routes/audit.py

**Backend modified files:**
- app/services/snapshot.py: write_daily_snapshot and get_daily_deltas appended, SnapshotDaily import added
- app/services/email.py: build_brief_html, build_brief_subject, send_brief_email appended
- app/main.py: asynccontextmanager lifespan, AsyncIOScheduler, brief and audit routers mounted
- app/core/config.py: # type: ignore[call-arg] on Settings()

**Frontend new files:**
- src/types/brief.ts
- src/services/briefs.ts
- src/hooks/useBrief.ts
- src/hooks/useAudit.ts
- src/hooks/useUsers.ts
- src/pages/AuditLog.tsx
- src/pages/Users.tsx

**Frontend modified files:**
- src/pages/Settings.tsx: Send Test Brief section added to BriefTab
- src/App.tsx: AuditLog and Users routes wired, placeholders replaced
- src/components/layout/Sidebar.tsx: Audit Log nav entry and ClipboardList icon
- src/components/layout/PageShell.tsx: /audit added to ROUTE_META

**Bugs fixed post-output:**
- routes/brief.py: permission key "risks" does not exist. Corrected to manage_settings and manage_risks
- services/brief.py: wd: dict annotation added so .get() calls resolve on sections dict values
- services/snapshot.py: dict() comprehension # type: ignore[arg-type], SnapshotDaily constructor # type: ignore[call-arg], str(latest.month_key) for existing Column[String] comparison
- scheduler/jobs.py: purge_expired called with (db) only, not (db, tid)
- useAudit.ts and useUsers.ts: raw fetch replaced with apiDelete
- core_config.py: Settings() false positive suppressed with # type: ignore[call-arg]

**Decisions made this session:**
- Brief daily delta uses snapshots_daily JSONB per-day blob. snapshot_data is dict of {risk_id: {residual, band, control_eff, mitigation_status}}. No schema change needed.
- Brief suppression counts stored as brief_suppression key in workspace_settings JSONB. No separate table.
- brief_last_sent stored as workspace_settings["brief_last_sent"] plain date string. Duplicate send guard compares against today.
- APScheduler uses AsyncIOScheduler inside FastAPI event loop. asynccontextmanager lifespan replaces on_event pattern.
- purge_expired(db) takes only a session, purges all tenants in one pass. No per-tenant loop in scheduler.
- Brief send-test gates on manage_settings (Owner only). Brief preview gates on manage_risks (all roles).
- AuditLog promoted to a dedicated page at /audit with its own sidebar entry. In GAS it was a sub-tab inside Users.
- Phase 14 closed. All page components were built across Phases 4 to 11.

### Session 11: August 6, 2026 — Phase 13 Complete

**Completed:**

- Phase 13 fully closed. All outstanding items built.
- GAS reference files read before building Get Started drawer: App.html (getStartedDrawer HTML and inline CSS) and AppJS.html (full GS state machine logic)
- GAS reference files read before building presence: App.html (presence strip HTML and JS), Styles.html (sr-presence-avatar CSS already confirmed ported to index.css)

**New files:**
- `alembic/versions/021_create_workspace_presence.py`: workspace_presence table with composite PK (tenant_id, account_id), last_seen TIMESTAMPTZ, index on (tenant_id, last_seen)
- `app/api/v1/routes/presence.py`: POST /api/v1/presence/heartbeat (upsert last_seen), GET /api/v1/presence/active (emails active in last 5 minutes). Raw SQL via text(), no ORM model
- `src/utils/toastContext.ts`: ToastContext and ToastFn type extracted to utils to satisfy Fast Refresh (component and non-component cannot share a file)
- `src/components/layout/Toast.tsx`: ToastProvider component only. Renders #toastHost portal into document.body. Auto-dismiss at 3.2s with CSS transition out
- `src/hooks/useToast.ts`: Thin hook consuming ToastContext. Compatible with ToastFn type in useReports.ts
- `src/pages/NotFound.tsx`: 404 page rendered inside PageShell (authenticated shell). Uses nf-* CSS classes. Link back to Dashboard
- `src/hooks/usePresence.ts`: Heartbeat every 90s, poll every 60s. Accepts tenantId param. Effect depends on tenantId so intervals clear when tenant changes or on logout
- `src/components/layout/GetStartedDrawer.tsx`: 8-step onboarding drawer. STEPS and StepRow at module scope (Fast Refresh). localStorage keyed by tenantId. Progress bar via --gs-pct CSS custom property. Auto-opens 1.2s after first visit. Never-show-again and Reset in footer
- `src/hooks/useInactivityLogout.ts`: Activity tracked on click, keydown, mousemove, touchstart with 5s throttle. Silent token refresh via POST /api/v1/auth/refresh every 10 min of activity. Warning banner at T-60s. Logout at T+0. stayLoggedIn() resets timers and refreshes token. All setState calls inside timer callbacks only, never in synchronous effect path

**Modified files:**
- `src/index.css`: Added topbar-user-btn, topbar-avatar, topbar-dropdown, topbar-dropdown-email, topbar-dropdown-divider, topbar-dropdown-item (missing from Phase 3). topbar-theme-btn. nf-* (404). toast.info. gs-* (Get Started drawer). presence-strip, presence-avatars, presence-count. inactivity-warn, inactivity-warn-circle, inactivity-warn-text, inactivity-warn-sub, inactivity-warn-btn, @keyframes iw-in. rb-preset-select. Collapsed sidebar-foot and btn-logout styles for icon-only logout button
- `src/App.tsx`: ToastProvider wraps entire app outside BrowserRouter. NotFound imported and added as wildcard route inside authenticated PageShell routes
- `src/components/layout/Topbar.tsx`: Theme toggle button (cycles light/dark/auto via uiStore). Presence strip (conditional on tenantId and presenceEmails.length). Get Started button with gs-pulse dot. Switch workspace and Add workspace always visible, both disabled on TRIAL with title tooltip. GetStartedDrawer mounted as Fragment sibling of topbar div. Auto-open useEffect and handleGsClose with pulse recompute via pulseVersion counter + useMemo
- `src/components/layout/PageShell.tsx`: useInactivityLogout mounted with logout callback. Inactivity warning banner rendered in Fragment when countdown is not null
- `src/components/layout/Sidebar.tsx`: nav-label class added to all label spans in nav-item buttons. SVG path on sidebar-toggle made static (was dynamic, conflicted with CSS rotation). Logout text wrapped in nav-label span so it hides on collapse. Copyright div given sidebar-copy class. Unused sidebarCollapsed destructure removed
- `app/main.py`: presence_router imported from routes.presence, registered with /api/v1 prefix
- `src/pages/ReportBuilder.tsx`: Date range select className changed from filter-field (flex column wrapper class, wrong element) to rb-preset-select. All five inline style properties removed

**Bugs fixed post-output:**
- Toast.tsx Fast Refresh violation: ToastContext and ToastFn moved to src/utils/toastContext.ts
- GetStartedDrawer.tsx: setState in useEffect body replaced with useState lazy initializer. useEffect import removed
- Topbar.tsx: gsPulse state replaced with pulseVersion counter + useMemo(computeGsPulse). Sync setState in effect eliminated
- Topbar.tsx JSX structure: return wrapped in Fragment, stray closing div removed, GetStartedDrawer placed as Fragment sibling
- Sidebar.tsx: sidebarCollapsed destructure removed (unused after SVG path fix)
- useInactivityLogout.ts: useRef(Date.now()) impure call moved inside useEffect. onLogoutRef.current assignment moved to dedicated useEffect([onLogout]). startTimers() call in effect body eliminated (now only schedules setTimeout, never calls setState directly)
- usePresence.ts: setEmails([]) in synchronous effect body removed. Guard is now early return when tenantId is empty. Topbar render guards presence strip with tenantId check

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 6, 2026

---

---

## Session: Risk Matrix Config, Scoring Bands, Filter-Responsive Stats (August 10, 2026)

**Phase:** Phase 16 — QA, Hardening, and Deployment (feature additions)

**Status:** Completed

**Summary:** Full risk matrix and scoring band system built end-to-end. Users can now configure matrix dimensions (likelihood and impact scale 1-6), band count (2-5), custom band labels, and per-band severity thresholds. All existing risks are re-scored on config save via a single bulk SQL UPDATE. Stat cards made filter-responsive. Risk level filter in register made dynamic.

**New files created:**
- `alembic/versions/022_workspace_matrix_config.py`: New table, GAS-correct defaults (1-4/5-9/10-16/17-25), seeds all existing tenants
- `alembic/versions/023_band_count_labels_level_index.py`: Adds band_count, band_1-4_label to matrix config; adds level_index and is_elevated to risks; backfills level_index from existing level strings
- `alembic/versions/024_band_5_extreme.py`: Adds band_extreme_min, band_extreme_max, band_5_label to matrix config
- `app/models/matrix_config.py`: SQLAlchemy model for workspace_matrix_config
- `app/schemas/matrix_config.py`: MatrixConfigResponse, MatrixConfigUpdate (with band-count-aware validator), MatrixConflictResponse
- `app/services/matrix_config.py`: get_config, update_config (validates scale conflicts, bulk re-classifies all risks)
- `app/api/v1/routes/matrix.py`: GET and PUT /api/v1/matrix-config
- `src/types/matrix.ts`: MatrixConfig, MatrixConfigUpdate, MATRIX_DEFAULTS
- `src/services/matrix.ts`: fetchMatrixConfig, saveMatrixConfig using apiGet/apiPut
- `src/hooks/useMatrix.ts`: TanStack Query hook, invalidates risks on save
- `src/components/settings/MatrixSettings.tsx`: Full tab component, 2-col layout, heatmap preview, preset chips, band count selector (2-5), editable band labels, contiguous validation, live legend counts

**Modified files:**
- `app/models/risk.py`: Added level_index (Integer), is_elevated (Boolean) columns
- `app/schemas/risk.py`: Added level_index, is_elevated to RiskResponse
- `app/services/risk.py`: _score() accepts MatrixConfig, returns level (label), level_index, is_elevated. GAS defaults (5/10/17) replace old incorrect constants (6/12/20). create_risk and update_risk pass cfg. bulk_import fetches cfg once and passes to each create_risk call
- `app/services/matrix_config.py`: Bulk re-classify SQL sets level, level_index, is_elevated in one UPDATE. Band 5 (Extreme) supported. is_elevated formula: max(band_count-1, 2)
- `app/schemas/lookup.py`: Removed likelihood and impact_level fields (owned by matrix config)
- `app/services/lookup.py`: Removed likelihood and impact_level from _DEFAULTS, row constructor, and LookupResponse build
- `app/services/dashboard.py`: high_risks KPI count changed from Risk.level.in_(["High","Critical"]) to Risk.is_elevated. Activity feed Column[str] reads wrapped in str() with # type: ignore
- `app/services/report.py`: Added level_index and is_elevated to RiskRow dataclass and _fetch_risks. _is_high() refactored from string matching to r.is_elevated. _HIGH_LEVELS and _LEVEL_ORDER removed. _level_index_color() added. hi_ct, me_ct, lo_ct recomputed from is_elevated and level_index. has_critical uses level_index >= 4
- `app/services/risk.py`: get_stats() accepts category, level, treatment, owner, search filter params and applies them to the query. Uses is_elevated for high_critical count. Adds deleted_at IS NULL filter (was missing)
- `app/api/v1/routes/risks.py`: get_stats endpoint accepts filter query params
- `app/main.py`: matrix_router mounted at /api/v1
- `src/services/api.ts`: apiPut<T> added (PUT equivalent of apiPost)
- `src/services/risks.ts`: getStats() accepts StatsParams, builds query string
- `src/types/risk.ts`: RiskLevel relaxed to string. level_index and is_elevated added to Risk interface
- `src/utils/scoring.ts`: levelIndexClass() added (index 1-5 to CSS class). levelClass() kept for incident severity strings. computeScore() thresholds corrected to GAS values (5/10/17)
- `src/components/settings/LookupEditor.tsx`: Removed likelihood and impact_level from LOOKUP_KEYS and LOOKUP_LABELS
- `src/components/risks/RiskForm.tsx`: useMatrix hook imported. Likelihood and impact dropdowns generate options from matrix scale (1..n). FALLBACK_SCALE removed
- `src/components/risks/RiskTable.tsx`: levelBadgeClass uses level_index (1-5) not level string. Index 5 (extreme) added
- `src/components/risks/RiskDetailModal.tsx`: Same levelBadgeClass change
- `src/pages/RiskRegister.tsx`: Stats useEffect passes active filters to getStats. Dependency array includes all filter state. cancelled guard prevents stale setState. Level filter dropdown reads band labels from useMatrix hook, highest-first
- `src/pages/Settings.tsx`: Risk Matrix tab added (id: "matrix", icon: "grid-2x2") between Workspace and Risk Config tabs. MatrixSettings panel mounted
- `src/index.css`: mx-grid, mx-card-header, mx-card-num, mx-card-title, mx-card-desc, mx-dims, mx-dims-x, mx-bands, mx-band-row, mx-band-tag, mx-dot (all 5 variants), mx-tag (all 5 variants), mx-range, mx-range-to, mx-band-note, mx-warn, mx-presets, mx-preset-label, mx-chip, mx-hm-wrap, mx-hm-yaxis, mx-hm-main, mx-hm, mx-cell (all 5 color variants including mx-cell-e), mx-hm-xlabel, mx-legend, mx-leg, mx-actions, badge.extreme, dark mode overrides, responsive 900px collapse

**Bugs fixed during session:**
- Matrix route used claims["tenant_id"] (KeyError). Changed to UUID(claims["active_tenant_id"])
- PRESETS in MatrixSettings missing band_count and label fields after type update
- _HIGH_LEVELS undefined after removal from services/report.py. hi_ct rewritten using is_elevated
- 11 remaining _is_high(r.level) call sites in report service updated to _is_high(r)
- setStatsLoading(true) called synchronously in useEffect body (React 18 cascading render warning). Removed; loading resets only in async finally callback with cancelled guard
- BandKey type missing 'extreme'. Union extended
- BAND_MINS and BAND_MAXS arrays had only 4 entries; slice(0,5) returned undefined at index 4, firing false validation warning for band 5

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 10, 2026

---

---

### Session: August 11, 2026

**Scope:** Settings wiring pass, Section 1: Users & Roles (both the Settings RolesTab and the standalone Users page).

**Completed:**

- `alembic/versions/add_perm_version_to_tenants.py`: new migration, adds `perm_version INTEGER NOT NULL DEFAULT 1` to tenants table
- `app/models/tenant.py`: `perm_version` column added
- `app/services/auth.py`: `_ROLE_DEFAULTS` removed. `_PERM_ROLE_KEY`, `_PERM_MAP`, `_PERM_DEFAULTS` dicts added. `_role_permissions()` reads perm_* from tenant.workspace_settings at token build time. `_build_workspace_token` updated to call `_role_permissions()` and bake `perm_version` into JWT. Per-member permissions JSONB still overrides role defaults
- `app/services/settings.py`: `update_settings` increments `tenant.perm_version` whenever any `perm_*` key is in the update payload
- `app/core/security.py`: `create_refresh_token` parameter kept as `int`, call sites use `# type: ignore[arg-type]`
- `app/schemas/user.py`: `reset_permissions: bool = False` added to `UpdateMemberRequest`
- `app/services/user.py`: `deactivate_member` status fixed to `"DEACTIVATED"`. `update_member` now fetches Account and writes `name`. `add_member` calls `send_invite_email` after flush inside try/except. `logging` imported and `logger` declared
- `app/api/v1/routes/users.py`: `last_login` added to list_users response dict (read from Account join already in query)
- `app/services/email.py`: `send_invite_email` function added, reuses `_ext_wrap`, branded Navy/Teal, fires via Resend
- `app/services/ai_risk.py`: `risk.level` wrapped in `str(risk.level or "")` to fix Column[str] Pylance error
- `src/hooks/useUsers.ts`: `last_login: string | null` added to WorkspaceMember interface. `reset_permissions?: boolean` added to UpdateMemberPayload
- `src/pages/Users.tsx`: imports updated (useRef, useCallback, UpdateMemberPayload). Local `useToast` hook added at module scope. `ROLE_PERM_DEFAULTS` and `PERM_LABELS` constants added at module scope. InviteModal receives toast prop, toasts on success. EditModal: selfId comparison fixed to `member.account_id`, `isLastOwner` guard removed, custom permissions toggle + 7-checkbox panel added, `reset_permissions` sent on toggle-off, toast on all success paths. Table: Last Login column added, selfId badge fixed, colSpan updated to 6. Invite button disabled at user limit with title tooltip. ToastHost mounted in main component

**Known outstanding item (not blocking):**
- `routes_audit.py` lines 79 and 127 used `require_permission("risks")` — invalid key. Fixed to `require_permission("manage_risks")` on both list and CSV export routes. Resolved August 12, 2026.

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 11, 2026

---

### Session: August 12, 2026 — Audit Log, Settings Restructure, Invite Flow, Remove Member

**Completed:**

**Audit log fixes:**
- `app/api/v1/routes/audit.py`: `require_permission("risks")` corrected to `require_permission("manage_risks")` on list route (line 79) and CSV export route (line 127). Was blocking all audit log access with 403 for all roles
- `src/hooks/useAudit.ts`: Replaced `apiGet<AuditListResponse>` with direct `api.get<PaginatedResponse<AuditEntry>>` call. `apiGet` strips the envelope to `res.data.data` only, discarding `meta`. Table always showed 0 entries regardless of DB content. Fixed by accessing both `data` and `meta` from the full response. Import updated: `api` default import added, `apiGet` removed, `PaginatedResponse` type imported from `../types/api`
- `src/pages/AuditLog.tsx`: Export CSV changed from `window.open(url)` to authenticated `api.get(url, { responseType: "blob" })` with programmatic anchor download. `window.open` cannot send the Authorization header required by the export endpoint. `api` default import added

**Audit log gap closures (actions not previously logged):**
- `app/services/recycle.py`: `permanent_delete` now accepts `deleted_by: str` param and writes a `PERMANENT_DELETE` audit entry before flush. Previously no audit trail for permanent deletions from the recycle bin
- `app/api/v1/routes/recycle.py`: `claims["email"]` now passed as `deleted_by` to `permanent_delete`
- `app/services/external.py`: `AuditLog` imported. `APPROVE` audit entry added in `approve_submission` after status flush, before email block. `RETURN` audit entry added in `return_submission` after status flush, before email block. Module field uses actual submission_type for accuracy. COMM action not logged — no COMM function exists in V2

**Settings restructure (9 tabs → 7 tabs):**
- `src/pages/Settings.tsx`: `AlertsTab` function removed (~141 lines). `alerts` and `notif` removed from TABS array. Their panel divs removed from render. `<NotificationPrefs />` added inside `BriefTab` return as a new section after Send Test Brief. `NotificationPrefs` import kept, used in new location
- `src/components/settings/NotificationPrefs.tsx`: Title changed from "My Notification Preferences" to "My Brief Preferences". Description updated to remove cross-reference to the now-removed Risk Brief tab
- Final Settings tab order: Workspace, Risk Matrix, Risk Config, Users and Roles, AI and Automation, Risk Brief, Billing

**Send Test Brief fix:**
- `app/services/brief.py`: `force_enabled: bool = False` parameter added to `build_brief_payload`. Enabled guard changed to `if not force_enabled and ws.get("brief_enabled", "off") != "on"`. Test sends previously failed whenever Brief Status was Off (the default)
- `app/api/v1/routes/brief.py`: `send_test_brief` route now passes `force_enabled=True` to `build_brief_payload`

**B2B invite flow (end-to-end, Resend only):**
- `alembic/versions/026_add_supabase_uid_to_accounts.py`: NEW migration. Adds `supabase_uid TEXT UNIQUE` to accounts table. Tracks which accounts have Supabase auth credentials vs placeholder accounts created by add_member
- `app/models/account.py`: `supabase_uid = Column(String, unique=True, nullable=True)` added
- `app/services/auth.py`: `supabase_uid=result.user.id` stored on Account row after successful `sign_up` in `register()`
- `app/services/invite.py`: NEW file. `generate_invite_token(email, tenant_id, role)` creates signed JWT (type=invite, 48h expiry, uses JWT_SECRET). `validate_invite(db, token)` decodes token, verifies tenant exists, checks `account.supabase_uid` to detect existing users. `accept_invite(db, token, password)` creates Supabase user via `admin.create_user` with `email_confirm=True`, stores `supabase_uid`, signs in, returns workspace token and refresh token. Existing-Supabase-user error handled gracefully
- `app/schemas/auth.py`: `ValidateInviteResponse` and `AcceptInviteRequest` added
- `app/api/v1/routes/auth.py`: `GET /auth/validate-invite` and `POST /auth/accept-invite` added as public routes with rate limiting. `invite_service` and `AcceptInviteRequest` imported
- `app/services/user.py`: `generate_invite_token` and `settings` imported. `add_member` now generates invite token and passes full invite link to `send_invite_email`
- `app/services/email.py`: `invite_email_cta` unused constant removed. `invite_link: str = ""` parameter added to `send_invite_email`. CTA button now uses `invite_link` variable. Button label changed from "Open SmartRisk" to "Set Up Your Account". Hardcoded GAS v1 URL removed
- `src/App.tsx`: `/accept-invite` added as a fully public route (outside all auth guards). `AcceptInvite` page imported
- `src/pages/AcceptInvite.tsx`: NEW file. Public page at `/accept-invite?token=xxx`. On mount: validates token via `GET /api/v1/auth/validate-invite`. Stage machine: loading, invalid, existing, set_password, done. New users: password + confirm fields, calls `POST /api/v1/auth/accept-invite`, stores token in authStore, navigates to `/`. Existing users: informational message, navigates to `/login?email=xxx`. Reuses `.picker-shell`, `.picker-wrap`, `.auth-field`, `.auth-error`, `.btn-navy`, `.form-error` CSS classes. No new CSS needed
- `src/pages/Login.tsx`: `useSearchParams` imported. Email field initialised from `searchParams.get('email') ?? ''` to support pre-fill from accept-invite redirect for existing users

**Remove member:**
- `app/services/user.py`: `remove_member(db, tenant_id, member_id, removed_by)` added. Deletes `WorkspaceMember` row permanently. Bumps `account.token_version` to cut active session within 15 minutes. Blocks removing the last Owner. Blocks removing yourself (enforced at route level via claims). Writes `REMOVE_USER` audit entry
- `app/api/v1/routes/users.py`: `DELETE /{member_id}/remove` added. Distinct path from existing `DELETE /{member_id}` (deactivate). No route conflict
- `src/hooks/useUsers.ts`: `useRemoveUser` mutation added calling `DELETE /api/v1/users/{id}/remove`. Invalidates users query on success
- `src/pages/Users.tsx`: `useRemoveUser` imported. `confirmRemove` state added (separate from `confirm` used by deactivate to prevent interference). `handleRemove` function added with two-step confirm. Remove button added to EditModal footer left group alongside Deactivate/Reactivate. Available for any non-self member regardless of active/deactivated status. Uses `btn-danger` with `opacity: 0.7` in default state to visually rank below Deactivate

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 12, 2026

---

### Session: August 11, 2026 — AI Settings Wiring, Policy Builder, Band 5 Fix

**Completed:**

**AI settings wiring (all five settings now enforced across all AI services):**
- `app/services/settings.py`: AIConfig TypedDict added (enabled, model, confidence, policy, auto_run). get_ai_config() fetches workspace JSONB and returns safe defaults on miss. TypedDict import added. Four new policy config defaults added (ai_policy_industry, ai_policy_tone, ai_policy_sensitivity, ai_policy_extra). Four new reads in _build_response
- `app/schemas/settings.py`: ai_policy_industry, ai_policy_tone, ai_policy_sensitivity, ai_policy_extra added to both SettingsResponse and SettingsUpdate
- `app/services/ai_risk.py`: _MODEL constant removed. _build_system(policy) helper added. _call_api accepts model and system params. generate_insights fetches ai_cfg, gates on enabled, uses ai_cfg model, falls back to ai_cfg confidence, builds policy-enriched system prompt. _CONFIDENCE_LINES key renamed aggressive to assertive
- `app/services/ai_incident.py`: _MODEL constant removed. _call_api accepts model param. generate_impact and generate_actions each fetch ai_cfg, gate on enabled, inject policy into system prompt, use ai_cfg model. suggest_category and suggest_severity gain db and tenant_id params, fetch ai_cfg, gate on enabled, use ai_cfg model. Policy not injected into suggest calls (structured classification must return fixed list values)
- `app/services/ai_report.py`: _MODEL constant removed. _call accepts model param. generate_report_narrative gains db and tenant_id params, fetches ai_cfg, gates on enabled, uses ai_cfg model, injects policy between persona prompt and FORMATTING_RULES per block
- `app/schemas/risk.py`: aggressive changed to assertive in AIInsightRequest confidence validator
- `app/api/v1/routes/incidents.py`: suggest_category and suggest_severity routes gain get_db dependency and tenant_id, pass both to service
- `app/api/v1/routes/reports.py`: generate_report_narrative call passes db and tenant_id
- `app/api/v1/routes/risks.py`: BackgroundTasks added to create_risk. _auto_run_ai background function opens its own AsyncSessionLocal session, fetches ai_cfg, returns immediately if disabled or auto_run off, otherwise calls generate_insights for the new risk. Failures logged silently

**AI settings UI (structured policy builder):**
- `src/types/settings.ts`: ai_policy_industry, ai_policy_tone, ai_policy_sensitivity, ai_policy_extra added to SettingsData
- `src/types/risk.ts`: confidence union type changed from aggressive to assertive
- `src/components/risks/AIModal.tsx`: CONF_HINTS key and select option value changed from aggressive to assertive
- `src/pages/Settings.tsx`: Module-scope constants added (INDUSTRY_OPTIONS, TONE_OPTIONS, SENSITIVITY_OPTIONS, TONE_CLAUSES). PolicyConfig interface added at module scope. assemblePolicy() function added at module scope. AITab fully replaced: policyConfig state added alongside main form, ai_policy removed from form state and computed live via assemblePolicy(). Industry chips (including workspace default fallback), tone chips (with Other + text input), multi-select sensitivity guardrail chips, 3-row additional instructions textarea, collapsible preview toggle. On save: assembled policy string and all four config keys sent in one PATCH
- `src/index.css`: ap-preview-toggle and ap-preview-body classes added with dark mode variants. Reuses existing mx-chip, mx-chip.active, mx-presets, mx-preset-label

**Band 5 matrix config restore fix:**
- `app/schemas/matrix_config.py`: band_extreme_min and band_extreme_max added to MatrixConfigResponse. Previously missing, causing the API to return undefined for these fields, which overwrote the frontend MATRIX_DEFAULTS with undefined on every load. Band 5 label restored correctly (was in response), band 5 min/max did not (were not)

**Module gating:**
- Full gap analysis completed. Documented as first item in Phase 16 checklist. Not yet built. See SMARTRISK_V2_DECISIONS.md for gap inventory

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 11, 2026

---

### Session: August 13, 2026 — Report Builder PDF Alignment, Preview Editability, Activity Feed Fix

**Completed:**

**Report Builder — AI and Automation settings integration confirmed:**
- `app/api/v1/routes/reports.py`: `_get_tenant_name` fixed to read `Tenant.industry` column (was returning empty string despite column existing). org_name now fetched and passed to `build_pdf` in both export and email routes.
- `app/services/ai_report.py`: Already correctly wired to `get_ai_config()`. No change needed.

**Report Builder — Manage Templates modal:**
- `src/hooks/useReports.ts`: `setDefaultTemplate` action added calling `reportsApi.setDefaultTemplate`. Reloads template list on success.
- `src/pages/ReportBuilder.tsx`: `ManageTemplatesModal` component added at module scope. Search filter, full table (Template, Report Type, Last Updated, Created By, Default badge, Actions), Use / Set Default / Delete actions. "New Template" closes manage modal and opens save modal. `showManageTemplates` state added. Dropdown "Manage templates" item wired.
- `src/index.css`: `rb-tpl-desc`, `rb-type-badge`, `rb-badge-default`, `rb-manage-toolbar`, `rb-manage-search`, `rb-manage-tbl`, `rb-th-actions` classes added.

**Report Builder — PDF redesign aligned to GAS reference:**
- `app/services/pdf_report.py`: Full rewrite of PDF styling and structure across multiple functions. See decisions log for detail.
  - Cover page: navy left border, Times-Bold serif title, eyebrow text, stacked small-caps metadata grid, disclaimer, navy footer bar, confidentiality chip with teal dot and border
  - Page X of N: `_make_canvas_cls` two-pass canvas class added. `doc.build(story, canvasmaker=canvas_cls)` wired.
  - Page header: org name on left (not report title). Footer removed from `_on_page`, handled by canvas class.
  - Date format: changed to "Month Day, Year" matching GAS `toLocaleDateString`.
  - KPI boxes: left border only per KPI color, `#fbfbfb` background, left-aligned. Value + unit rendered as mixed-size Paragraph markup (16pt value, 8pt unit). `prev` row added below label.
  - `_kpi_val_paragraph` helper added.
  - Executive Dashboard posture row: flattened to 2-row × 3-column table. TREND font size corrected to 20pt.
  - `_render_exposure_index`: Replaced KPI boxes with centered two-column layout. 42pt health number, colored badge pill, vertical divider, secondary exposure index at 28pt.
  - `_render_trend_chart`: bar_w capped at 12mm.
  - `_render_line_chart`: New function. Translates GAS `svgLine_()`. Area fill with `alpha=0.12`, PolyLine, Circle dots, value and label strings.
  - `_render_residual_risk_trend`: Now calls `_render_line_chart` instead of `_render_trend_chart`.
  - `_make_donut_drawing`: New function. Wedge-based donut chart with hole, center total, inline legend. Single-slice case handled with two 180-degree wedges.
  - `_render_risk_distribution`: Left column now renders donut drawing. Right column category table uses GAS-style `BY CATEGORY` muted header.
  - `_ai_callout`: `LINEAFTER` corrected to `LINEBEFORE` (right border was wrong side). `[RISK]`/`[OBSERVATION]` labels rendered as colored inline bold prefixes.
  - `_CALLOUT_LABEL_COLORS`: dict added for RISK/OBSERVATION/OPPORTUNITY/RECOMMENDATION.
  - `_parse_ai_recommendations`: New function. Parses `Action X:` format into dicts.
  - `_render_rec_card`: Priority badge inline with title. Meta row uses `·` separator. Outcome rendered as `&#10003; text`. Body spacer added. `LINEAFTER` corrected to `LINEBEFORE`. Left padding bumped to 10.
  - `_COMMENTARY_SECTIONS`: Added. `_parse_commentary` added. `_render_executive_commentary` parses Observation/Impact/Recommended Focus into separate bordered sections.
  - Non-AI block renderers: `_ai` renamed to `ai_text`, used as narrative override via `ai_text or data.get("narrative")` in risk_snapshot, key_risk_changes, exposure/residual/incident trends, risk_distribution, conclusion, risk_ownership, incident_analytics.
  - "WHAT LEADERSHIP NEEDS TO KNOW" heading forced to uppercase.
  - Impact icon changed from U+25B3 (not in Helvetica) to U+25CF (confirmed available).
  - `_render_executive_dashboard` KPI col_w: changed from hardcoded 28mm to `170mm / len(kpis)`.
  - `build_pdf`: `org_name` parameter added. `footer_text`, `show_page_numbers`, `display_name` wired. `canvas_cls` constructed and passed to `doc.build`.
- `app/api/v1/routes/reports.py`: `_get_tenant_name` called before `build_pdf` in both export and email routes.

**Report Builder — residuals rounded to whole numbers:**
- `app/services/report.py`: `round(..., 1)` changed to `round(...)` in compute_risk_snapshot, compute_residual_risk_trend, compute_findings, compute_risk_ownership. `r.residual` wrapped in `round()` in compute_top_risks and compute_top_emerging_risks.

**Report Preview — all text boxes editable after AI generation:**
- `src/components/reports/ReportPreview.tsx`:
  - `AICallout` component deleted (all call sites replaced with `NarrativeTA`).
  - `AIExecSummary`: returns `NarrativeTA` pre-filled with AI text when present.
  - `ExecutiveCommentary`: returns `NarrativeTA` pre-filled with text.
  - `TopRisksTable`: `blockKey` and `onEdit` props added. AI callout replaced with `NarrativeTA`.
  - `MajorIncidentsTable`: `onEdit` prop added. AI callout replaced with `NarrativeTA`.
  - `RecommendationsBlock`: `onEdit` prop added. When AI present, shows `NarrativeTA`. AIPlaceholder shown only when no data cards exist.
  - `ExecutiveDashboardBlock`: `onEdit` prop added. Bullet list shown pre-AI. `NarrativeTA` shown post-AI.
  - Dispatcher: `onEdit`, `blockKey` passed to all affected blocks.
  - `DonutChart`: New module-scope component. Translates GAS `svgDonut_()`. Arc path math in TypeScript. Single-slice case handled with two circles.
  - `RiskDistribution`: Replaced `BY LEVEL` table with `<DonutChart byLevel={byLevel} />`.

**ActivityFeed — insight float precision fixed:**
- `src/components/dashboard/ActivityFeed.tsx`: `buildInsightText` `score_change` case. `rise` computed via `Math.round(Math.abs(n - o) * 100) / 100`. `fmt` helper added: whole numbers display as integers, others as `.toFixed(2)`. Applied to `o`, `n`, and `rise` in template string.

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 13, 2026

---

### Session: August 14, 2026

**Scope:** Trial expiry UX, feedback system, permission gating, 403 bug diagnosis and fix.

**Bug fixed:**
- All protected routes returning 403 after workspace select. Root cause: dev workspace trial_start_date was 2026-07-30, trial expired 2026-08-13. Secondary root cause: core_dependencies.py compared datetime.isoformat() (with timezone suffix) against date.isoformat() (YYYY-MM-DD only) as strings, causing trials to expire at midnight UTC on expiry day rather than end of day. Fix: proper datetime arithmetic using date.fromisoformat() + timedelta(days=1) as the boundary.
- Dev environment fix: `UPDATE tenants SET trial_start_date = CURRENT_DATE WHERE plan = 'TRIAL'` run against local Docker DB, followed by re-login to issue a fresh token.

**Completed:**

- `app/core/dependencies.py`: trial expiry comparison rewritten from ISO string comparison to proper datetime boundary check. trial_expires_at parsed as date, boundary set to midnight UTC of the following day.
- `src/index.css`: trial warning banner CSS (trial-warn, trial-warn--amber, trial-warn--red, trial-warn-content, trial-warn-msg, trial-warn-sub, trial-warn-dismiss), expired gate page CSS (expired-page, expired-wrap, expired-brand, expired-badge, expired-icon, expired-title, expired-msg, expired-actions, expired-logout), feedback widget CSS (sr-fb-* full set, dark mode overrides). All added in Phase 16 section before Phase 15.
- `src/services/api.ts`: 403 response interceptor added. Matches exact error strings from TrialExpiredError and PlanExpiredError. Redirects to /expired. Non-expiry 403s (permission denied) fall through to normal backendMessage handler.
- `src/pages/PlanExpired.tsx`: NEW FILE. Standalone gate page outside PageShell. Reads plan from claims, switches copy between trial-ended and plan-expired variants. btn-navy CTA to mailto. Sign out clears store and redirects to login.
- `src/App.tsx`: PlanExpired imported, /expired route added outside RequireAuth. RequirePermission and RequireModule guard components added at module scope. Permissions and ModuleKey types imported. /users and /settings and /audit wrapped with RequirePermission, /risks and /incidents wrapped with RequireModule.
- `src/components/layout/PageShell.tsx`: trialDaysRemaining utility added at module scope. TrialBanner component added at module scope (reads claims via useAuthStore selector, per-session dismiss via useState, 7-day amber variant, 2-day red variant with expiry explanation). FeedbackWidget imported and mounted in fragment alongside inactivity warning. useState added to react import, useAuthStore added as import.
- Migration 027: feedback table (id UUID PK, tenant_id UUID, account_id UUID, event_key TEXT, rating INTEGER CHECK 1-5, comment TEXT nullable, created_at TIMESTAMPTZ). SQL run in Supabase editor. Alembic file: alembic/versions/027_create_feedback_table.py.
- `app/models/feedback.py`: NEW FILE. Feedback ORM model.
- `app/schemas/feedback.py`: NEW FILE. FeedbackCreate schema (event_key str, rating int ge=1 le=5, comment str | None).
- `app/services/feedback.py`: NEW FILE. save_feedback writes row, queries tenant name for email, fires _send_founder_email via Resend non-blocking (logged as warning on failure). HTML email matches GAS FeedbackService.gs design.
- `app/api/v1/routes/feedback.py`: NEW FILE. POST /feedback, requires get_active_tenant, calls save_feedback.
- `app/main.py`: feedback_router imported and registered at /api/v1.
- `app/models/__init__.py`: Feedback model exported.
- `src/store/feedbackStore.ts`: NEW FILE. Zustand store: event, label, trigger(), clear(). No persist.
- `src/components/layout/FeedbackWidget.tsx`: NEW FILE. useReducer for widget state (OPEN/CLOSE/RATE/HOVER/COMMENT/SUBMITTING/SUBMITTED actions). Checks localStorage 90-day cooldown on trigger. Slides in via sr-fb-open class. Auto-dismiss 20s timer via useRef. Thanks state for 2.2s before close. Submit errors caught silently, thanks state always shown. GAS Modal_Feedback.html parity.
- `src/components/layout/Sidebar.tsx`: visibleNav filter added. Filters NAV against claims.modules (risk, incident) and claims.permissions (manage_users for /users, manage_settings for /settings and /audit). Computed from live claims, no DOM manipulation.
- `src/pages/RiskRegister.tsx`: canPrint added (useCanDo print_reports). Print button wrapped in canPrint conditional render.
- `src/components/risks/RiskDetailModal.tsx`: useCanDo imported. canManage = useCanDo(manage_risks) added inside component. Edit and Delete buttons wrapped in canManage conditional render. Close always visible.
- `src/pages/Incidents.tsx`: useCanDo imported. canManageInc (manage_incidents) and canPrint (print_reports) added. Add Incident and Print buttons wrapped in respective conditionals.
- `src/components/incidents/IncidentDetailDrawer.tsx`: useCanDo imported. canReview (review_resolve) and canAI (generate_ai) added inside component. Review Actions section wrapped in canReview. Save, Mark as Resolved, Delete footer buttons wrapped in canReview. AI button disabled when !canAI.
- `src/pages/ReportBuilder.tsx`: useCanDo imported. canPrint (print_reports) added. Download PDF and Send by Email buttons gain disabled={...|| !canPrint} and title tooltip for role explanation.

**Confirmed wired (no changes needed):**
- Settings Roles tab correctly writes all perm_* fields to workspace_settings. Backend increments perm_version on any perm_* save. _role_permissions() reads them at token build time. Full chain confirmed.
- Per-member custom permissions in Edit User modal: customPerms toggle sends body.permissions or body.reset_permissions. services/user.py handles both. _build_workspace_token checks member.permissions is not None first. Full chain confirmed.

**Deferred to next session:**
- Feedback trigger wiring at 7 sites (event keys and component locations documented in DECISIONS.md).
- Backend require_module enforcement on risk and incident routes.
- Remaining module gating surfaces: report block selector, dashboard sections, LookupEditor taxonomy keys, AI tab auto-run field.

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 14, 2026

---

### Session 15: August 14, 2026 — Phase 16 Logo, Module Enforcement, Feedback Triggers, Module Gating

**Completed:**

- `frontend/index.html`: favicon replaced from /favicon.svg to confirmed product logo URL. Shortcut icon link added to match GAS App.html pattern.
- `app/services/email.py`: _PRODUCT_LOGO module-level constant added. _ext_header() updated to include product logo image alongside org name in all outbound email headers.
- `app/core/dependencies.py`: require_module() function added following require_permission() pattern. Reads modules list from JWT claims. Returns claims dict. Raises PermissionDeniedError if module not present.
- `app/api/v1/routes/risks.py`: require_module imported. Applied to all 8 routes. list_risks, get_stats, get_risk replace get_active_tenant with require_module("risk"). bulk_import, generate_ai_insights, create_risk, update_risk, delete_risk add _: dict = Depends(require_module("risk")) alongside existing require_permission.
- `app/api/v1/routes/incidents.py`: require_module imported. Applied to all 9 routes. get_stats, list_incidents replace get_active_tenant with require_module("incident"). create_incident, update_incident, delete_incident, generate_impact, generate_actions, suggest_category, suggest_severity add _: dict = Depends(require_module("incident")).
- `src/components/risks/AddRiskModal.tsx`: useFeedbackStore imported. trigger('add_risk', ...) fires on submit success before onClose().
- `src/components/risks/ImportModal.tsx`: useFeedbackStore imported. trigger('import_risk', ...) fires after result confirmed and autoAddToLookups completes.
- `src/components/risks/PrintModal.tsx`: useFeedbackStore imported. trigger('print_pdf', ...) fires on Generate button click before onGenerate().
- `src/components/risks/AIModal.tsx`: useFeedbackStore imported. trigger('ai_insights', ...) fires after result confirmed.
- `src/pages/Incidents.tsx`: useFeedbackStore imported. trigger('log_incident', ...) fires in handleAdd after inc confirmed.
- `src/pages/Users.tsx`: useFeedbackStore imported. trigger('invite_user', ...) fires in InviteModal onSuccess callback before toast and onClose.
- `src/components/reports/BlockSelector.tsx`: useAuthStore imported. INCIDENT_BLOCK_KEYS Set defined at module scope. Component reads modules from authStore, filters GROUPS items, suppresses empty groups. Incident blocks hidden for risk-only workspaces.
- `src/components/settings/LookupEditor.tsx`: useAuthStore imported. LookupEditorContent gains visibleKeys prop. Outer LookupEditor gate computes visibleKeys from modules. incident_category and incident_severity hidden for risk-only. handleSave and isDirty continue to use full LOOKUP_KEYS.
- `src/pages/Settings.tsx`: useAuthStore imported. AITab reads hasRisk from modules. ai_auto_run field wrapped in hasRisk conditional render.
- `src/pages/Login.tsx`: auth-brand-icon SVG replaced with product logo img (40x40).
- `src/pages/Register.tsx`: same fix (40x40).
- `src/pages/ForgotPassword.tsx`: same fix (40x40).
- `src/pages/ResetPassword.tsx`: same fix (40x40).
- `src/pages/WorkspacePicker.tsx`: picker-brand-icon SVG replaced with product logo img (36x36).
- `src/pages/CreateWorkspace.tsx`: same fix (36x36).
- `src/pages/AcceptInvite.tsx`: same fix (36x36).
- `src/pages/PlanExpired.tsx`: expired-brand-icon SVG replaced with product logo img (36x36). Stray closing div removed that was orphaning the brand name span outside the brand container.

**Confirmed no change needed:**
- `src/pages/Dashboard.tsx`: dashboard module gating already complete at lines 101-103. IncidentSection already gated behind hasIncident and !isUnified. No modification required.
- `src/pages/VerifyPin.tsx`, `src/pages/NotFound.tsx`: no brand icon present.

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 14, 2026 (Session 15).

---

### Session 14: August 14, 2026 — Phase 16 Risk Register QA and Feature Completions

**Completed this session:**

- `alembic/versions/028_add_source_to_risks.py`: new migration. Adds source VARCHAR NOT NULL DEFAULT 'internal' to risks table. One op.execute() call. Supabase SQL provided.
- `app/services/auth.py`: last_login fix. datetime and timezone added to imports. account.last_login = datetime.now(timezone.utc) + db.add + await db.flush() written after account fetch in login(), before token construction.
- `app/models/risk.py`: source = Column(String, nullable=False, server_default='internal') added before level_index.
- `app/schemas/risk.py`: source: str | None = None added to RiskCreate. source: str = 'internal' added to RiskResponse. AIInsightRequest confidence changed from str = 'balanced' to str | None = None. Confidence validator updated to accept None and return early.
- `app/services/risk.py`: source=payload.source or 'internal' added to Risk() constructor in create_risk().
- `app/services/external.py`: source='external' added to RiskCreate payload in approve_submission() for risk-type submissions.
- `app/api/v1/routes/risks.py`: page_size Query cap raised from le=200 to le=1000 to support full-register CSV export.
- `src/types/risk.ts`: source: string added to Risk interface. confidence removed from AIInsightRequest. risk_ids made optional.
- `src/index.css`: .notif-count class added before .gs-pulse. Absolute positioned teal pill badge for numeric notification counts.
- `src/components/risks/RiskTable.tsx`: aiFlashIds?: Set<string> and selectedIds: Set<string>, onToggle, onToggleAll added to Props and destructuring. Checkbox column added as first column with select-all header. Row className ORs flashId and aiFlashIds for row-flash. Source badge is now data-driven: teal for 'external', blue for 'internal'.
- `src/components/risks/AIModal.tsx`: AIInsightRequest import removed. UITarget type ('new' | 'filtered' | 'selected') added at module scope. Props updated: selectedCount, filteredCount added, onGenerate signature changed to uiTarget opts. Confidence state and CONF_HINTS removed. Target select now renders New Risks, Filtered Risks (count), Selected Risks (disabled when none checked). Confidence select removed entirely.
- `src/pages/RiskRegister.tsx`: useNavigate, useToast, usePendingCount, listRisks, AIInsightRequest, AIInsightResult added to imports. pendingCount derived from usePendingCount. selectedIds: Set<string> state added. handleToggle and handleToggleAll added as useCallback. aiFlashIds: Set<string> state added. handleGenerateAI: resolves uiTarget to backend AIInsightRequest (filtered calls listRisks to get all IDs, selected uses Set, new uses target empty), awaits fetchRisks directly after generateAI to ensure table is refreshed before modal shows success, sets aiFlashIds from updated_ids with 2400ms clear, keeps setRefreshKey for stats. handlePrint: both 'all' and 'filtered' scopes call listRisks with page_size 1000, filtered spreads current filter params, risks array never used as CSV source, PDF scope toasts and navigates to /reports. Bell button renders .notif-count badge when pendingCount > 0. RiskTable receives aiFlashIds. AIModal receives selectedCount, filteredCount, onGenerate: handleGenerateAI. PrintModal receives onGenerate: handlePrint.

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 14, 2026

---

## NEXT SESSION STARTS WITH

Read `SMARTRISK_V2_SETUP.md` first. Then read `SMARTRISK_V2_DECISIONS.md`. Then read this file.

**First task:** Supabase schema sync. User uploads all Alembic migration files (001 through 028). Read each file, extract raw SQL from every op.execute() call in sequence, output as a single ordered script ready for the Supabase SQL editor. Migration sequence ends at 028. Next migration number is 029.

**Second task:** CI setup. Create .github/workflows/ci.yml at repo root (monorepo, backend/ and frontend/ in one repo). Two jobs: backend-ci triggers on changes to backend/**, runs ruff check and pytest against a GitHub Actions Postgres service container. frontend-ci triggers on changes to frontend/**, runs tsc --noEmit and npm run build. Create backend/conftest.py and backend/pytest.ini. Write core test suite of approximately 20 tests covering: auth (login returns token, bad credentials return 401), risk CRUD (create, list, update, soft delete), incident CRUD (same), settings read and write, report PDF does not crash on minimal payload, permission enforcement (Analyst blocked from manage_settings routes).

**Third task:** GitHub push. Then confirm Render auto-deploy triggered for backend and Vercel auto-deploy triggered for frontend.

**Fourth task:** QA pass. Manual browser QA of all 20 PDF blocks with a fully populated workspace. Responsive check at 375px, 768px, 1024px, 1280px.

**Pending:** GA4 integration. User to provide Measurement ID (G-XXXXXXXXXX). Add gtag script block to frontend/index.html when provided.

**Performance QA agenda (next session):**
- EXPLAIN ANALYZE on dashboard, risk list, report data endpoints
- Index audit against actual query patterns
- Connection pool tuning for transaction pooler
- Response caching for lookups, settings, matrix config
- TanStack Query stale times and cache strategy review
- Bundle size audit: npm run build -- --analyze
- Lazy loading for Report Builder and Frameworks pages

Note: routes/risks.py and routes/incidents.py were both modified this session (module gating). Read them fresh if any further changes are needed next session.

Outstanding Report Builder items for QA phase:
- PDF Risk Distribution donut chart direction (visual-only, does not affect correctness)
- PDF Exposure Trend bar chart alignment when only 2 monthly snapshots exist (sparse data)
- Manual QA pass of all 20 PDF blocks with a fully populated workspace recommended before client demo

**Invite flow known edge case:** If an invited user tries to self-register with the same email before clicking the invite link, `register()` finds their existing Account (created by `add_member`), finds `member_count > 0`, and raises DuplicateResourceError. They are told to sign in instead. Since they have no password yet, this is a dead end. Resolution: they must use the invite link. The edge case is rare and acceptable for the current build. Flag for Phase 16 UX review if reported.


---

## Session Log — Bug Fixes, Dashboard Parity, PDF Report Parity Pass (August 22, 2026)

### Completed this session

**routes_risks.py — duplicate POST /risks/ai route removed**
- Removed the stale first handler that was passing AIInsightRequest into risk_service.bulk_import, which accessed .rows and threw AttributeError. Surviving handler calls ai_risk_service.generate_insights with correct permission and rate limiter wired.

**dashboard signal arrows reintroduced**
- DeltaBadge in dashboard_IncidentSection.tsx and dashboard_UnifiedSection.tsx updated to render ▲ +X% / ▼ X% format matching GAS _applyDeltaBadge. period prop added for native title tooltip on hover.
- RiskSection delta arrows already in place and confirmed correct. No change needed.
- Arrows suppressed correctly when has_data is false or value is null.

**30-Day Action Plan owner persistence**
- assignedOwners state lifted from ActionPlanModal (where it was destroyed on close) to ExecInsightCard where it survives modal open/close cycles.
- Identity pattern: owners stored alongside the summary string they were assigned against. If data.summary changes (new AI generation), assignedOwners resolves to {} automatically during render with no useEffect, avoiding the cascading-renders lint violation.
- setOwner stamps the current data.summary onto ownersState so the identity check passes on subsequent renders.

**Dashboard visual parity — Level colors and table headers**
- LEVEL_COLORS hardcoded map replaced with levelTextColor() function using case-insensitive matching and correct design system colors from index.css level classes.
- dash-tbl th padding corrected from 6px 10px to 10px 14px, font-weight from 600 to 700, matching GAS .sr-table thead th.
- dash-tbl td left/right padding corrected from 10px to 14px.
- TOP RESIDUAL RISK DRIVERS table column header changed from ID to Risk ID in both pressure modal and main dashboard table.

**PDF report parity pass — all risk module blocks**
- Systematic section-by-section comparison of GAS Reportservice.gs HTML output against ReportLab services_pdf_report.py. Every disparity recorded and patched.
- Cover page: corner accent, chip dot color, chip padding, meta key color and cell padding, meta border rules (LINEABOVE/LINEBELOW/LINEBEFORE replacing GRID), footer padding, brand font size, confidentiality text color.
- Shared helpers: _kpi_val_paragraph value font corrected to 15pt markup, label color to #555555, cell padding to 8pt/10pt. _ai_callout padding corrected to 12pt/14pt. _S["body"] color corrected to #333333. _S["ai_text"] color to #333333, leading to 16pt.
- exposure-index: health number 42pt → 35pt, badge background dynamically colored at 13% opacity, subtitle colors corrected to #94a3b8, exposure number 28pt → 23pt.
- risk-snapshot, key-risk-changes, incident-stability: all use corrected _kpi_table. Minus sign on Risks Decreased corrected to U+2212.
- executive-dashboard: no-data styled box, direction arrows on KPIs, posture label/value font corrected (8pt→10pt, 20pt→13pt), posture padding, GRID removed from posture row, bullets heading corrected (8pt MUTED → 10pt NAVY), bullet text 11pt #334155, dot right padding, separator color.
- executive-summary: ai_callout padding fixed (cascades to all callout sites).
- executive-commentary: section icons corrected (Impact △, Recommended Focus ✓), section padding 6→8pt, body color #334155, fallback text and style corrected.
- key-risk-movements: full has-data branch implemented. _level_badge_cell helper added. Period note, section headings, escalations/reductions (with previous level text color and current badge), new risks/removed risks tables all rendered.
- risk-ownership: numeric columns centered, left padding corrected to 6pt.
- risk-distribution: ORDER reads band_labels from data payload. Column widths corrected 82/84mm → 94/76mm (55%/45% GAS split). LEVEL_COLORS replaced with _BAND_COLORS_BY_POS (position-based, label-agnostic).
- top-risks, top-emerging-risks: level column uses _level_badge_cell, residual centered, trend arrows colored.
- findings: section heading corrected, dot right padding added, row padding 2→4pt, separator color corrected.
- recommendations plain path: two-column teal-numbered rows matching GAS .rec-row pattern.
- conclusion: explicit leading 14pt.

**Matrix-aware risk distribution**
- MatrixConfig imported and added to ReportContext as optional field.
- build_context fetches MatrixConfig for the tenant.
- compute_risk_distribution reads matrix band labels from ctx.matrix_config and includes band_labels in output payload.
- _render_risk_distribution reads band_labels from data with fallback.
- _make_donut_drawing rewritten to use position-based colors (_BAND_COLORS_BY_POS) keyed by ORDER index, not label string. Fully label-agnostic.

**Matrix gaps audit completed**
- Full audit of both services_report.py and services_pdf_report.py for all hardcoded label references that should be matrix-config-aware. Six gaps in services_report.py (compute_risk_snapshot label lookups, missing level_index in top-risks/top-emerging-risks, narrative hardcoded labels), two gaps in pdf_report.py (_level_badge_cell and _level_color string matching). Patches written but not yet applied — deferred to next session with fresh file state.

**Font swap flagged for dedicated pass**
- GAS uses Arial (body) and Georgia (cover title). ReportLab uses Helvetica/Times-Bold as nearest equivalents. Decision: flag for a dedicated font swap pass once TTF files (Arial.ttf, Arial Bold.ttf, Arial Italic.ttf, Georgia.ttf, Georgia Bold.ttf) are confirmed available in the repo. Registration code and global font name swap are ready to write.

### Next session begins with
- Paste current live state of services_report.py and services_pdf_report.py for fresh read before writing any code.
- Apply matrix gap patches: compute_risk_snapshot label lookup fix, level_index added to compute_top_risks/compute_top_emerging_risks, _level_badge_cell updated to accept level_index for position-based colors.
- Apply remaining PDF rendering patches from session audit: findings, recommendations plain path, risk table level badge, conclusion leading — confirm which are already in live file before patching.
- Font swap pass when TTF files are confirmed.

---

## Session Log — Frontend Visual Parity Pass + Executive Insights AI Rewrite (August 21, 2026)

### Completed this session

**Global typography fix**
- Dropped blanket `font-weight: 600` on `body`, `button/input/select/textarea`, and `table/th/td` to `400`, matching GAS V1 which sets no global font-weight. All component-specific weights remain untouched.

**Dashboard card hover animations**
- Added `transition: box-shadow .22s ease, transform .22s ease` and `:hover { transform: translateY(-4px) }` to `.im-card` and `.sr-top-strip .sr-card`.
- Added `:has()` suppression for `.im-card` containing `.af-feed-row` or `.ap-plan-link` to prevent flicker caused by the card lift shifting interactive children under the cursor.

**Risk Health gauge**
- Increased strokeWidth from 10 to 16 (then 24) and reduced r from 90 to 88 to maintain viewBox clearance, matching V1 visual weight.
- Added mount sweep animation: `useState(0)` for `animatedFill`, `useEffect` sets real fill after 50ms so CSS transition plays on load.

**Dashboard card cleanup**
- Removed `im-accent-teal` from Risk Health card.
- Removed `im-accent-navy` from Executive Insights card.
- Removed Needs Attention card block entirely.

**Operational Intelligence Feed**
- Added `af-live-dot` sonar ping animation (`@keyframes livePing 1.8s ease-out infinite`) alongside Live badge.
- Fixed View all count to `Math.min(items.length, 10)` matching the `slice(0, 10)` modal cap.

**Activity Detail modal**
- Rounded `old_value` and `new_value` in score movement display to whole numbers via `Math.round()`.

**Welcome line**
- Replaced ✨ emoji with Lucide `Sparkles` icon (14px, teal #01b88e).

**Health status badge**
- Added `neutral` class to `healthStatusCls` for Monitoring range (51-75). `.sr-delta.neutral { background: #f8fafc; color: #94a3b8; }` matching V1 base sr-delta.

**Residual Risk Trend chart**
- Lightened line stroke from `#1F2854` to `#94a3b8`.
- Reduced dot sizes: regular r:3, activeDot r:5.

**Modal system**
- Added `dl-modal.lg` at `min(700px, 94vw)` and `dl-modal.xl` at `min(860px, 96vw)`.
- Switched PressureModal and DistributionModal to `lg`. ActionPlanModal uses `xl`.

**Risk Register fixes**
- Removed `%` from control effectiveness in `RiskDetailModal`.
- Wrapped score delta in `Math.round` in `RiskTable`.
- Added `text-transform: uppercase` to `.sr-top-strip .sr-label`.
- Increased `.sr-intel` `margin-top` from 6px to 14px.

**Executive Insights styling**
- Set narrative box background to `#f8fafc` matching V1 `--sr-gray-50`.
- Set footer text color to `#94a3b8` matching V1 `--sr-muted`.

**Control signal scale fix (backend, two locations)**
- `services/risk.py`: `avg_eff` multiplied by 20 to convert 1-5 scale to 0-100%.
- `services/dashboard.py`: `control_effectiveness_avg` also multiplied by 20. Both locations were computing raw 1-5 averages and displaying them as percentages.

**MatrixSettings preset persistence fix**
- Added `detectPreset(data)` helper comparing saved config against each preset's values.
- Called on `query.data` init and `handleReset`. Previously always reset to `'smartrisk'` on remount.

**Executive Insights AI rewrite (spec: executive-insights-dev-brief.pdf)**
- New `app/services/ai_executive.py`: derives trend, top risk, exposure reductions (deduplicated by risk_id to mitigate OI feed duplicate-entry bug), high-pct, and distinct owners list from existing dashboard data. Calls `claude-haiku-4-5` with 50-word 4-sentence system prompt. Returns `ExecInsightResponse` with summary HTML, action items, word count, and owners list.
- New `GET /api/v1/dashboard/exec-insights` endpoint in `routes/dashboard.py`.
- `ActionItem` and `ExecInsightResponse` (with `owners: list[str]`) added to `schemas/dashboard.py`.
- Frontend `ExecInsightCard` replaces static `RiskNarrative`. Uses TanStack Query with 30-min staleTime. Loading and error states handled.
- `ActionPlanModal`: 4 action items mapped 1:1 to summary sentences, Done-when criteria, owner dropdown per item (values from risk register owners, not persisted), Export as PDF button (opens new window with formatted HTML and triggers print). White header matching other modals. `xl` size (860px).
- "What should we do about this? →" teal link in exec insights footer triggers modal.
- `['exec-insights']` added to `invalidate()` in `useRisks.ts` so any risk mutation triggers regeneration.
- `fetchExecInsight()` added to `services/dashboard.ts`. `ActionItem`, `ExecInsight` (with `owners`) added to `types/dashboard.ts`.
- Fixed missing `select` and `Risk` imports in `services/ai_executive.py`.
- Fixed `ap-horizon-tag` color from `#7fe8cf` (invisible on white) to `#01b88e` (brand teal, readable on white header).

### Next session begins with
- Continue visual parity pass: move to Incidents page sidebar item.
- Manual browser QA: gauge animation, exec insights load state, action plan modal at standard breakpoints, PDF export output.
- Verify exec insights T1-T5 test cases from the brief against live output.
- Investigate and resolve OI feed duplicate-entry bug flagged in the brief before sentence 3 is relied on in production.
- GA4 integration (pending Measurement ID G-XXXXXXXXXX from Ceekay).

---

## Session — August 22, 2026 (continued)

### Report engine: matrix-agnostic label fixes (services_report.py)

**Gap #1 and #2 — compute_risk_snapshot**
- Replaced `by_level.get("Medium", 0)` and `by_level.get("Low", 0)` with `level_index == 2` and `level_index == 1` counts respectively. Label-string lookup broke for any workspace using custom band names.
- Narrative now reads `band_1_label` and `band_2_label` from `ctx.matrix_config` with fallback to "Low" / "Medium". Elevated group always described as "elevated" since it spans multiple bands.

**Gap #3 — compute_top_risks**
- Added `"level_index": r.level_index` to the returned risk dict. PDF badge renderer requires it for position-based color assignment.

**Gap #4 — compute_top_emerging_risks**
- Same as gap #3. `level_index` added to output dict.

**Gap #5 — compute_risk_distribution**
- Moved `mc = ctx.matrix_config` block above the narrative so `band_1_label` and `band_2_label` are available when the narrative string is built.
- Narrative replaces "high-risk / medium-risk / low-risk" with "elevated / {band_2_label} / {band_1_label}".

**Gap #6 — compute_executive_dashboard**
- "Risks have escalated into the High or Critical band" replaced with "Risks have escalated into elevated risk bands". Label-agnostic.

### Report engine: position-based PDF colors (services_pdf_report.py)

**Gap #7 — _level_badge_cell**
- Added `_BAND_BG_COLORS_BY_POS` list parallel to `_BAND_COLORS_BY_POS` providing background tints for each band position.
- `_level_badge_cell` accepts optional `level_index: int | None = None`. When supplied, foreground and background colors assigned by position index. String-match fallback preserved for callers without an index.
- `_render_risk_table` call site updated to pass `r.get("level_index")`.

**Gap #8 — _level_color**
- `_level_color` in `services_pdf_report.py` accepts optional `level_index: int | None = None`. When supplied, returns `_BAND_COLORS_BY_POS[level_index - 1]`. String-match fallback preserved.
- `_mov_section` call site updated to pass `r.get("previous_level_index")`. Code path is currently unreachable (`has_data: False` always) but call site is correct for when risk history schema is extended.
- `_render_major_incidents` call to `_level_color` unchanged. Incident severity has no matrix index; string matching is the correct behaviour for that caller.

### AI settings: confidence and sub-policy fields wired through

**services_settings.py**
- `AIConfig` TypedDict extended with `policy_industry`, `policy_tone`, `policy_sensitivity`, `policy_extra` fields.
- `get_ai_config` now fetches all four sub-policy fields from workspace JSONB with empty-string defaults.

**services_ai_report.py**
- `_TEMPERATURE = 0.5` removed. Replaced with `_CONFIDENCE_TEMPERATURE` dict: `conservative → 0.3`, `balanced → 0.5`, `assertive → 0.7`. Values match GAS confidence option labels.
- `_call()` accepts `temperature: float = 0.5` and passes it to the Anthropic `messages.create` call.
- `generate_report_narrative` resolves temperature via `_CONFIDENCE_TEMPERATURE.get(ai_cfg['confidence'], 0.5)`.
- Combined policy string assembled from all non-empty policy fields in order: `policy`, `policy_industry` (prefixed "Industry context:"), `policy_tone` (prefixed "Tone:"), `policy_sensitivity` (prefixed "Sensitivity:"), `policy_extra`. Appended to system prompt as `\n\nWorkspace Policy:\n{combined_policy}`.
- Confirmed `auto_run` is correctly consumed in `routes_risks.py` for risk creation AI. It is not a report pipeline concern. No change made.

### Frontend: model dropdown labels (pages_Settings.tsx)
- Model dropdown option labels replaced with use-case framing. Raw model strings remain as option values; backend unchanged.
  - `claude-sonnet-4-6` → "Full Analysis — deeper insights, richer narratives"
  - `claude-haiku-4-5-20251001` → "Quick Scan — faster responses, concise output"

### Frontend: trial workspace tooltip (pages_WorkspacePicker.tsx, layout_Topbar.tsx, src_index.css)
- Added `.tooltip-wrap` CSS utility to `src_index.css`. Uses `::after` pseudo-element reading `data-tip` attribute.
- Added `.tooltip-wrap--inline` variant that renders the tip as a static block below the item (no absolute positioning) to avoid overflow and viewport edge issues inside the topbar dropdown.
- `pages_WorkspacePicker.tsx`: `isTrial` derived from `workspaces.some(ws => ws.plan === 'TRIAL')`. "New workspace" button wrapped in `.tooltip-wrap` span with `disabled={isTrial}` and `data-tip` set when on trial.
- `layout_Topbar.tsx`: Both "Switch workspace" and "+ Add workspace" buttons wrapped in `.tooltip-wrap tooltip-wrap--inline` spans. Native `title` attributes removed from buttons. Tooltip fires on the wrapper since `.topbar-dropdown-item:disabled` has `pointer-events: none`.
- `overflow: hidden` removed from `.topbar-dropdown` (6px padding already prevents items touching container edges; `overflow: hidden` was redundant and clipped absolute-positioned children).
- Floating tooltip approach (bottom/right positioning) trialled and abandoned. Inside the dropdown both directions hit either `overflow: hidden` clipping or viewport edges. Inline reveal is the correct solution for this context.

### Next session begins with
- FIRST TASK: Apply setWorkspaces fix in pages_CreateWorkspace.tsx after setToken call. Without this, the sidebar falls back to 'SmartRisk' as the workspace name after onboarding because the workspaces array in the auth store is never seeded by the wizard launch flow.
- Continue visual parity pass: move to Incidents page sidebar item.
- Manual browser QA: gauge animation, exec insights load state, action plan modal at standard breakpoints, PDF export output.
- Verify exec insights T1-T5 test cases from the brief against live output.
- Investigate and resolve OI feed duplicate-entry bug flagged in the brief before sentence 3 is relied on in production.
- GA4 integration (pending Measurement ID G-XXXXXXXXXX from Ceekay).

---

## Phase 17 — Onboarding Wizard, Google OAuth, Wizard UX Fixes (August 23, 2026)

### Migration 031: wizard fields on tenants table
- New Alembic migration: `alembic/versions/031_add_wizard_fields_to_tenants.py`
- Adds four nullable VARCHAR columns: org_size, framework, timezone, date_format.
- Supabase SQL provided separately for production sync.
- `models_tenant.py`: four new Column(String) ORM attributes added.

### Backend: workspace creation accepts all wizard fields
- `schemas_user.py`: CreateWorkspaceRequest extended with org_name, org_size, framework, timezone, date_format, currency (all optional for backwards compatibility).
- `v1_routes_workspaces.py`: Tenant creation updated to persist all new fields. currency maps to currency_symbol column. org_name stored in workspace_settings JSONB (no migration needed).
- `services_settings.py`: _build_response updated to read framework, timezone, date_format from new tenant columns with JSONB fallback for existing rows. update_settings updated to write these three fields to columns instead of JSONB.

### Backend: Google OAuth endpoint
- `schemas_auth.py`: GoogleAuthRequest schema added (access_token: str).
- `core_config.py`: GOOGLE_CLIENT_ID: str = "" added to Settings.
- `services_auth.py`: import httpx added. google_auth async function added. Verifies identity by calling Google userinfo endpoint via httpx (no google-auth package needed). Finds or creates account. Returns same JWT shape as login. Follows existing login branching logic for pin, multi-workspace, and no-workspace cases.
- `routes_auth.py`: POST /google route added, rate-limited at 10/minute. GoogleAuthRequest imported.

### Frontend: @react-oauth/google installed
- `npm install @react-auth/google` required in frontend.
- `src_App.tsx`: GoogleOAuthProvider wraps entire app when VITE_GOOGLE_CLIENT_ID is set. When env var is absent the provider is omitted and Google buttons do not render.
- `pages_Login.tsx`: GoogleSignInButton component defined at module scope using useGoogleLogin (implicit flow). Renders conditionally on VITE_GOOGLE_CLIENT_ID. On success POSTs access_token to /api/v1/auth/google and follows same post-login navigation logic as email login.
- `pages_Register.tsx`: Same GoogleSignInButton pattern. On Google success navigates to /workspaces/create (no workspaces yet) or /workspaces if requires_workspace_select.
- auth-google-btn and auth-or-divider CSS classes added to src_index.css.

### Frontend: 6-step onboarding wizard (pages_CreateWorkspace.tsx, full rebuild)
Previous file was a single-form page (143 lines). Rebuilt as a 6-step wizard (~350 lines).
- Step 1: Workspace name + org name + logo upload (optional).
- Step 2: Industry tile grid (8 tiles) + org size pills (4 options). Required to advance.
- Step 3: Framework, currency, timezone, date format (2x2 selects). Pre-filled with sensible defaults.
- Step 4: Risk matrix preview (read-only default bands + heatmap). Custom toggle visible but disabled with tooltip.
- Step 5: Risk categories. User adds up to 3 category names with owner text. Example chips auto-fill empty rows. On launch: fetches existing categories first, merges user choices, deduplicates, then PATCHes /api/v1/lookups. Append-not-replace approach preserves hardcoded defaults.
- Step 6: Invite team. Email + role rows (Analyst default). Invites are fire-and-forget after launch; failures do not block navigation.
- Launch sequence: POST workspaces, POST select-workspace, setToken, PATCH lookups (categories), upload logo + PATCH settings (if logo), send invites, navigate('/').
- Wizard state held client-side, submitted atomically on Launch. No per-step persistence.
- Progress bar: step/6 * 100%.
- WIZARD_ROLES uses Owner as stored value, display label shows Admin.

### Frontend: wizard CSS (wiz- namespace, src_index.css)
- Full wiz- namespace added: wiz-shell, wiz-rail, wiz-brand, wiz-checklist, wiz-check-item states (done/current/todo), wiz-content, wiz-panel, wiz-progress, wiz-footer, wiz-btn variants, wiz-upload, wiz-tile-grid, wiz-tile, wiz-size-row, wiz-size-pill, wiz-two-col, wiz-callout, wiz-toggle, wiz-matrix-cols, wiz-band, wiz-heatmap, wiz-invite-row, wiz-col-labels, wiz-cat-row, wiz-cat-num, wiz-cat-add, wiz-example-row, wiz-example-chip, wiz-error.
- Responsive breakpoint at 860px: rail hidden, single column layout.

### Frontend: wizard constants (utils_constants.ts)
- Added: WIZARD_INDUSTRIES (8 entries with icon keys), ORG_SIZES, FRAMEWORKS, CURRENCIES (label+value pairs), TIMEZONES, DATE_FORMATS, WIZARD_BAND_ROWS, WIZARD_HEATMAP (25-cell color array), WIZARD_ROLES, WIZARD_CATEGORY_EXAMPLES.

### Frontend: report builder AI narrative made optional (pages_ReportBuilder.tsx, hooks_useReports.ts)
- step3Disabled changed from rb.step < 3 to rb.step < 2. Export is available immediately after preview without requiring AI generation.
- Step 3 badge condition changed from rb.step === 3 to rb.step >= 2.
- Required tag on AI step changed to Optional.
- Preview success toast updated: no longer says "generate AI narrative to proceed".

### UI: left accent border removed from banners (src_index.css)
- trial-warn--amber: border-left: 4px solid #f59e0b removed. Uniform 1px border retained.
- trial-warn--red: border-left: 4px solid #ef4444 removed. Uniform 1px border retained.
- unsaved-banner: border-left: 4px solid #f59e0b removed. Dark mode override for border-left-color also removed.

### Known gap resolved: setWorkspaces now called after wizard launch
- setWorkspaces called with manually constructed WorkspaceInfo (role: Owner, plan: TRIAL, modules: [risk]) after setToken in handleLaunch.
- queryClient.clear() called before navigate("/") to flush stale cache for new workspace.

---

## Session: August 28, 2026

### Onboarding wizard wiring fixes
- org_name JSONB key corrected from "org_name" to "organization" in routes_workspaces.py. Settings now reads organization name correctly after onboarding.
- TIMEZONES in utils_constants.ts replaced with IANA identifiers (Africa/Lagos, UTC, Europe/London, etc.) to match settings_WorkspaceSettings.tsx select values.
- FRAMEWORKS in utils_constants.ts updated to match Settings options (NIST CSF added, NIST RMF removed, COBIT and ISO 27001 added).
- INITIAL_DATA.timezone default changed from "WAT (UTC+1)" to "Africa/Lagos".
- INDUSTRIES in settings_WorkspaceSettings.tsx updated to include "Oil & gas" matching wizard tile key.
- Skip invites button wired to handleLaunch (was bare navigate("/"), caused full redirect loop back to wizard).
- "Skip for now" label changed to "Skip invites" for accuracy.
- Legend hint text added under Workspace name and Organization name fields in Step 1.
- Risk owner names from Step 5 categories now saved to risk_owner lookup alongside category names in handleLaunch.
- Launch animation: useEffect-driven cycling messages (buildLaunchSteps), launchSteps useState, progress bar fill. Steps are dynamically built from what the user actually filled in (logo, categories, invites). React 19 compliant: no ref reads during render.

### Auth resilience
- refresh_access_token now issues a fresh base token for accounts with no workspace_members rows. Fixes forced logout when access token expires mid-wizard.
- GoogleSignInButton on Login and Register pages: navigator.onLine checked before triggering OAuth, googlePending state added (spinner + "Connecting to Google..." while popup is open), precise error messages for offline vs cancellation.

### Workspace picker
- WorkspacePicker fetches GET /api/v1/workspaces on mount and calls setWorkspaces from API response. No longer reads stale in-memory store.
- routes_workspaces list endpoint now includes member role in each workspace entry.
- fetching state prevents empty-workspace flash before API responds.

### Settings form dirty state
- WorkspaceSettings: key prop in pages_Settings.tsx tied to name|organization|industry. Forces clean remount when identity data changes.
- WorkspaceSettings, RolesTab, AITab, BriefTab: post-save form sync to server response in mutation onSuccess. Prevents dirty banner immediately after save.
- LookupEditorContent: key prop tied to lookups.updated_at. Post-save local state synced to server response.

### Get Started drawer
- Steps 7 (Brand your workspace) and 8 (Build your team) removed; both covered by onboarding wizard.
- New step 3: Customise your risk matrix, pointing to /settings.
- Step 2 description updated to acknowledge wizard-seeded categories.
- TOTAL_STEPS corrected from 8 to 7.

### Auth left panels
- New CSS classes: auth-feature, auth-features, auth-feature-icon, auth-feature-title, auth-feature-sub added to src/index.css.
- auth-left h2 size increased from 26px to 34px.
- auth-left-footer updated: line-height added, content updated with legal registration info on all three pages.
- Login left panel: "Pulse Portal" eyebrow, "Welcome back." headline, login-specific description, 3 feature rows (Clock, BarChart2, Activity icons).
- Register left panel: "Risk Intelligence" eyebrow, brand pitch headline, 3 same feature rows.
- Forgot password left panel: "Pulse Portal" eyebrow, "Forgot your password?" headline, 2 feature rows (ShieldCheck, Mail icons). Expiry copy corrected to 15 minutes (was 24 hours from design HTML, which was wrong).
- No gradients added. No Tabler icons. Lucide only. Brand identity maintained.

### Forgot password email fix
- send_reset_email (synchronous Resend call) wrapped in asyncio.get_event_loop().run_in_executor() inside async forgot_password service. Event loop no longer blocked.
- Token expiry confirmed as 15 minutes. Email body already correct. Left panel copy corrected.

### Report Builder state persistence
- New file: src/store/reportBuilderStore.ts. Zustand store (no persist) holds activeBlocks, settings, step, blockData, aiData.
- hooks_useReports.ts: initializes useState from store on mount, syncs back to store in set() for all persistent fields, exposes reset() that clears both store and local state.
- pages_ReportBuilder.tsx: "New report" button added to header with confirm dialog before reset.
- State survives React Router navigation. Page reload resets store to defaults and loadSavedSettings() repopulates from API as before.

### Files modified
Backend: routes_workspaces.py, services_auth.py
Frontend: pages_CreateWorkspace.tsx, utils_constants.ts, settings_WorkspaceSettings.tsx, settings_LookupEditor.tsx, pages_Settings.tsx, pages_WorkspacePicker.tsx, layout_GetStartedDrawer.tsx, pages_Login.tsx, pages_Register.tsx, pages_ForgotPassword.tsx, src_index.css, hooks_useReports.ts, pages_ReportBuilder.tsx
New: src/store/reportBuilderStore.ts

### Open items for next session
- Manual browser QA: full onboarding wizard end-to-end with fresh account (register → wizard → dashboard → settings verify)
- Verify FRONTEND_URL is set to https://app.smartrisksheets.com in Render environment (reset link goes to localhost if missing)
- Module gating still unimplemented: require_module backend, frontend route guards, block selector, dashboard sections, LookupEditor tab, AI tab
- Font swap pass in PDF (Arial/Georgia TTF replacing Helvetica/Times-Bold)
- UptimeRobot ping on /api/health every 10 minutes
- causeLinkRise missing from _compute_control_metrics return dict
- ownerNudge missing from _build_weekly_digest return dict
- SMARTRISK_V2_SETUP.md not updated to reflect APScheduler/MemoryJobStore decision
- PDF visual QA: regenerate report and compare cover + executive dashboard side-by-side against SmartRisk (3).pdf reference — cover vertical position, pill chip, KPI strip, posture row, bullet density

---

### Session: August 28, 2026 — PDF Report Parity, Control Strength KPI, Email Wiring, Sender Identity

**Completed:**

#### PDF cover page parity
- `Flowable` added to pdf_report.py imports.
- `_PillChip` custom Flowable added: draws a rounded pill chip via `canvas.roundRect()`, replacing the rectangular Table-with-BOX chip. Reproduces GAS `border-radius:20px` pill treatment. Cannot be achieved with a ReportLab Table.
- `has_cover` parameter added to `_make_canvas_cls`. `_draw_footer` now returns immediately on page 1 when cover is present, preventing the muted canvas footer text from layering over the cover's own navy footer bar.
- Cover vertical composition fixed: `_meta_gap` computed dynamically as `frame_height - _top_est - _bot_est`. A4 portrait frame height = 265mm. `_top_est` = 90mm, `_bot_est` = 78mm (calibrated after first render at 57mm overshot by 16mm). Gap = 97mm, placing the metadata block at approximately 73% down the page, reproducing the GAS `margin-top: auto` result.
- PageTemplate sequencing corrected: `NextPageTemplate("content")` moved before `PageBreak()` in `build_pdf`. The previous order placed `NextPageTemplate("content")` after `PageBreak()`, so the first content page was allocated to the cover template and received no navy header.

#### PDF content width
- `_make_doc` left and right margin changed from 20mm to 15mm. Source: GAS portrait CSS `@page{margin:18mm 15mm 22mm 15mm}`. Content width increases from 170mm to 180mm across all content pages. This is the root cause of KPI label wrapping and dashboard narrowness.

#### PDF executive dashboard parity
- `_kpi_table` restructured as a flat multi-row Table. Nested Table per KPI cell eliminated. Removes double-padding overhead (inner 10+6 + outer 4 = 20pt dead space per cell). LINEBEFORE applied to first column only, matching GAS single left-edge accent. Previous implementation applied LINEBEFORE inside every nested KPI table, producing a colored divider before every metric which is visually incorrect.
- KPI value font size raised to 15pt (unit 9pt) after width fix provided sufficient space. Leading adjusted to 18pt.
- `_render_executive_dashboard` KPI total width and posture colWidths updated from 170mm to 180mm.
- Posture row padding reduced: TOPPADDING/BOTTOMPADDING 8→5pt, LEFTPADDING/RIGHTPADDING 12→8pt.
- Inter-section Spacers reduced: 3mm→2mm between KPI row, posture row, and leadership section.
- Bullet text fontSize reduced 11→9pt, leading tightened 15→12pt.
- Posture label fontSize reduced 10→8pt. Posture value fontSize reduced 13→10pt.
- Leadership heading fontSize reduced 10→8pt.

#### Report data — Control Strength KPI
- `control_effectiveness: int` field added to `RiskRow` dataclass in services_report.py.
- `_fetch_risks` updated to read `control_effectiveness` from the ORM Risk model.
- `compute_executive_dashboard` computes `_ctrl_strength` as the average of non-zero `control_effectiveness` values across risks in the date window. Color thresholded: green ≥75, amber ≥50, red <50. Mirrors GAS `ctrlEffToNum_` / `_ctrlStrength` logic. Control Strength inserted as fifth KPI, between High Risks and Avg Residual, matching GAS order. Executive dashboard now returns 6 KPIs.

#### Report email — wiring and redesign
- `from html import escape as _esc` added to services_email.py.
- `_derive_bullets` extracted as a module-level function. Was previously inline in `_build_email_html`. Same GAS `buildEmailBullets_` fallback logic.
- `_posture_cell` added as module-level HTML helper, accepts `last: bool` flag to suppress border-right on the final column.
- `_build_email_html` rewritten. Signature gains `ai_data: dict` and `org_name: str`. KPI row driven from `executive-dashboard.kpis` (6 data-driven metrics with correct colors) when present; falls back to 4 hardcoded metrics from individual blocks for backward compatibility. Posture row (Status / Trend / Confidence) inserted between KPI strip and bullets when `executive-dashboard.posture` is present. Bullet priority chain: AI narrative from `ai_data["executive-dashboard"]` → computed `ed["bullets"]` → `_derive_bullets` fallback. Matches GAS `ed.bullets` priority at line 1543. `_esc()` wraps all user-sourced strings. Org name rendered as secondary header line when it differs from report title. Navy brand bar added at bottom.
- `send_report_email` signature updated: `ai_data: dict` and `org_name: str` added as explicit parameters.
- `routes_reports.py`: `ai_data=payload.ai_data` and `org_name=_org` added to `send_report_email` call. Both were already in scope.

#### Email sender identity
- `RESEND_FROM_EMAIL` updated in `.env` and Render environment to `SmartRisk Pulse <noreply@smartrisksheets.com>`. Smartrisksheets.com domain verified on Resend. RFC 5322 `Name <address>` format accepted directly by Resend in the from field. No code changes required.

### Files modified
Backend: app/services/pdf_report.py, app/services/report.py, app/services/email.py, app/api/v1/routes/reports.py
Frontend: none
New files: none
Environment: RESEND_FROM_EMAIL updated on Render and local .env

**Decisions recorded:** See SMARTRISK_V2_DECISIONS.md session entry for August 28, 2026 (PDF parity and email wiring)

### Google OAuth: Cloud Console setup decisions
- External audience selected (not Internal). Internal restricts to single Google Workspace org; external with testing mode achieves same effect for team-only access during development. Test users list controls who can authenticate in testing mode.
- Two client IDs: one for production (app.smartrisksheets.com), one for staging (staging.smartrisksheets.com fixed Vercel alias). Dynamic Vercel preview URLs not used because Google rejects wildcard origins.
- Vercel env vars scoped per environment: VITE_GOOGLE_CLIENT_ID set to production value under Production, staging value under Preview. Same key name, different values, Vercel injects correct one at build time.
- GOOGLE_CLIENT_ID on Render: production backend only. If a staging backend service is created later, add staging client ID there too.
- VITE_ prefix exposes client ID to browser bundle. This is by design and safe: Google OAuth client IDs are public-facing identifiers, not secrets.

---

### Foundations Phase: Stream A and B Prerequisites

**Goal:** Lay the data and type foundations required for Stream A (Risk Register Enhancement) and Stream B (External Submission Link) without breaking any existing functionality.

**Session date:** August 28, 2026

**Migrations:**

- [x] Migration 032: `root_cause`, `financial_exposure`, `linked_decision` added to `risks` table (3 separate `op.execute()` calls)
- [x] Migration 033: `control_assertion_source` added to `risks` table
- [x] Migration 034: `appetite_thresholds` table created with `tenant_id`, `category`, `threshold`, `rationale`, `set_by`, `set_at`, `updated_at` and `idx_appetite_thresholds_tenant_id` index

**Backend:**

- [x] `app/models/risk.py`: `root_cause`, `financial_exposure`, `linked_decision`, `control_assertion_source` columns added
- [x] `app/models/appetite_threshold.py`: new model, `AppetiteThreshold`, composite unique on `(tenant_id, category)`
- [x] `app/models/__init__.py`: `AppetiteThreshold` registered
- [x] `app/schemas/risk.py`: `RiskCreate`, `RiskUpdate`, `RiskResponse` gain all four new fields; `RiskResponse` gains `control_freshness` as a Pydantic v2 `@computed_field` derived from `control_last_tested` (Unevidenced when null, Fresh/Aging/Stale by 15/30-day thresholds); `BulkImportRow.control_effectiveness` corrected from `le=100` to `le=5` (missed in August 17 decision)
- [x] `app/schemas/appetite.py`: new schema file, `AppetiteThresholdUpsert` and `AppetiteThresholdResponse`
- [x] `app/services/risk.py`: `create_risk` constructor maps `root_cause`, `financial_exposure`, `linked_decision`, `control_assertion_source`; `update_risk` unchanged (model_dump(exclude_unset=True) handles new fields automatically)

**Frontend:**

- [x] `src/types/risk.ts`: `RiskFreshness` gains `'Unevidenced'`; `Risk` interface gains `control_freshness`, `control_assertion_source`, `root_cause`, `financial_exposure`, `linked_decision`
- [x] `src/utils/scoring.ts`: `freshnessClass` gains `'Unevidenced'` → `'freshness-unevidenced'`
- [x] `src/index.css`: `.freshness-unevidenced` (slate-grey) and `.fresh-tip.unevidenced` added
- [x] `src/components/risks/RiskTable.tsx`: `freshnessColor` and `FRESH_META` gain Unevidenced; residual cell badge switched from `r.freshness` to `r.control_freshness`

**Residual risk formula corrected (this session):**

- [x] `app/services/risk.py` `_score()`: `ce = (control_effectiveness or 0) / 5` (was `/100`)
- [x] `src/utils/scoring.ts` `computeScore()`: `ce = (controlEffectiveness ?? 0) / 5` (was `/100`)
- [x] `app/schemas/risk.py` `RiskUpdate.control_effectiveness`: corrected to `le=5` (was `le=100`, missed in August 17 decision)

**Status:** Complete

**Next session:** Stream A complete. See Stream A section below.

---

### Stream A: Risk Register Enhancement

**Goal:** Appetite settings, register table redesign, Decision Required tracking, Add/Edit modal updates.

**Session date:** August 28, 2026

**Item 1: Appetite Settings tab**

- [x] `app/services/appetite.py`: NEW — `list_appetites` and `upsert_appetite` (select-then-insert-or-update, db.flush() + db.refresh() convention)
- [x] `app/api/v1/routes/appetite.py`: NEW — `GET /api/v1/appetite` (all roles), `PUT /api/v1/appetite` (Owner-only via `require_permission("manage_settings")`)
- [x] `app/main.py`: appetite router imported and registered at `/api/v1`
- [x] `src/types/settings.ts`: `AppetiteThreshold` and `AppetiteThresholdUpsert` interfaces added
- [x] `src/services/appetite.ts`: NEW — `fetchAppetites` and `upsertAppetite`
- [x] `src/hooks/useAppetite.ts`: NEW — TanStack Query hook, invalidates `['appetite']` and `['risks']` on save
- [x] `src/components/settings/AppetiteSettings.tsx`: NEW — per-category rows with inline range slider (1-25), rationale textarea, Owner-only Edit button, `useToast` for feedback; header corrected from custom `apt-header` pattern to standard `settings-section` + `settings-title` + `muted small` matching all other settings tabs
- [x] `src/pages/Settings.tsx`: `appetite` tab added between Risk Config and Users & Roles; `AppetiteSettings` imported and mounted
- [x] `src/index.css`: `.apt-header*`, `.apt-row*`, `.apt-cat-name`, `.apt-meta`, `.apt-right`, `.apt-value*`, `.apt-edit-btn`, `.apt-panel*`, `.apt-slider-*`, `.apt-panel-actions` added

**Item 2: Risk register table redesign**

- [x] `src/types/risk.ts`: foundations fields applied (`RiskFreshness` gains `'Unevidenced'`; `Risk` interface gains `control_freshness`, `root_cause`, `financial_exposure`, `linked_decision`, `control_assertion_source`) — these were missing from the project snapshot despite being completed in the Foundations session
- [x] `src/index.css`: `.apt-pill`, `.apt-pill-within`, `.apt-pill-near`, `.apt-pill-exceeds`, `.apt-pill-unset`, `.dec-linked`, `.dec-warn`, `.dec-days`, `.not-est` added
- [x] `src/components/risks/RiskTable.tsx`: columns redesigned — Date Logged, Treatment, Residual (with freshness tooltip), AI Insights removed; Business Impact, Financial Exposure, Appetite, Decision Required added; `MOV_CFG`, `freshnessColor`, `parseAI`, `CONF_COLORS`, `STAT_COLORS`, `FRESH_META`, `daysSince` removed; `appetiteStatus`, `decisionDays`, `APT_PILL_CLS`, `APT_LABELS` added; `appetites?: AppetiteThreshold[]` prop added; `freshTip` state removed; `AppetiteThreshold` imported from `types/settings`
- [x] `src/pages/RiskRegister.tsx`: `useAppetite` imported and called; `appetites` passed to `RiskTable`; Treatment filter `<select>` removed from filter bar JSX (state and query wiring retained)

**Item 3: Decision Required tracking**

- [x] `app/services/risk.py`: `undecided: bool | None = None` added to `list_risks`; filters `Risk.linked_decision.is_(None)` when True
- [x] `app/api/v1/routes/risks.py`: `undecided: bool | None = Query(None)` added, passed to service
- [x] `src/services/risks.ts`: `undecided?: boolean` added to `ListRisksParams`; wired to query string as `'true'`
- [x] `src/pages/RiskRegister.tsx`: `filterUndecided` state added; undecided count query added (`['risks', 'undecided-count']`, page_size=1, reads `meta.total`); undecided button placed inside `.filters` div before its closing tag; `clearFilters` resets `filterUndecided`; `handleLinkDecision` added; `onLinkDecision` passed to `RiskDetailModal`; `key={selected?.id ?? 'none'}` applied to `RiskDetailModal` mount
- [x] `src/components/risks/RiskDetailModal.tsx`: `useState` imported; `onLinkDecision?: (decision: string) => Promise<void>` prop added; `decisionDays` module-scope function added; `decisionText` and `linkSaving` state added; decision warning box rendered when `!risk.linked_decision` with inline link input gated by `onLinkDecision && canManage`; new grid fields: Last Tested, Assertion Source, Financial Exposure, Linked Decision (when set)
- [x] `src/index.css`: `.btn-undecided`, `.btn-undecided:hover`, `.btn-undecided.active` (darker amber), `.decision-warn-box`, `.decision-warn-box-label`, `.decision-warn-box-msg` added; `.btn-undecided` gap set to 5px

**Item 4: Add and Edit modal updates**

- [x] `src/types/risk.ts`: `root_cause?`, `financial_exposure?`, `linked_decision?`, `control_assertion_source?` added to `RiskCreate`; `RiskUpdate` inherits via `Partial<RiskCreate>`
- [x] `src/components/risks/RiskForm.tsx`: `RiskFormValues` gains `root_cause`, `financial_exposure`, `linked_decision`, `control_last_tested`, `control_assertion_source`; EMPTY defaults set; `handleSubmit` passes all five; JSX: Root Cause textarea after Description, Financial Exposure beside Business Impact (both span 6), control fields wrapped in `.form-section` card spanning 12 columns with nested `.row`, Last Tested and Assertion Source added inside section with note, Linked Decision text input before Comments
- [x] `src/components/risks/EditRiskModal.tsx`: `initial` gains `root_cause`, `financial_exposure`, `linked_decision`, `control_last_tested`, `control_assertion_source` pre-populated from existing risk
- [x] `src/index.css`: `.form-section`, `.form-section-title`, `.form-section-note` added

**Status:** Complete

**Known gaps carried forward:**

- `treatment` state variable and query wiring remain in `RiskRegister.tsx` (always resolves to `undefined`, no functional impact, cleanup deferred to next file touch)
- `useEffect` import in `RiskDetailModal.tsx` is now unused after the key-prop reset replaced the effect-based reset. Remove on next file touch.
- File attachment upload on public form (ExternalSubmit.tsx) is UI-only. Supabase Storage presigned URL endpoint not yet built. `attachment_url` always null until built.
- Escalation scheduler job for submissions with no triage action after 5 working days not yet built. Deferred to Phase 16 hardening.
- Duplicate detection in triage detail is word-match only (crude). Full-text similarity deferred.
- `PendingSubmissionsModal` and `ExternalLinkModal` are now dead code (replaced by TriageQueue and TokenManager pages). Remove on next file touch.
- `usePendingCount` from `useExternalSubmissions` is no longer called anywhere. Remove on next file touch.
- Manual browser QA of Stream B on staging outstanding.

**Next session starts with:**

1. Read `SMARTRISK_V2_SETUP.md`, `SMARTRISK_V2_BUILD.md`, `SMARTRISK_V2_DECISIONS.md` in full
2. Staging QA of Stream B with tester: public form submission, acknowledgement email, triage inbox, accept and promote, merge, reroute, close, token revocation
3. Address any bugs found during staging QA

---

### Stream B: External Submission System

**Goal:** Tokenised public submission form, triage queue, token management, rate limiting, five outcome notification emails, promotion to risk register.

**Session date:** August 31, 2026

**Migrations (035-040):**

- [x] Migration 035: `submission_tokens` table (id, workspace_id, token UNIQUE, label, department, issued_by, issued_at, expires_at, revoked_at, submission_count)
- [x] Migration 036: `risk_submissions` table (id, workspace_id, token_id, reference, submitter fields, description, cause, affects, suggested_category, existing_controls, suggested_action, submitter_urgency, attachment_url, status, triage fields, promoted_risk_id, submitted_at, submitter_ip)
- [x] Migration 037: `source_submission_id UUID` nullable column added to `risks`
- [x] Migration 038: `rate_limit_counters` table (key VARCHAR PK, window_start, count, updated_at)
- [x] Migration 039: indexes on all four new tables
- [x] Migration 040: `promoted_risk_id` type corrected from UUID to VARCHAR (risk IDs are strings like R-003, not UUIDs)
- [x] All six migrations run clean against local Docker Postgres
- [x] Raw SQL from upgrade() blocks run clean in Supabase SQL editor

**Backend — models:**

- [x] `app/models/submission_token.py`: NEW — SubmissionToken ORM model
- [x] `app/models/risk_submission.py`: NEW — RiskSubmission ORM model, `promoted_risk_id` typed as String not UUID
- [x] `app/models/rate_limit_counter.py`: NEW — RateLimitCounter ORM model
- [x] `app/models/risk.py`: `source_submission_id = Column(PG_UUID(as_uuid=True))` added
- [x] `app/models/__init__.py`: SubmissionToken, RiskSubmission, RateLimitCounter registered

**Backend — schemas:**

- [x] `app/schemas/submission.py`: NEW — SubmissionTokenCreate, SubmissionTokenResponse, TokenResolveResponse, PublicSubmitRequest (with honeypot field excluded from serialisation), PublicSubmitResponse, RiskSubmissionListItem, RiskSubmissionResponse, TriageMergeRequest, TriageRerouteRequest, TriageCloseRequest, PromoteRequest. `promoted_risk_id` typed as `str | None` not UUID.

**Backend — services:**

- [x] `app/services/submission.py`: NEW — `_check_rate_limit` (atomic INSERT ON CONFLICT upsert, raises ValueError on limit exceeded), `_get_token_record`, `_token_is_active`, `_generate_reference` (SUB-{year}-{zfill(4)}), `_init_resend`, `_send_acknowledgement`, `_send_outcome_email`, `create_token`, `list_tokens`, `revoke_token` (permanent soft-revoke), `resolve_token_for_form` (neutral error for invalid/expired/revoked), `create_submission` (honeypot check, rate limit, reference generation, token submission_count increment), `get_pending_count`, `list_pending`, `get_submission`, `get_duplicate_candidates` (word-match ILIKE), `_get_sub_or_404`, `triage_accept`, `triage_merge` (appends to target risk comments), `triage_reroute` (creates incident via incident_svc), `triage_close`, `promote` (creates risk via risk_svc, links source_submission_id, calls ensure_category)
- [x] `app/services/lookup.py`: `ensure_category` added — case-insensitive check, appends only if not present
- [x] `app/services/risk.py`: `risk_id` filter changed from exact `==` to prefix `ILIKE '{value}%'` for better partial ID search

**Backend — routes:**

- [x] `app/api/v1/routes/submissions.py`: NEW — public endpoints (GET/POST `/submissions/form/{token}`, no JWT); token management (POST/GET `/submissions/tokens`, POST `/submissions/tokens/{token_id}/revoke`); triage (GET count/list/detail/duplicates, POST accept/merge/reroute/close/promote). All triage routes pass `triaged_by_id = UUID(claims["sub"])` and `triaged_by_email = claims["email"]`. Reroute blocked with 400 if incident module not in claims. Rate limit ValueError caught as 429.
- [x] `app/main.py`: submissions router registered at `/api/v1`, CORS changed from `[settings.FRONTEND_URL]` to `settings.allowed_origins`
- [x] `app/core/config.py`: `allowed_origins` property added, splits `FRONTEND_URL` on commas

**Backend — fixes:**

- [x] `app/services/auth.py`: `register()` fixed — invited users (member_count > 0) no longer get hard-blocked with DuplicateResourceError. Password verified, if correct user is logged in and returned to workspace picker where they can create their own workspace.
- [x] `app/services/email.py`: duplicate `_esc` function at line 445 removed (ruff F811 — shadowed `from html import escape as _esc` at line 13)

**Frontend — types, services, hooks:**

- [x] `src/types/submission.ts`: NEW — TriageStatus, SubmissionType, SubmitterUrgency, SubmissionToken, RiskSubmissionListItem, RiskSubmission, TokenResolveResponse, SubmissionTokenCreate, TriageMergePayload, TriageNotePayload, PromotePayload
- [x] `src/services/submissions.ts`: NEW — all API calls at `/api/v1/submissions/...`
- [x] `src/hooks/useSubmissions.ts`: NEW — useTokens, useCreateToken, useRevokeToken, useTriagePendingCount (refetchInterval 60s), useTriageQueue, useSubmission, useDuplicates, useTriageAccept (with reset() on catch), useTriageMerge, useTriageReroute, useTriageClose, usePromote (invalidates risks on success)

**Frontend — pages:**

- [x] `src/pages/ExternalSubmit.tsx`: NEW — public form, unauthenticated, uses `.sf-` CSS design system, 6-section layout (About You, What are you reporting, Tell us about it, What is already being done, How pressing, Footer), honeypot field, minimum time-on-page bot check, incident amber callout, success state with reference, invalid state, WhatHappensNext panel, Brandbar. React 19 compliant (useRef init moved to effect, setState only in async callbacks).
- [x] `src/pages/TriageQueue.tsx`: NEW — Submissions Inbox page, table with pending count, detail modal (modal-submission class, sub-pills, sub-meta, sub-field/sub-label/sub-value, duplicate candidates panel), action buttons with native title tooltips, accept/merge/reroute/close/promote panels, live risk search combobox in merge panel (useQuery with prefix ILIKE for IDs, keyword search for descriptions, page_size 10, onMouseDown selection, merge-preview card), back button to Risk Register, module guard hides Reroute button on risk-only workspaces
- [x] `src/pages/TokenManager.tsx`: NEW — Submission Links page, table (label, department, submissions count, issued, expires, status pill, copy link, revoke), create modal, revoke confirmation modal with permanent revocation warning, back button to Risk Register

**Frontend — wiring:**

- [x] `src/App.tsx`: `/submit/:token` public route (ExternalSubmit, outside PageShell), `/risks/triage` and `/risks/submission-links` protected routes (RequireModule risk + RequirePermission manage_risks)
- [x] `src/layout/Sidebar.tsx`: Triage Queue and Submission Links removed from NAV array, Inbox/Link2 imports removed, useTriagePendingCount removed, badge rendering removed, isActive fix for `/risks` exact match retained
- [x] `src/pages/RiskRegister.tsx`: usePendingCount replaced with useTriagePendingCount, bell icon navigates to `/risks/triage`, link icon navigates to `/risks/submission-links`, ExternalLinkModal and PendingSubmissionsModal removed, unused claims/useAuth removed
- [x] `src/layout/PageShell.tsx`: MAILTO_QUOTE and MAILTO_DEMO CTAs added to TrialBanner for all 7-day warning days (not just urgent 2-day)
- [x] `src/pages/PlanExpired.tsx`: Request a Quote and Book a Custom Demo buttons replace single "Contact us to renew" link
- [x] `src/utils/constants.ts`: MAILTO_QUOTE and MAILTO_DEMO pre-filled mailto constants added

**Frontend — CSS:**

- [x] `src/index.css`: `.modal-tall` modifier (max-height, flex column, form child flex, modal-bd scroll); `.sf-` design system (sf-page, sf-wrap, sf-brandbar, sf-mark, sf-head, sf-form, sf-sect, sf-sect-num, sf-field, sf-input, sf-grid2, sf-choices, sf-choice, sf-urg, sf-callout variants, sf-upload, sf-foot, sf-submit, sf-privacy, sf-err, sf-next, sf-success, sf-invalid, sf-dept-static); triage status pills (triage-pending/accepted/merged/rerouted/closed); urgency pills (urgency-now/soon/no_rush); token manager (token-url, token-revoked); submission inbox modal (modal-submission, sub-pills, sub-meta, sub-meta-email, sub-field, sub-label, sub-value, sub-actions-bar, sub-action-panel, sub-action-title); merge combobox (merge-combo, merge-dropdown, merge-option, merge-option-id, merge-option-desc, merge-option-empty, merge-preview, merge-preview-id, merge-preview-desc); trial warn actions (trial-warn-actions, trial-warn-action per colour variant); `.filters .btn-undecided { padding: 10px 12px !important }` alignment fix; `.filter-action` removed (replaced by `.field` wrapper with empty label)

**Infrastructure — staging/production split:**

- [x] `staging` branch created from `main`, pushed to GitHub
- [x] `.github/workflows/ci.yml`: `staging` branch added to push triggers (was `main` and `develop`)
- [x] Vercel: `staging-pulse.smartrisksheets.com` domain added, connected to Preview environment
- [x] Vercel: `VITE_GOOGLE_CLIENT_ID` split — Production value (production OAuth client), Preview value scoped to `staging` branch (staging OAuth client `376784100329-jcs6...`)
- [x] Google Cloud Console: new OAuth 2.0 client `SmartRisk Pulse - Staging` created with `https://staging-pulse.smartrisksheets.com` origin and redirect
- [x] Google Cloud Console: new OAuth 2.0 client `SmartRisk Pulse - Production` created with `https://pulse.smartrisksheets.com` origin and redirect
- [x] Render: `FRONTEND_URL` updated to comma-separated `https://pulse.smartrisksheets.com,https://staging-pulse.smartrisksheets.com`
- [x] Render: staging backend service created pointing at `staging` branch (separate deploy from production)
- [x] Cloudflare: `staging-pulse` CNAME added pointing to `d25e8c5cfc65b041.vercel-dns-017.com`, proxy disabled

**Status:** Complete. Pushed to staging. Awaiting staging QA.

**Next session starts with:**

1. Read `SMARTRISK_V2_SETUP.md`, `SMARTRISK_V2_BUILD.md`, `SMARTRISK_V2_DECISIONS.md` in full
2. Confirm staging-pulse.smartrisksheets.com is live and DNS has fully propagated
3. Run staging QA with tester: public form end-to-end, all four triage outcomes, token create/revoke, promotion to register
4. Fix any bugs found in QA
5. Once QA passes, merge staging to main and confirm production deployment

---

**Important reminders:**

- Docker must be running before starting. Run `docker compose ps` to confirm
- Venv must be active before running uvicorn. Look for `(venv)` in prompt
- Backend starts with: `uvicorn app.main:app --reload --port 8000` from `backend/` folder
- Frontend starts with: `npm run dev` from `frontend/` folder
- DATABASE_URL uses port 5433, not 5432
- db.refresh(obj) after db.flush() before any model_validate call in write functions
- All new CSS classes must use CSS variables, not hardcoded colors
- `--accent` in the v2 theme is navy (#1F2854). `--primary` is teal (#01b88e). Never swap these.
- sr-dot and sr-band classes are now in index.css. Use them for all colored dot legends.
- Query invalidation: every risk and incident write calls `queryClient.invalidateQueries(['dashboard'])`. Maintain this pattern for any new write hooks added in future phases.
- healthDelta is a dedicated backend field, not computed on the frontend
- monthKey is always yyyy-MM plain string, never a date type
- SettingsData is the correct type name for workspace settings. WorkspaceSettings is reserved for the React component name. Never reuse WorkspaceSettings as a type.
- Settings API paths always use full /api/v1/ prefix: /api/v1/settings, /api/v1/notifications/prefs
- All settings not mapped to tenant top-level columns (name, industry, currency_symbol, logo_url) live in the workspace_settings JSONB column on the tenants table
- JSONB Column[Any] reads: always use is not None for null check, always add # type: ignore[arg-type] on dict() call. Never use the column directly in a boolean condition.
- External submission URL format: /external/risk?workspace_id= and /external/incident?workspace_id=. Both query params are named workspace_id. Do not use workspace= or any other variant.
- Public backend endpoints use get_db only, no auth dependency. Auth endpoints use get_active_tenant. Reviewer email is claims["sub"].
- usePresence(tenantId) requires tenantId as a parameter. Always pass claims?.active_tenant_id ?? '' from the calling component. Never call with no argument.
- Presence intervals clear automatically when tenantId changes to empty string (logout or workspace switch). No manual cleanup needed in the calling component.
- ACCESS_TOKEN_EXPIRE_MINUTES=15 is correct. Do not increase it. Silent refresh in useInactivityLogout handles active users. The REFRESH_GAP_MS (10 min) must always be less than ACCESS_TOKEN_EXPIRE_MINUTES.
- workspace_presence table has no ORM model. The two presence routes use raw SQL via text() only. Do not add an ORM model for this table.

