# SmartRisk Pulse v2 — Setup and Architecture Document
 
**Status:** Active build  
**Stack:** Python (FastAPI) + React (Vite) + Supabase + Render + Vercel  
**Brand:** Navy `#1F2854`, Teal `#01b88e`. No gradients. Solid colors only.
 
---
 
## 1. What This Document Is
 
This is the single reference document for the SmartRisk v2 rebuild. Every engineering decision, convention, schema rule, and source-of-truth boundary lives here. Read this before writing any code in a new session.
 
---
 
## 1a. File Reading Discipline
 
This rule is non-negotiable and applies to every session, every file, every claim.
 
### Never claim, always verify
 
No statement about any file's content is made from memory or assumption. If a file has not been read in the current session, it has not been read. Past sessions do not count.
 
### Batch reading protocol
 
Large files are never skimmed. They are read in sequential batches using `view` with explicit line ranges until the full file is consumed. Before making any claim about a file:
 
1. Check the file line count first using `wc -l`
2. Divide into batches of 200 to 300 lines
3. Read every batch in order
4. Only after all batches are read, make statements about the file
If a file is truncated mid-read, continue from where it stopped. Do not summarise from partial content.
 
### grep before reading when targeted
 
When looking for a specific function, variable, or value, use `grep -n` first to locate the exact line. Then read only the relevant surrounding block using `view` with a tight line range. This is not a shortcut, it is precision. Do not grep and then claim without viewing the actual lines.
 
### What counts as reading
 
A file is considered read only when all its lines have passed through the view tool in the current session. Seeing a filename, a summary, or a snippet does not count as reading the file.
 
### Conflict between memory and file content
 
If anything in the current session's memory conflicts with what a file actually contains, the file wins. Flag the conflict explicitly before proceeding.
 
### Snippet Output Discipline
 
Every code snippet provided must follow this format without exception:
 
**1. Location marker**
State the exact file and where the snippet goes. Example: "In `services/risk.py`, find this block and replace it."
 
**2. Find block**
The exact lines to find, character for character, so str_replace works without ambiguity.
 
**3. Replace block**
The exact lines to replace with.
 
**4. Plain English explanation**
After every snippet, explain in plain English:
- What this code is doing
- What problem it solves or what it improves
- Why this specific approach was chosen over alternatives
This explanation is not optional. It serves as a learning record and also forces verification that the snippet is correct before it is written. If the explanation cannot be written clearly, the snippet is not ready.
 
---
 
## 2. Source of Truth Boundaries
 
### GAS Reference Files (Read Only)
 
The following files from the Google Apps Script build are reference material only. They document existing business logic that must be translated, not copied.
 
- All `.gs` files
- `App.html`, `AppJS.html`, `Styles.html`
- All `View_*.html` and `Modal_*.html` files
Rules:
- Never modify them
- Never output changes to them
- When translating logic from any GAS file, name the source file and state its role before writing the Python or React equivalent
### Active Source of Truth
 
| Layer | Source |
|---|---|
| Backend logic | Python FastAPI (`backend/`) |
| Frontend logic and structure | React + Vite (`frontend/src/`) |
| Styles | `frontend/src/index.css` only |
| Schema | Raw SQL (Supabase editor) + Alembic `op.execute()` for local sync |
 
---
 
## 3. Stack
 
| Layer | Tool | Notes |
|---|---|---|
| Frontend | React + Vite | SPA, no SSR, TypeScript |
| Frontend hosting | Vercel | Free tier, auto-deploys on push |
| Backend | FastAPI + Uvicorn | Python 3.12+ |
| Backend hosting | Render | Starter plan ($7/month), always-on |
| Database | Supabase Postgres | With Row Level Security |
| Auth | Supabase Auth | Replaces GAS License Server auth |
| File storage | Supabase Storage | Logos, PDF reports, import templates |
| Schema migrations | Alembic | Hand-written only, no autogenerate |
| Background jobs | APScheduler + Postgres job store | Runs inside FastAPI process |
| PDF generation | ReportLab | Pure Python, no system dependencies |
| Email | Resend | Replaces GmailApp |
| AI | Anthropic SDK | Claude API (already in use in GAS version) |
| State management | Zustand | Client-side global state |
| Server state | TanStack Query | Data fetching, caching, background refetch |
| Routing | React Router v7 | Client-side routing |
 
---
 
## 4. Project Structure
 
### Backend
 
```
backend/
  app/
    api/
      v1/
        routes/
          auth.py          # login, token refresh, license validation
          risks.py         # risk CRUD, bulk import, AI insights
          incidents.py     # incident CRUD, AI impact, AI actions
          dashboard.py     # KPIs, snapshot delta, activity feed
          users.py         # list, add, update, deactivate, reactivate
          settings.py      # workspace settings, logo, PIN, report settings
          audit.py         # audit log read, clear
          snapshots.py     # manual trigger, delta, daily/monthly
          reports.py       # report data, narrative, PDF export, email
          lookups.py       # get, save lookup options
          external.py      # public submit risk/incident, approve, return
          brief.py         # brief payload, cadence settings
          feedback.py      # feedback submission
          recycle.py       # list bin, restore, permanent delete
          notifications.py # notification preferences
    core/
      config.py            # environment variables, settings
      security.py          # JWT creation, verification, RBAC enforcement
      dependencies.py      # FastAPI dependency injectors (get_current_user, get_tenant, etc)
    db/
      session.py           # Supabase async session
      base.py              # SQLAlchemy declarative base
    models/                # SQLAlchemy ORM models (one file per domain)
      tenant.py
      user.py
      risk.py
      incident.py
      audit.py
      snapshot.py
      recycle_bin.py
      lookup.py
      activity_feed.py
      risk_history.py
      brief_settings.py
      notification_prefs.py
    schemas/               # Pydantic request and response shapes
      risk.py
      incident.py
      user.py
      auth.py
      dashboard.py
      report.py
      settings.py
    services/              # Business logic (translates GAS service files)
      risk.py              # from RiskService.gs
      incident.py          # from IncidentService.gs
      dashboard.py         # from DashboardService.gs
      user.py              # from UserService.gs
      settings.py          # from SettingsService.gs
      audit.py             # from AuditService.gs
      snapshot.py          # from SnapshotService.gs
      recycle.py           # from RecycleBinService.gs
      lookup.py            # from LookupService.gs
      phase_one.py         # from PhaseOne.gs (score delta, movement, freshness, activity)
      external.py          # from ExternalRiskService.gs
      report.py            # from Reportservice.gs
      ai_risk.py           # from RegisterAI.gs
      ai_incident.py       # from IncidentAI.gs
      brief.py             # from Briefservice.gs + Briefemailservice.gs
      pdf.py               # ReportLab PDF generation
      email.py             # Resend email dispatch
    middleware/
      tenant.py            # resolves tenant_id from JWT on every request
      audit.py             # auto-logs write operations to audit table
      rate_limit.py        # per-tenant, per-endpoint rate limiting
    scheduler/
      jobs.py              # APScheduler job definitions
      store.py             # Postgres job store configuration
  alembic/
    versions/              # migration files, hand-written only
    env.py
    alembic.ini
  main.py                  # FastAPI app init, middleware registration, router mount
  requirements.txt
  .env                     # never committed
  .env.example
```
 
### Frontend
 
```
frontend/
  src/
    components/
      layout/
        Sidebar.jsx
        Topbar.jsx
        PageShell.jsx
      ui/                  # base reusable components
        Button.jsx
        Modal.jsx
        Badge.jsx
        Table.jsx
        Toast.jsx
        Skeleton.jsx
        ConfirmDialog.jsx
      dashboard/
      risks/
      incidents/
      reports/
      settings/
      users/
      audit/
      external/            # public submission forms (no auth)
      recycle/
    pages/                 # one file per route
      Dashboard.jsx
      Register.jsx         # Risk Register
      Incidents.jsx
      ReportBuilder.jsx
      Settings.jsx
      Users.jsx
      AuditLog.jsx
      Frameworks.jsx
      Help.jsx
      ExternalRisk.jsx     # public, no layout wrapper
      ExternalIncident.jsx # public, no layout wrapper
    hooks/
      useRisks.js
      useIncidents.js
      useDashboard.js
      useUsers.js
      useSettings.js
      useAudit.js
      useAuth.js
      useLookups.js
      useSnapshots.js
      useRecycleBin.js
    store/
      authStore.js         # Zustand: user, role, permissions, tenant
      uiStore.js           # Zustand: theme, sidebar state, toast queue
      settingsStore.js     # Zustand: workspace settings, currency symbol
    services/
      api.js               # axios instance, base URL, auth header injection, envelope unwrap
      risks.js
      incidents.js
      dashboard.js
      users.js
      settings.js
      audit.js
      reports.js
      lookups.js
      external.js
    utils/
      scoring.js           # risk score computation (likelihood x impact, residual)
      dates.js
      format.js
      permissions.js       # canDo(permission) helper
    index.css              # SOLE CSS SOURCE OF TRUTH
    App.jsx
    main.jsx
  index.html
  vite.config.js
  .env
  .env.example
```
 
---
 
## 5. CSS Convention
 
`index.css` is the only place styles are written. No exceptions.
 
### Rules
 
- No `style=` attributes in any JSX file, ever
- Dynamic visual state (active, open, error, disabled) is toggled by adding or removing CSS class names
- The only acceptable exception is a truly computed value that cannot exist in CSS, for example a progress bar width from a percentage. Even then, it is set as a CSS custom property on the element (`style="--progress: 73%"`) and consumed in `index.css` via `var(--progress)`, never as a direct style property
### Responsive Design
 
The application is fully responsive across all three viewports. This is not optional and is not a later phase. Every component is built mobile-first from day one.
 
Breakpoints defined in `index.css`:
 
```css
/* Mobile first — base styles target mobile */
/* Tablet */
@media (min-width: 768px) { }
 
/* Desktop */
@media (min-width: 1024px) { }
 
/* Wide desktop */
@media (min-width: 1280px) { }
```
 
Viewport behaviour per breakpoint:
 
| Viewport | Sidebar | Tables | Modals | Cards |
|---|---|---|---|---|
| Mobile (< 768px) | Hidden, hamburger toggle, full-width overlay | Horizontal scroll with sticky first column | Full screen, bottom sheet style | Single column stack |
| Tablet (768px to 1023px) | Collapsible, icon-only when collapsed | Horizontal scroll, visible columns reduced | Centred, 90% width | Two column grid |
| Desktop (1024px+) | Full sidebar, always visible | Full table, all columns | Centred, fixed max-width | Full grid layout |
 
### Layout Rules
 
- No fixed pixel widths on containers. Use `max-width` with `width: 100%`
- Touch targets are minimum 44px height on mobile
- Font sizes never below 14px on any viewport
- The sidebar on mobile is an overlay, it does not push content
- Data tables on mobile scroll horizontally. The risk ID or incident ID column is sticky left so the user always has row context while scrolling
- Modals on mobile take the full screen height or use a bottom sheet pattern, never a centred floating box that clips on small screens
### CSS Custom Properties
 
Defined in `:root` in `index.css`. These carry over directly from the GAS `Styles.html`:
 
```css
:root {
  --primary: #01b88e;
  --navy: #1F2854;
  --card: #ffffff;
  --bg: #f1f5f9;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
}
 
[data-theme="dark"] {
  --card: #1e293b;
  --bg: #0f172a;
  --text: #f1f5f9;
  --border: #334155;
}
```
 
---
 
## 5a. TypeScript Conventions
 
The frontend is written in TypeScript. All files use `.tsx` for React components and `.ts` for non-component files (hooks, services, stores, utils).
 
### Rules
 
- No `any` type anywhere. If the type is genuinely unknown, use `unknown` and narrow it
- Every API response is typed. The base envelope type is defined once in `src/types/api.ts` and reused everywhere
- Every component has typed props. No untyped prop spreading
- All Zustand store slices are typed
- All TanStack Query hooks are typed with their return shape
### Base Types
 
Define these in `src/types/api.ts`:
 
```typescript
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  meta: Record<string, unknown>;
}
 
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    total: number;
    page: number;
    page_size: number;
  };
}
```
 
Define domain types in `src/types/` with one file per domain:
 
```
src/types/
  api.ts        # base envelope types
  auth.ts       # Account, WorkspaceMember, JWT claims
  risk.ts       # Risk, RiskCreate, RiskUpdate
  incident.ts   # Incident, IncidentCreate
  dashboard.ts  # KPICard, ActivityFeedItem, SnapshotDelta
  report.ts     # ReportBlock, ReportPayload
  settings.ts   # WorkspaceSettings, LookupOptions
  user.ts       # User, Role, Permissions
```
 
### Vite Scaffold Command
 
Use the TypeScript React template:
 
```powershell
npm create vite@latest frontend -- --template react-ts
```
 
All endpoints are prefixed with `/api/v1/`.
 
All responses follow this envelope without exception:
 
```json
{
  "data": {},
  "error": null,
  "meta": {}
}
```
 
On success: `data` is populated, `error` is null.  
On failure: `data` is null, `error` is a string message.  
`meta` carries pagination, timestamps, or plan info where relevant.
 
---
 
## 7. Migration Discipline
 
### The Workflow
 
1. Design the schema change
2. Write raw SQL
3. Run it in the Supabase SQL editor (this updates production and staging)
4. Create an Alembic migration file locally using `op.execute()` with the same SQL to keep the local Postgres in sync
### Alembic Rules
 
- Never use `alembic revision --autogenerate`
- All migrations are hand-written
- Every migration has an `upgrade()` and a matching `downgrade()`
- Migration files are numbered sequentially: `001_`, `002_`, etc.
### Migration File Template
 
```python
# alembic/versions/001_create_risks_table.py
 
def upgrade():
    op.execute("""
        CREATE TABLE risks (
            ...
        );
    """)
 
def downgrade():
    op.execute("DROP TABLE IF EXISTS risks;")
```
 
---
 
## 8. Multi-Tenancy and Multi-Workspace
 
### Model: One Account, Many Workspaces
 
A single account (one login, one email, one password) can own or be a member of multiple workspaces. This is a first-class design decision, not a later addition.
 
This reflects a real use case: a risk consultant or an internal risk manager who oversees multiple entities, subsidiaries, or client portfolios from one login.
 
### Three Core Concepts
 
**Account** is the person. One per email address. Holds login credentials via Supabase Auth. Has no workspace data attached to it directly.
 
**Tenant (Workspace)** is the isolated risk environment. One per organisation or entity. Holds all risk, incident, audit, and settings data. Has its own plan, modules, currency, and limits.
 
**Workspace Member** is the join between an account and a tenant. Holds the role, permissions, and status for that specific account within that specific workspace. One account can have many workspace member records, one per workspace they belong to.
 
### Strategy: Shared Schema + Row Level Security
 
Every table that holds workspace data has a `tenant_id UUID NOT NULL` column. Supabase Row Level Security enforces that queries only return rows matching the active workspace.
 
The `tenant_id` is resolved on every request by `middleware/tenant.py` from the JWT's `active_tenant_id` claim. It is never passed from the client in the request body.
 
### Workspace Switching
 
After login, if the account belongs to more than one workspace, the frontend shows a workspace picker before entering the app. The selected workspace is stored in the auth store and included in all subsequent API requests via the JWT.
 
Switching workspaces issues a new short-lived token scoped to the selected `tenant_id` without requiring a full re-login.
 
### Tenant Identifier
 
In GAS, the tenant was identified by `sheetId`. In v2, `tenant_id` is a UUID in the `tenants` table. The `sheetId` to `tenant_id` mapping is handled during data migration.
 
---
 
## 9. Authentication
 
### Flow
 
1. Account submits email and password to `/api/v1/auth/login`
2. FastAPI verifies credentials via Supabase Auth
3. Backend returns a base token carrying only `account_id` and the list of workspaces the account belongs to
4. If the account belongs to one workspace, the backend immediately issues a workspace-scoped access token
5. If the account belongs to multiple workspaces, the frontend shows a workspace picker. The account selects one and calls `/api/v1/auth/select-workspace` to receive the workspace-scoped access token
6. The workspace-scoped access token (15 minutes) and refresh token (7 days, HttpOnly cookie) are used for all subsequent requests
7. Token refresh is handled automatically by the `api.js` axios instance
### JWT Claims
 
The workspace-scoped access token carries:
 
```json
{
  "sub": "account_id",
  "email": "user@example.com",
  "active_tenant_id": "uuid",
  "role": "Owner | Manager | Analyst",
  "permissions": {
    "manage_risks": true,
    "manage_incidents": true,
    "review_resolve": true,
    "generate_ai": true,
    "print_reports": true,
    "manage_users": true,
    "manage_settings": true
  },
  "plan": "TRIAL | PAID",
  "trial_expires_at": "iso_date | null",
  "modules": ["risk", "incident"],
  "workspaces": [
    { "tenant_id": "uuid", "name": "Workspace Name", "role": "Owner" }
  ]
}
```
 
### PIN Second Factor
 
Optional per workspace. If a workspace has a PIN set, the login flow requires PIN entry before the workspace-scoped access token is issued. PIN is verified at `/api/v1/auth/verify-pin`.
 
---
 
## 10. RBAC Permission Matrix
 
Sourced from `UserService.gs` (`api_getRolePermissions`).
 
| Permission | Owner | Manager | Analyst |
|---|---|---|---|
| manage_risks | yes | configurable | configurable |
| manage_incidents | yes | configurable | configurable |
| review_resolve | yes | configurable | configurable |
| generate_ai | yes | configurable | configurable |
| print_reports | yes | configurable | configurable |
| manage_users | yes | configurable (off by default) | no |
| manage_settings | yes | configurable (off by default) | no |
 
Permissions are enforced at the FastAPI route level via a dependency injector, not only in the frontend. Frontend uses the `canDo(permission)` utility from `permissions.js` to gate UI elements.
 
---
 
## 11. Plan Tiers and Quota Enforcement
 
Sourced from `License_code.gs` (`checkPaymentStatus_`) and `Founderpanel_code.gs`.
 
There are two stages, not tiers. The product model is: full experience on trial, same full experience on paid. The only difference is time.
 
| Stage | Risk Limit | User Limit | Workspaces Owned | Duration | Notes |
|---|---|---|---|---|---|
| TRIAL | 1,000 | 25 | 1 | 14 days from `trial_start_date` | Full access, no feature restrictions |
| PAID (Annual) | 1,000 | 25 | 3 | 365 days from `payment_date` | Full access |
| EXPIRED | 0 | 0 | - | - | Workspace suspended, read-only access to export data only |
 
### Workspace Ownership Rule
 
The workspace limit applies to workspaces an account **created**, not workspaces they belong to. Being invited as a Manager or Analyst in another workspace does not count against this limit.
 
### Enforcement Rules
 
- Quota is enforced at the service layer in Python, not only the frontend
- `services/risk.py` checks risk count against limit before every create and import operation
- Import respects the same limit, rows that would exceed the limit are skipped and reported back in the response
- At 80% of the risk limit (800 risks), a soft warning is shown in the UI. No hard block yet
- At 100% (1,000 risks), creates and imports are blocked with a clear message
### Constants: Single Definition Rule
 
Every limit, threshold, duration, and default value is defined once in a constants file. No magic numbers anywhere else in the codebase. All service files and route files import from these.
 
**Backend:** `backend/app/core/config.py`
 
```python
# Billing
TRIAL_DURATION_DAYS = 14
PAID_DURATION_DAYS = 365
EXPIRY_REMINDER_DAYS = 30
 
# Per-workspace limits
MAX_RISKS = 1000
MAX_USERS = 25
RISK_WARNING_THRESHOLD = 0.80   # soft warning at 80%, hard block at 100%
 
# Per-account workspace ownership limits
MAX_WORKSPACES_TRIAL = 1
MAX_WORKSPACES_PAID = 3
 
# Activity feed
ACTIVITY_FEED_CAP = 200
 
# Recycle bin
RECYCLE_BIN_TTL_DAYS = 30
 
# Heartbeat
PRESENCE_WINDOW_SECONDS = 110
 
# Defaults
DEFAULT_CURRENCY = "₦"
DEFAULT_MODULES = ["risk"]
DEFAULT_ROLE = "Analyst"
DEFAULT_PLAN = "TRIAL"
 
# Modules
MODULE_RISK = "risk"
MODULE_INCIDENT = "incident"
VALID_MODULES = ["risk", "incident"]
```
 
**Frontend:** `frontend/src/utils/constants.ts`
 
```typescript
export const MAX_RISKS = 1000;
export const RISK_WARNING_THRESHOLD = 0.80;
export const MAX_USERS = 25;
export const MAX_WORKSPACES_TRIAL = 1;
export const MAX_WORKSPACES_PAID = 3;
export const DEFAULT_CURRENCY = "₦";
export const MODULE_RISK = "risk";
export const MODULE_INCIDENT = "incident";
export const VALID_MODULES = ["risk", "incident"];
export const DEFAULT_MODULES = ["risk"];
```
 
### Expiry Behaviour
 
Sourced from `Founderpanel_code.gs` (`checkExpiringLicenses`).
 
- 30 days before annual expiry, a renewal reminder email is sent to the workspace owner
- On the day of expiry, the workspace moves to EXPIRED status
- EXPIRED workspaces can read existing data but cannot create, edit, or delete anything
- Payment is activated manually by the founder via the Founder Panel
- A receipt email is sent to the owner on payment confirmation, covering the payment date and new expiry date
---
 
## 12. Module System
 
Modules gate access to entire sections of the app. The `modules` field on a tenant is an array of string keys. The frontend checks `modules.includes('risk')` and `modules.includes('incident')` before rendering nav items and routes. The backend checks the same in route dependencies before processing requests.
 
There are two module keys and three valid subscription tiers:
 
| Tier | modules value | What the client gets |
|---|---|---|
| Risk only | `["risk"]` | Risk Register, AI insights, dashboard, report builder, audit log |
| Incident only | `["incident"]` | Incident management, AI impact and actions, audit log |
| Unified | `["risk", "incident"]` | Full platform, both modules, all features |
 
The default for all new workspaces is `["risk"]`. The Founder Panel assigns the correct modules when activating a paid workspace.
 
### Enforcement Rules
 
- A request to a risk route when `modules` does not include `"risk"` returns 403
- A request to an incident route when `modules` does not include `"incident"` returns 403
- The frontend hides nav items for modules the workspace does not have access to
- Both layers enforce this independently, frontend for UX, backend for security
### Constants
 
```python
# config.py
MODULE_RISK = "risk"
MODULE_INCIDENT = "incident"
VALID_MODULES = ["risk", "incident"]
DEFAULT_MODULES = ["risk"]
```
 
```typescript
// constants.ts
export const MODULE_RISK = "risk";
export const MODULE_INCIDENT = "incident";
export const DEFAULT_MODULES = ["risk"];
```
 
---
 
## 13. Database Schema
 
All tables include `created_at TIMESTAMPTZ DEFAULT now()` and `updated_at TIMESTAMPTZ DEFAULT now()` unless noted.
 
### accounts
 
One row per person. Holds identity only. Created on first signup via Supabase Auth.
 
```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  last_login TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
 
### tenants
 
One row per workspace. Holds all workspace-level configuration and billing state.
 
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  plan TEXT NOT NULL DEFAULT 'TRIAL',
  trial_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_active BOOLEAN NOT NULL DEFAULT false,
  payment_date DATE,
  plan_expires_at DATE,
  max_risks INT NOT NULL DEFAULT 1000,
  max_users INT NOT NULL DEFAULT 25,
  modules TEXT[] NOT NULL DEFAULT ARRAY['risk'],
  currency_symbol TEXT NOT NULL DEFAULT '₦',
  logo_url TEXT,
  report_settings JSONB,
  workspace_settings JSONB,
  pin_hash TEXT,
  created_by UUID NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
 
### workspace_members
 
Joins accounts to tenants. Holds role and permissions per workspace. One account can have many rows here.
 
```sql
CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL DEFAULT 'Analyst',
  permissions JSONB,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  invited_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, tenant_id)
);
```
 
### risks
 
```sql
CREATE TABLE risks (
  id TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  category TEXT,
  description TEXT,
  primary_impact TEXT,
  owner TEXT,
  owner_email TEXT,
  logged_at DATE,
  likelihood INT,
  impact_score INT,
  severity NUMERIC,
  level TEXT,
  treatment TEXT,
  controls TEXT,
  control_effectiveness INT,
  residual NUMERIC,
  overall_rating NUMERIC,
  mitigation_plan TEXT,
  comments TEXT,
  ai_insight TEXT,
  score_delta NUMERIC DEFAULT 0,
  movement TEXT,
  freshness TEXT,
  target_date DATE,
  mitigation_status TEXT DEFAULT 'Open',
  last_reviewed_at TIMESTAMPTZ,
  control_last_tested DATE,
  control_test_result TEXT DEFAULT 'Not Tested',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, tenant_id)
);
```
 
### incidents
 
```sql
CREATE TABLE incidents (
  id TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  title TEXT,
  description TEXT,
  category TEXT,
  severity TEXT,
  priority TEXT,
  status TEXT DEFAULT 'Open',
  root_cause TEXT,
  assigned_to TEXT,
  reported_by TEXT,
  reported_at DATE,
  resolved_at TIMESTAMPTZ,
  financial_impact NUMERIC,
  ai_impact TEXT,
  ai_actions TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, tenant_id)
);
```
 
### audit_logs
 
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_email TEXT,
  action TEXT,
  module TEXT,
  record_id TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
 
### activity_feed
 
```sql
CREATE TABLE activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  risk_id TEXT,
  risk_title TEXT,
  action_type TEXT,
  old_value NUMERIC,
  new_value NUMERIC,
  user_email TEXT,
  category TEXT,
  level TEXT,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
 
Activity feed is capped at 200 entries per tenant. On insert, if count exceeds 200, the oldest entry is deleted.
 
### risk_history
 
```sql
CREATE TABLE risk_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  risk_id TEXT,
  residual_score NUMERIC,
  changed_by TEXT,
  recorded_at TIMESTAMPTZ DEFAULT now()
);
```
 
### snapshots_monthly
 
```sql
CREATE TABLE snapshots_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  month_key TEXT NOT NULL,
  month_label TEXT,
  month_date DATE,
  avg_residual NUMERIC,
  high_risk_count INT,
  total_risks INT,
  control_effectiveness NUMERIC,
  open_incidents INT,
  avg_mttr NUMERIC,
  financial_impact NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, month_key)
);
```
 
### snapshots_daily
 
```sql
CREATE TABLE snapshots_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  date_key TEXT NOT NULL,
  snapshot_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, date_key)
);
```
 
### recycle_bin
 
```sql
CREATE TABLE recycle_bin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_data JSONB NOT NULL,
  deleted_by TEXT,
  purge_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
 
TTL is 30 days. A scheduled job runs daily to permanently delete rows where `purge_at < now()`.
 
### lookups
 
```sql
CREATE TABLE lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  category TEXT[] DEFAULT ARRAY[]::TEXT[],
  treatment TEXT[] DEFAULT ARRAY[]::TEXT[],
  likelihood TEXT[] DEFAULT ARRAY[]::TEXT[],
  impact_level TEXT[] DEFAULT ARRAY[]::TEXT[],
  risk_owner TEXT[] DEFAULT ARRAY[]::TEXT[],
  incident_category TEXT[] DEFAULT ARRAY[]::TEXT[],
  incident_severity TEXT[] DEFAULT ARRAY[]::TEXT[],
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id)
);
```
 
### external_submissions
 
```sql
CREATE TABLE external_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  submission_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  submitter_email TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewed_by TEXT,
  return_message TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
 
### notification_prefs
 
```sql
CREATE TABLE notification_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_email TEXT NOT NULL,
  brief_frequency TEXT DEFAULT 'daily',
  opted_out BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_email)
);
```
 
---
 
## 14. Key Business Logic to Preserve
 
### Risk Scoring Engine
 
Sourced from `RiskService.gs` (`computeRiskFields_`).
 
Inputs: `likelihood` (1-5), `impact_score` (1-5), `control_effectiveness` (0-100)
 
```
severity = likelihood x impact_score
residual = severity x (1 - control_effectiveness / 100)
level = Critical (>= 20), High (>= 12), Medium (>= 6), Low (< 6)
overall_rating = residual rounded to 2dp
```
 
This computation runs in `services/risk.py` on every create and update. It also runs as a utility in `utils/scoring.js` on the frontend for instant preview in the Add/Edit Risk modal.
 
### Score Delta and Movement
 
Sourced from `PhaseOne.gs`.
 
On every risk update that changes `residual`:
- `score_delta = new_residual - prev_residual`
- `movement = Improving` (delta < -0.5), `Worsening` (delta > 0.5), `Stable` (within -0.5 to +0.5)
- `freshness = Fresh` (updated within 30 days), `Stale` (beyond 30 days)
This logic runs atomically inside `services/risk.py` on every update. It is not a separate job.
 
### Activity Feed Cap
 
Sourced from `PhaseOne.gs` (`logActivity_`).
 
After every insert into `activity_feed`, if the tenant's count exceeds 200, delete the oldest row for that tenant. This is enforced in `services/phase_one.py`.
 
### Dashboard Cache Invalidation
 
In GAS, `CacheService` was invalidated on every mutation. In v2, TanStack Query handles this on the frontend via `queryClient.invalidateQueries()` after every successful mutation. There is no server-side cache to maintain for the dashboard.
 
### Recycle Bin
 
Soft delete moves the record to `recycle_bin` with `purge_at = now() + 30 days`. The original row is deleted from `risks` or `incidents`. Restore writes the `item_data` JSON back to the original table. A daily APScheduler job purges rows where `purge_at < now()`.
 
### Bulk Import Quota Check
 
Sourced from `RiskService.gs` (`api_importRisks`).
 
Before processing any import row, check `current_risk_count + rows_to_import` against the plan limit. Reject rows that would exceed the limit and return a count of skipped rows in the response.
 
### Report Builder Blocks
 
Sourced from `Reportservice.gs`. 16 named compute functions, each maps to a block key:
 
`exposure_index`, `risk_snapshot`, `key_risk_changes`, `incident_stability`, `ai_exec_summary`, `executive_commentary`, `exposure_trend`, `residual_risk_trend`, `risk_distribution`, `incident_trend`, `top_risks`, `top_emerging_risks`, `major_incidents`, `findings`, `recommendations`, `conclusion`, `risk_ownership`, `incident_analytics`, `executive_dashboard`, `key_risk_movements`
 
Each block key maps to a compute function in `services/report.py`. The frontend canvas sends a list of selected block keys and a date range. The backend computes each block and returns the data. AI narrative is generated separately via `/api/v1/reports/narrative`.
 
### Brief Cadences
 
Sourced from `Briefservice.gs`. Five cadences, each with its own section selection logic:
 
- Daily exception report (stale risks, high movements, open incidents)
- Weekly digest (7-day deltas, incident velocity)
- Biweekly accountability (owner assignments)
- Monthly posture (control metrics, concentration)
- Quarterly board summary
Cadence is determined per-user via `notification_prefs.brief_frequency`. The APScheduler daily job checks each user's frequency setting and sends only when the cadence is due.
 
---
 
## 15. Scheduled Jobs
 
All jobs run inside FastAPI via APScheduler with a Postgres job store so state persists across restarts.
 
| Job | Schedule | Source GAS Trigger | Python Location |
|---|---|---|---|
| Monthly snapshot | 1st of each month, midnight | `runMonthlySnapshot` | `scheduler/jobs.py` |
| Daily snapshot | Every day, midnight | `runDailySnapshot` | `scheduler/jobs.py` |
| Daily freshness check | Every day, 6am | `api_dailyFreshnessJob` | `scheduler/jobs.py` |
| Recycle bin purge | Every day, 2am | `runDailyPurge` | `scheduler/jobs.py` |
| Morning brief dispatch | Every day, 7am | `api_sendMorningBriefing` | `scheduler/jobs.py` |
| Last login update | Fire-and-forget on login | `updateLastLogin_Trigger` | async task in auth route |
 
---
 
## 16. Heartbeat and Presence
 
Sourced from `UserService.gs` (`api_heartbeat`, `api_getActiveUsers`).
 
The frontend pings `/api/v1/users/heartbeat` every 90 seconds with the current user's email and tenant. The backend stores the timestamp in the `users` table (`last_seen`). Active users are those with `last_seen` within the last 110 seconds. This replaces the GAS `PropertiesService` presence store.
 
---
 
## 17. External Submission Flow
 
Sourced from `ExternalRiskService.gs` and `DoGet.gs`.
 
Two public routes require no authentication:
- `POST /api/v1/external/risk` — submits to `external_submissions` with `status = PENDING`
- `POST /api/v1/external/incident` — same table, `submission_type = incident`
Internal routes (authenticated, Owner or Manager only):
- `GET /api/v1/external/pending` — list pending submissions
- `POST /api/v1/external/approve/:id` — approve and promote to risks or incidents table
- `POST /api/v1/external/return/:id` — return to submitter with message (sends email via Resend)
The external form pages (`ExternalRisk.jsx`, `ExternalIncident.jsx`) are public routes in React with no auth wrapper. They accept a `?tenant_id=` query parameter to identify the workspace.
 
---
 
## 18. AI Integration
 
### Risk AI
 
Sourced from `RegisterAI.gs`.
 
Route: `POST /api/v1/risks/ai`
 
Payload: `{ target: "all" | "selected" | "empty", confidence: "conservative" | "balanced" | "aggressive", notes: "", risk_ids: [] }`
 
The service iterates over matching risks, calls the Anthropic API for each, and writes the insight back to the risk record. Uses `asyncio.gather` with a concurrency limit to avoid rate limiting.
 
### Incident AI
 
Sourced from `IncidentAI.gs`.
 
Routes:
- `POST /api/v1/incidents/:id/ai/impact` — generates impact analysis
- `POST /api/v1/incidents/:id/ai/actions` — generates corrective action recommendations
### Report AI Narrative
 
Sourced from `Reportservice.gs` (`api_generateReportNarrative`).
 
Route: `POST /api/v1/reports/narrative`
 
Payload: block key and block data. Returns AI-generated narrative text for that block.
 
### Category and Severity Suggestion
 
Sourced from `IncidentAI.gs` (`api_suggestIncidentCategory`, `api_suggestIncidentSeverity`).
 
Routes:
- `POST /api/v1/incidents/suggest/category`
- `POST /api/v1/incidents/suggest/severity`
These are called from the Add Incident modal as the user types the description.
 
---
 
## 19. Environment Variables
 
### Backend (.env)
 
```
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=
JWT_SECRET=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
ANTHROPIC_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
APP_ENV=development
FRONTEND_URL=
```
 
### Frontend (.env)
 
```
VITE_API_BASE_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
 
---
 
## 20. Local Development Setup
 
### Backend
 
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
 
### Frontend
 
```bash
cd frontend
npm install
npm run dev
```
 
### Local Postgres (for Alembic sync only)
 
Run a local Postgres instance (Docker recommended) that mirrors the Supabase schema. Alembic runs against this. Supabase SQL editor runs the same SQL for the hosted environment.
 
---
 
## 21. Deployment
 
### Backend (Render)
 
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Environment: add all backend `.env` variables in the Render dashboard
- Plan: Starter ($7/month) for always-on
### Frontend (Vercel)
 
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment: add `VITE_` variables in the Vercel dashboard
- Auto-deploys on push to `main`
---
 
## 22. Data Migration from GAS
 
The GAS version stores all tenant data in individual Google Spreadsheets (one per tenant). Migration requires:
 
1. Export each tenant's Spreadsheet as CSV or read via Google Sheets API
2. Run a migration script per tenant that maps each sheet (Risk Register, Incidents, etc.) to the corresponding Postgres table
3. Assign a new `tenant_id` UUID and map all foreign key references
4. Validate row counts before and after
This is a dedicated sprint. Do not begin migration until the v2 schema is confirmed stable and all Alembic migrations are committed.
 
---
 
## 24. Error Handling
 
### Backend
 
Every route function and every service function is wrapped in try/except. No exception is ever swallowed silently. Every except block either raises a handled HTTPException or logs the error with full context before returning the envelope error response.
 
**Pattern for route handlers:**
 
```python
from fastapi import HTTPException
import logging
 
logger = logging.getLogger(__name__)
 
@router.post("/risks")
async def create_risk(payload: RiskCreate, tenant=Depends(get_tenant)):
    try:
        result = await risk_service.create(tenant.id, payload)
        return {"data": result, "error": None, "meta": {}}
    except QuotaExceededError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("create_risk failed | tenant=%s | error=%s", tenant.id, str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="An unexpected error occurred. Please try again.")
```
 
**Pattern for service functions:**
 
```python
async def create(tenant_id: UUID, payload: RiskCreate) -> dict:
    try:
        # business logic
        ...
    except QuotaExceededError:
        raise
    except Exception as e:
        logger.error("risk_service.create failed | tenant=%s | %s", tenant_id, str(e), exc_info=True)
        raise
```
 
**Rules:**
 
- Never return a raw Python exception message to the client. Always return a human-readable message
- Domain errors (quota exceeded, permission denied, not found) use specific exception classes defined in `core/exceptions.py`, not generic Exception
- 404 errors always state what was not found: "Risk R-001 not found" not "Not found"
- 403 errors always state why: "Your plan does not permit this action" not "Forbidden"
- 500 errors never expose stack traces or internal details to the client. Log internally, return a safe message
- All database errors are caught at the service layer, not the route layer
**Custom exceptions in `core/exceptions.py`:**
 
```python
class QuotaExceededError(Exception): pass
class WorkspaceLimitError(Exception): pass
class PermissionDeniedError(Exception): pass
class ResourceNotFoundError(Exception): pass
class TrialExpiredError(Exception): pass
class PlanExpiredError(Exception): pass
class DuplicateResourceError(Exception): pass
```
 
### Frontend
 
Every API call is wrapped in try/catch. No promise is left unhandled. Errors are never silently swallowed. The user always receives feedback.
 
**Pattern for service calls:**
 
```js
// services/risks.js
export async function createRisk(payload) {
  try {
    const res = await api.post("/risks", payload);
    return res.data;
  } catch (err) {
    const message = err.response?.data?.detail || "Failed to create risk. Please try again.";
    throw new Error(message);
  }
}
```
 
**Pattern for component usage:**
 
```js
const handleSubmit = async () => {
  try {
    setLoading(true);
    await createRisk(payload);
    showToast("Risk created successfully", "success");
    onClose();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setLoading(false);
  }
};
```
 
**Rules:**
 
- Every async action has three states handled: loading, success, error
- Loading state disables the submit button and shows a spinner
- Success state shows a toast and closes the modal or resets the form
- Error state shows a toast with the exact message from the backend, never a generic "Something went wrong" unless the backend truly returned nothing useful
- Network errors (no response at all) show: "Network error. Please check your connection and try again."
- 401 errors trigger an automatic redirect to login, handled globally in the axios interceptor in `services/api.js`
- 403 errors show the exact reason from the backend, never silently hide the action
- Form validation errors are shown inline on the field, not as a toast
---
 
## 25. Database Indexing
 
Every foreign key and every column used in a WHERE clause, ORDER BY, or JOIN gets an index. Indexes are defined in the migration files alongside the table creation, not added later.
 
**Required indexes on every tenant-scoped table:**
 
```sql
-- Always index tenant_id — every query filters by it
CREATE INDEX idx_risks_tenant_id ON risks(tenant_id);
CREATE INDEX idx_incidents_tenant_id ON incidents(tenant_id);
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_activity_feed_tenant_id ON activity_feed(tenant_id);
CREATE INDEX idx_risk_history_tenant_id ON risk_history(tenant_id);
CREATE INDEX idx_snapshots_monthly_tenant_id ON snapshots_monthly(tenant_id);
CREATE INDEX idx_recycle_bin_tenant_id ON recycle_bin(tenant_id);
CREATE INDEX idx_workspace_members_account_id ON workspace_members(account_id);
CREATE INDEX idx_workspace_members_tenant_id ON workspace_members(tenant_id);
```
 
**Additional indexes for common query patterns:**
 
```sql
-- Risks: filter by level, owner, status
CREATE INDEX idx_risks_level ON risks(tenant_id, level);
CREATE INDEX idx_risks_owner ON risks(tenant_id, owner_email);
CREATE INDEX idx_risks_mitigation_status ON risks(tenant_id, mitigation_status);
 
-- Incidents: filter by status, severity
CREATE INDEX idx_incidents_status ON incidents(tenant_id, status);
CREATE INDEX idx_incidents_severity ON incidents(tenant_id, severity);
 
-- Audit log: ordered by created_at descending
CREATE INDEX idx_audit_logs_created_at ON audit_logs(tenant_id, created_at DESC);
 
-- Activity feed: ordered by created_at descending
CREATE INDEX idx_activity_feed_created_at ON activity_feed(tenant_id, created_at DESC);
 
-- Recycle bin: purge job filters by purge_at
CREATE INDEX idx_recycle_bin_purge_at ON recycle_bin(purge_at);
 
-- Snapshots: ordered by month
CREATE INDEX idx_snapshots_month ON snapshots_monthly(tenant_id, month_date DESC);
 
-- Tenants: expiry check job
CREATE INDEX idx_tenants_plan_expires_at ON tenants(plan_expires_at);
```
 
**Rules:**
 
- Composite indexes always put `tenant_id` first. Queries always filter by tenant first
- Never add an index without understanding the query it supports
- Every new table added in the future must have its `tenant_id` indexed in the same migration
---
 
## 26. Database Transactions and Rollbacks
 
Any operation that writes to more than one table must run inside a transaction. If any step fails, the entire operation rolls back. Partial writes are never acceptable.
 
**Pattern in service functions:**
 
```python
from sqlalchemy.ext.asyncio import AsyncSession
 
async def approve_external_submission(db: AsyncSession, submission_id: UUID, reviewer_email: str):
    async with db.begin():
        try:
            # Step 1: fetch submission
            submission = await db.get(ExternalSubmission, submission_id)
            if not submission:
                raise ResourceNotFoundError(f"Submission {submission_id} not found")
 
            # Step 2: create risk from submission data
            risk = Risk(**submission.payload, tenant_id=submission.tenant_id)
            db.add(risk)
 
            # Step 3: update submission status
            submission.status = "APPROVED"
            submission.reviewed_by = reviewer_email
            submission.reviewed_at = datetime.utcnow()
 
            # Step 4: log audit
            db.add(AuditLog(
                tenant_id=submission.tenant_id,
                user_email=reviewer_email,
                action="APPROVE",
                module="External",
                record_id=str(submission_id),
                summary=f"Approved external submission and created risk"
            ))
 
            await db.flush()
            # All steps succeeded — transaction commits on context manager exit
 
        except Exception as e:
            # Transaction rolls back automatically on exception
            logger.error("approve_external_submission failed | %s", str(e), exc_info=True)
            raise
```
 
**Rules:**
 
- Any operation touching more than one table uses `async with db.begin()`
- Never call `db.commit()` manually inside a service function. Commit is handled by the context manager or the FastAPI dependency
- `await db.flush()` is used to catch constraint violations before the commit, not after
- Rollback is automatic on any unhandled exception inside the `begin()` block
- Operations that must stay consistent: approve external submission, restore from recycle bin, create risk with audit log, bulk import, delete with recycle bin write
---
 
## 27. Query Performance Rules
 
- Never use `SELECT *`. Always select only the columns the response needs
- Paginate all list endpoints. Default page size is 50. Maximum page size is 200
- Dashboard KPI queries use aggregation at the database level (COUNT, AVG, SUM in SQL), never fetch all rows and aggregate in Python
- The activity feed query always includes `ORDER BY created_at DESC LIMIT 200`
- Snapshot queries always filter by `tenant_id` and `month_date` range, never full table scan
- The recycle bin purge job uses a single DELETE WHERE query, never fetch-then-delete in a loop
- For the report builder, each block computes independently. No block query depends on the result of another block query. They run concurrently using `asyncio.gather`
The following GAS features are not in scope for v2 initially:
 
- Founder panel (internal admin tool, separate concern)
- Template service (workspace template provisioning, replaced by Supabase onboarding)
- Legacy License Server (replaced entirely by Supabase Auth + `tenants` table)
- Unified Onboarding Server (replaced by a React onboarding flow + FastAPI provisioning endpoint)
These may be added in a later phase.
 
---
 
## 28. Security Architecture
 
### Token Design
 
Every access token carries a `type: "access"` claim. Every refresh token carries `type: "refresh"` and a `token_version` integer. The `get_current_account` dependency rejects any token where `type` is not `"access"`. This prevents a refresh token from being used as a Bearer credential.
 
Access tokens expire in 15 minutes. Refresh tokens expire in 7 days and are stored in an HttpOnly cookie.
 
### Token Revocation via token_version
 
The `accounts` table has a `token_version INT NOT NULL DEFAULT 1` column. Every refresh token is stamped with the `token_version` at time of issue. On every refresh call, the backend fetches the account from the database and compares the token's version against the stored version. If they differ, the token is rejected.
 
To revoke all outstanding tokens for an account, increment `token_version`. This happens automatically when a member is deactivated.
 
Triggers for incrementing token_version:
- Admin deactivates a workspace member
- Password change (when implemented)
- Explicit logout-all-devices action (when implemented)
### PIN Lockout
 
If a workspace has a PIN set, every login or workspace select requires PIN verification at `/api/v1/auth/verify-pin`. The `tenants` table has two columns for lockout:
 
- `pin_attempts INT NOT NULL DEFAULT 0`
- `pin_locked_until TIMESTAMPTZ`
After 5 consecutive failures, the PIN is locked for 15 minutes. Attempts reset to 0 on success or after the lockout expires. IP-based rate limiting (10/minute) provides a secondary layer.
 
### Last Owner Protection
 
`services/user.py` prevents deactivating the last Owner of a workspace. Before marking a member as INACTIVE, the service counts active Owners. If the count is 1 and the member being deactivated is that Owner, a PermissionDeniedError is raised. A workspace with no Owner has no recovery path.
 
### Rate Limiting
 
`slowapi` is used for rate limiting. The limiter is a singleton in `core/rate_limit.py` and registered on `app.state.limiter` in `main.py`. Limits:
 
- POST /auth/login: 5/minute
- POST /auth/register: 3/minute
- POST /auth/select-workspace: 10/minute
- POST /auth/verify-pin: 10/minute
- POST /auth/refresh: 20/minute
### Workspace Plan Check
 
Workspace ownership limits are always read from the database, never from the JWT. The JWT may be stale if a plan changed after login. The `create_workspace` route queries `tenants` directly for the count of owned workspaces.
 
---
 
## 29. Supabase Client Initialisation
 
The Supabase Python client in `services/auth.py` is lazy-loaded, not module-level. Module-level instantiation would fail at server startup if `SUPABASE_URL` is missing or invalid.
 
```python
_supabase = None
 
def _get_supabase():
    global _supabase
    if _supabase is None:
        _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _supabase
```
 
Every auth function that calls Supabase uses `_get_supabase()`, never `_supabase` directly.
 
---
 
## 30. Migration Rules (Addendum)
 
asyncpg does not allow multiple SQL statements in a single `op.execute()` call. Every DDL statement must be its own call:
 
```python
# WRONG - fails with asyncpg ProgrammingError
def upgrade() -> None:
    op.execute("""
        CREATE INDEX idx_a ON table_a(col);
        CREATE INDEX idx_b ON table_b(col);
    """)
 
# CORRECT
def upgrade() -> None:
    op.execute("CREATE INDEX idx_a ON table_a(col);")
    op.execute("CREATE INDEX idx_b ON table_b(col);")
```
 
This applies to all migrations. Every table creation, index, constraint, and column alteration must be a separate `op.execute()` call.
 
---
 
## 31. Frontend Design System
 
The React frontend CSS is ported faithfully from the GAS `Styles.html` file. The GAS version is the visual reference. `src/index.css` is the sole CSS source of truth.
 
### Key design decisions from the original
 
- App layout: CSS Grid with `grid-template-columns: 260px 1fr`, collapses to `68px 1fr`
- Sidebar: light background `#f8fafc`, right border, collapsible to icon-only mode
- Topbar: glassmorphism `rgba(246,248,250,.85)` with `backdrop-filter: blur(10px)`
- Border radius: `--radius: 14px`, `--radius2: 18px` throughout
- Font weight: 700 for nav items and buttons, 800-900 for headings and table headers
- Table headers: navy `#1F2854` background, white text, font-weight 900, sticky
- Dark mode: `[data-theme="dark"]` attribute on `document.documentElement`, not a CSS class
- Auth page layout: 55% navy left panel, 45% warm cream `#F5F4EF` right panel
### Dark mode
 
Dark mode is controlled by the `uiStore.theme` value (`light`, `dark`, `auto`). When theme changes, `applyTheme()` writes `data-theme` to `document.documentElement`. The persisted value is restored on hydration via `onRehydrateStorage`.
 
### Inline styles
 
Inline styles are permitted for simple one-off values where creating a CSS class would add more complexity than the style itself. Examples: single accent color on a span, max-width on a narrow wrapper, simple flex layout on a one-off container.
 
Inline styles are not permitted for: layout-critical styles, dark mode affected styles, anything that repeats across multiple components.
 
---
 
## 32. Frontend Auth Flow
 
### Registration
 
1. User visits `/register`
2. Fills name, email, password, confirm password
3. Frontend validates: password length >= 8, passwords match
4. POST `/api/v1/auth/register`
5. Backend calls `supabase.auth.sign_up`, creates `accounts` row, returns base token
6. Frontend stores token, redirects to `/workspaces/create`
7. User creates first workspace, redirected to `/`
### Login
 
1. User visits `/login`
2. POST `/api/v1/auth/login`
3. Backend calls `supabase.auth.sign_in_with_password`
4. If one workspace and no PIN: workspace-scoped token issued, redirect to `/`
5. If one workspace with PIN: base token with `pending_tenant_id`, redirect to `/verify-pin`
6. If multiple workspaces: base token with workspaces list, redirect to `/workspaces`
### Workspace selection
 
1. User at `/workspaces` selects a workspace
2. POST `/api/v1/auth/select-workspace`
3. If PIN set: redirect to `/verify-pin`
4. If no PIN: workspace-scoped token issued, redirect to `/`
### Password reset
 
1. User clicks "Forgot password?" on `/login`
2. `/forgot-password` calls `supabase.auth.resetPasswordForEmail` with redirect to `/reset-password`
3. Supabase sends email with link
4. User clicks link, lands on `/reset-password`
5. Page listens for `PASSWORD_RECOVERY` auth state event
6. Once ready, user enters new password
7. `supabase.auth.updateUser({ password })` updates the password
8. User redirected to `/login`
**Supabase dashboard config required:**
- Site URL: production Vercel domain
- Allowed redirect URLs: `https://your-domain.vercel.app/reset-password` and `http://localhost:5173/reset-password`
---
 
## 33. Frontend Type Conventions
 
`src/types/api.ts` is the canonical source for shared types: `ApiResponse`, `PaginatedResponse`, `ModuleKey`, `PlanStage`, `UserRole`, `Permissions`.
 
`src/types/auth.ts` imports from `api.ts` and extends with auth-specific types: `WorkspaceInfo`, `AuthClaims`, `LoginResult`.
 
`src/utils/constants.ts` exports runtime arrays for UI dropdowns: `ROLES`, `PLANS`, `INDUSTRIES`. It also exports business constants: `MAX_RISKS`, `MAX_USERS`, `TRIAL_DURATION_DAYS`, etc.
 
Never redefine types that already exist in `api.ts`. Never import from `auth.ts` when the type is in `api.ts`.
 
---
 
## 34. Frontend Validation Rules
 
Every input in the application must be validated. Validation runs on blur for each field (not only on submit). The `.invalid` CSS class is applied to the input element when it fails. A field-level error message appears below the input.
 
### Required validations
 
- Email: valid email format
- Password (new): minimum 8 characters, strength indicator (weak/fair/strong)
- Password (confirm): must match password field
- Name: minimum 2 characters
- Text fields: trim whitespace before validating, reject empty strings
- Numbers: within defined range, correct type
### Pattern
 
```typescript
const [fieldError, setFieldError] = useState('');
 
function validateEmail(value: string): string {
  if (!value) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
  return '';
}
 
// On blur
onBlur={(e) => setFieldError(validateEmail(e.target.value))}
 
// On input element
className={`form-input${fieldError ? ' invalid' : ''}`}
 
// Error display below input
{fieldError && <p className="form-error">{fieldError}</p>}
```
 
Validate all fields on submit as a final pass before the API call. If any field has an error, focus the first failing field and abort the submission.