# SmartRisk Pulse v2, Session Archive

Older session summaries moved out of `SMARTRISK_V2_BUILD.md`, which keeps only the last 3. Read this file only when a decision's history is needed.

---

### Session 30: November 15 to 16, 2026, Partner UI Fixes, Ask Pulse Stage 1, AI Status From the Matrix

Built on staging 0354ca2. Everything was delivered as patches in this order. Claude did not commit or push.

**Completed:**

**1. Partner UI corrections (`ui-fixes-1-3.patch`, 11 frontend files)**
- The Home greeting reads "<org>'s risk posture is <status>" in bold. `<org>` is `tenants.workspace_settings.organization`, falling back to the workspace name.
- The email is no longer shown in the sidebar profile or the topbar menu. They show `first_name` from the Home data, or "My account".
- The plan value `PAID` is shown as PRO through `planLabel()` and `PLAN_LABELS` in `src/utils/constants.ts`, in WorkspacePicker, Users and Settings too. This is a label only: the stored value stays `PAID`, with no migration.
- New class `.pl-stat.pl-stat-solid` (white, with a dark-mode rule on `var(--pl-bg-card)`) is used on the Overview, Incidents and Trends stat cards.
- Checks: npm ci, lint (0 errors, 2 existing warnings) and build pass.

**2. Ask Pulse stage 1 (`ask-pulse-stage1.patch`, the partner's patch corrected)**
- The partner wrote it on main 8a7e872. It was rebased onto staging.
- Fixes: an Analytics help entry was added (47 entries, up from 18), the add-risk and incident-workflow entries point to `/risks/new` and `/incidents/new`, `HELP_REPORT_EMAIL` is blanked in `backend/conftest.py`, inline styles in `Help.tsx` moved to `index.css`, and an em dash was removed.
- Checks: 102 pytest pass on a fresh PostgreSQL 16 database (the partner's original had 1 failure). Pinned ruff 0.8.0 is clean on the changed files. Frontend lint and build pass.

**3. AI insight status from the workspace matrix (`ai-status-matrix.patch`)**
- `risk_status.ai_status` and `ai_status_thresholds` work out Escalate, Monitor, Review and Stable from band position (`level_index`) and the matrix's own band minimums, never from band names. The help registry uses the same functions.
- Removed `AI_STATUS_ESCALATE_MIN`, `AI_STATUS_MONITOR_MIN` and `_derive_status` from `ai_risk.py`.
- The 3 existing ruff errors were fixed (admin_panel E712, pptx_report E731, report F541), so `ruff check .` is fully clean.
- `ADMIN_PERMS` moved from `Help.tsx` to `src/utils/permissions.ts`.
- Checks: 110 pytest pass, ruff clean, migrations round trip, lint and build pass.

**4. Top two bands escalate on 5-band matrices (`ai-status-5band-top-two.patch`, add-on to 3)**
- New `ai_escalate_index(bands)`: on 5 bands, Critical and Extreme (17 and up) escalate, High monitors and Medium reviews. Other band counts are unchanged. The help text reads "Critical or Extreme".
- The regenerated `ai-status-matrix.patch` already contains this change. The add-on is only for a tree that has the first version of patch 3.
- Checks: 111 pytest pass, ruff clean.

**5. Ask Pulse short queries (`ask-pulse-short-queries.patch`, frontend only)**
- Cause: `src/utils/helpSearch.ts` dropped add, new, change, changing, edit, update, set and setup as filler words. So "add" found nothing and "add a risk" searched only for "risk".
- Fix: these words are kept as search terms, with synonyms (add, create, new, record; change, edit, update, modify; set and setup to settings).
- New `frontend/tests/helpSearch.test.ts` (5 node:test cases) and the npm script `test:search`. It needs Node 23.6 or later, so it is not in CI (CI runs Node 20).
- Checks: 5 of 5 pass (4 fail on the old code), lint and build pass, 111 backend pytest pass.

**Migrations:** none.

**Files changed this session:**

Backend: `app/api/v1/routes/help.py`, `app/core/config.py`, `app/main.py`, `app/scheduler/jobs.py`, `app/schemas/help.py`, `app/services/ask_pulse.py`, `app/services/email.py`, `app/services/help_registry.py`, `app/services/ai_risk.py`, `app/services/risk_status.py`, `app/services/admin_panel.py`, `app/services/pptx_report.py`, `app/services/report.py`, `conftest.py`, `tests/test_ai_status.py` (new), `tests/test_help_coverage.py`, `tests/test_help_registry.py`

Frontend: `src/components/analytics/IncidentsTab.tsx`, `src/components/analytics/OverviewTab.tsx`, `src/components/analytics/TrendsTab.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Topbar.tsx`, `src/components/help/AskPulse.tsx`, `src/pages/Home.tsx`, `src/pages/Settings.tsx`, `src/pages/Users.tsx`, `src/pages/WorkspacePicker.tsx`, `src/pages/Help.tsx`, `src/types/help.ts`, `src/utils/constants.ts`, `src/utils/helpSearch.ts`, `src/utils/permissions.ts`, `src/index.css`, `tests/helpSearch.test.ts` (new), `package.json`

Docs: `docs/SMARTRISK_V2_BUILD.md`, `docs/SMARTRISK_V2_DECISIONS.md`, `docs/session_archive.md` (new)

**Status:** All 5 patches delivered. The user applied patches 1 to 3 locally. Patches 4 and 5 and this docs patch are still to be applied, then everything is pushed to staging.

**Incomplete (first tasks next session):**
1. Apply `ai-status-5band-top-two.patch` (if not yet applied) and `ask-pulse-short-queries.patch`, run `pytest`, `ruff check .`, `npm run test:search`, `npm run lint` and `npm run build`, then push everything to staging.
2. Check Ask Pulse on staging: "add", "add a risk", "How do I add a risk?" and "export" should each show the matching entry first.
3. On a 5-band workspace, generate AI insights for a Critical risk (expect Escalate) and a High risk (expect Monitor).
4. Partner: send the 48-topic Ask Pulse document, then build Ask Pulse stage 2 (redesigned UI).
5. Get Started step 1 still says "risk exposure index". Reword it.
6. `.github/workflows/ci.yml` does not set `ADMIN_JWT_SECRET`, which the backend tests need. Add it to the CI env.

---

### Session 29: November 13 to 14, 2026, Pulse UI Redesign Rollout (Steps 1 to 7)

The partner's UI pack (pl- tokens and 13 screens) was built in 7 steps, each delivered as a patch with a notes file, then pushed by the user.

**Completed:**
- **Step 1, CSS foundation (staging 1728987):** pl- tokens and components added to `index.css` as a new section, mapped onto the workspace theme variables. One-time CSS scripts removed.
- **Step 2, app shell (f969a1a):** sidebar and top bar restyled.
- **Step 3, Analytics (24ac521):** new `/analytics` page with Overview, Correlation, Trends, Incidents and Activity tabs. Migration 062 (`062_snapshot_health_pressure`).
- **Step 4, Home (16ab812):** `GET /api/v1/home`. Home replaces the dashboard at `/`, with a verdict hero, tiles, next actions, brief, tour and first-time setup.
- **Step 5, Risk Register (eeac009):** migration 063 adds `risks.title`. New `GET /risks/views`, `POST /risks/score-preview` and `GET /risks/{id}/context`. Register rewritten with quick views, `RiskPanel`, and a full-page form at `/risks/new` and `/risks/:id/edit`. The Add, Edit and Detail modals and StatCards were deleted. Residual and appetite are shown as whole numbers, rounded half up in the backend (`int(v + 0.5)`).
- **Step 6, Incidents (9a8db06, then 1c84c92 removed a stray file):** migration 064 sets the stages New, Triaged, Investigating, Remediating, Resolved, Closed (Open becomes Triaged, In Progress becomes Investigating, Under Review becomes Remediating). New `services/incident_status.py`, `GET /incidents/views`, `GET /incidents/{id}/context` and `POST /incidents/target-preview`. List rewritten with `IncidentPanel` and `IncidentFormPage` at `/incidents/new` and `/incidents/:id/edit`. The open panel is kept in the `?incident=` URL. AI page insights are rendered as text, not HTML. Security fix: recycle bin restore and purge now need `manage_risks` or `manage_incidents`. The user tested it on November 14.
- **Step 7, Report Builder (0354ca2):** new sections appetite-breaches, decisions-needed and control-evidence in `report.py` `BLOCK_REGISTRY`, PDF and PPTX. Migration 065 `report_drafts` (one draft per tenant and account) with `GET`, `PUT` and `DELETE /reports/draft`. Security fix: `print_reports` is now required on export, email and template writes. One-screen builder with `utils/reportPresets.ts`, `hooks/useConfirm.ts`, `ReportDetails`, `ReportModals` and pl-rb- CSS.

**Migrations:** 062, 063, 064, 065 (alembic head is 065).

**Deferred from the pack:** Register: bulk owner and decision, action owner, AI accept and dismiss, suggested incident link, next-ID tag, likelihood and impact word labels. Incidents: draft, next-ID tag, AI accept and dismiss, owner-notified line. The old rb- CSS is still in `index.css` and can be removed.

**Status:** Complete and pushed to staging (0354ca2).

---

### Session 28: November 9, 2026, AI Brief Residual Bands

**Completed:**

**AI brief (daily, weekly, monthly, quarterly email)**
- Root cause confirmed: `services_brief.py` `_risk_to_dict` read `Risk.level`, which `services_risk.py` `_score` bands from inherent severity (likelihood x impact) before controls. Every High/Critical count, table, outreach line, preheader and subject used the inherent band.
- The brief now bands each risk from its residual score.
- High/Critical and Critical are decided by band position (`is_elevated_index`, top 2 bands, and the top band), not by the literal names. Renamed bands and the fifth band are now counted. Email text, the High/Critical heading and the subject use the workspace band names.
- Email badge colours come from a backend `tone` field (high, medium, low) on `BriefTableRow`. `BriefPayload` gained `elevated_label` and `top_band_label`.
- Daily snapshot band crossings compare band positions recomputed from the stored residuals on the current matrix, so old snapshots that stored the inherent label do not raise false crossings.

**One band rule (`services_risk_status.py`)**
- Added `band_for_score`, `band_labels`, `band_count`, `elevated_min_index`, `is_elevated_index`, `elevated_phrase`, `residual_max`.
- `services_risk.py` `_score` and the `_band_labels`, `_elevated_phrase`, `_residual_max` helpers in `services_report.py` now delegate to them. Inherent levels are unchanged.

**Other brief flaws fixed**
- Weekly overdue reviews, biweekly accountability and outreach used a hardcoded 30 days instead of `brief_stale_threshold`.
- Four copies of the overdue action check replaced by `risk_status.is_past_target`.
- Brief health score divided by a fixed 25. It now uses `likelihood_scale x impact_scale`.

**Verification:** ruff shows no new warnings on the changed files, all files compile, and a smoke test with renamed 4-band and 5-band configs gave the expected bands, counts, heading and subject. `git apply --check` passes on staging 76c57b2. pytest (needs PostgreSQL) and `tsc --noEmit` were not run.

**Migrations:** none.

**Files changed this session (in `brief-residual-band.patch`):**

Backend: `services_risk_status.py`, `services_risk.py`, `services_report.py`, `services_brief.py`, `services_snapshot.py`, `services_email.py`, `schemas_brief.py`

Frontend: `types_brief.ts`

**Status:** Applied and pushed to staging in commit 2f3f294 (November 9, 2026).

**Incomplete (first tasks next session):**
1. Done: the patch is in staging 2f3f294. Still to do: send a test brief and confirm risks with strong controls no longer show as High/Critical.
2. Partner review: in a 5-band workspace "elevated" is the top 2 bands (band 3 is not flagged). If the partner wants band 3 included, change `elevated_min_index` only; it also changes the register `is_elevated` flag and reports.
3. Residual formula confirmation with partner is still open. The brief bands now depend on it.

---

### Session 27: October 14 to 19, 2026, Unified Product, Report Export, Access Security, Theming

**Completed:**

**Dashboard AI**
- Executive Intelligence brief no longer invents organisation or company names. Rule added to the `ai_unified.py` system prompt.

**Report builder**
- CC field on Send Report by Email (max 5, validated on frontend and backend, To address removed from CC).
- Risk and Incident Correlation block: backend compute (`report.py`), AI facts (`report_facts.py`), AI evidence and guard rules (`ai_report.py`), PDF renderer (`pdf_report.py`), frontend preview (`ReportPreview.tsx`), block selector entry.
- PowerPoint export alongside PDF (`pptx_report.py`, python-pptx 1.0.2). Export route returns `file_base64`, `file_name`, `mime_type`. New PowerPoint button on Report Builder.
- PDF cover template fix: page 1 template chosen by `has_cover`.
- Registry parity test (`tests/test_export_registries.py`): every PDF renderer has a PPTX renderer.

**Unified-only product**
- Migration 059: `tenants.modules` set to `{risk,incident}` for all rows and as the column default. `DEFAULT_MODULES` and the model default updated. Wizard store entry updated.
- Founder Panel can no longer change modules: the `AdminWorkspaceUpdate` validator accepts only both, and the drawer shows modules read-only.

**API docs fix**
- `routes/external.py`: removed `from __future__ import annotations`, which broke `/api/docs` with a ForwardRef UUID error under slowapi.

**Settings security**
- Save settings, set PIN and upload logo now require `manage_settings` (Owner).
- Logo upload: PNG, JPEG or WebP detected from file bytes, 2 MB cap, per-workspace random path. `logo_url` must point into the `workspace-logos` bucket. Old logo deleted only after save. Removing a logo now saves.
- Settings GET: members without `manage_settings` get blank alert and brief recipients and AI policy text. Permission fields are hidden unless the member also has `manage_users`.
- Color and theme values validated on the backend.

**User management security**
- Nobody can change access for, deactivate or remove their own account.
- Only Admins (Owner role) can act on another Admin, grant the Admin role, or grant Manage Settings or Manage Users.
- The last Admin cannot be demoted. Unknown permission keys are rejected. Roles are validated.
- Users page now uses backend effective permissions and a new `GET /api/v1/users/role-permissions` endpoint instead of a hardcoded table that was wrong for Analysts.

**Google sign-in and password reset**
- Google sign-in refused when `GOOGLE_CLIENT_ID` is missing (previously the app check was skipped).
- Forgot password now emails passwordless accounts a "Set your SmartRisk Pulse password" email.
- Login and register messages point Google users to the right action. `last_login` recorded on Google sign-in. Name fallback via the Google profile endpoint.
- Reset links work once (the token carries `token_version`).

**Workspace colors and theme**
- Color helpers in `utils/brand.ts`: hex validation, contrast check, default constants, `--accent-rgb`, and cached colors to stop the flash of default colors on load (cleared on logout).
- Settings: invalid colors blocked on save, readability warnings, Restore default colors button, Reset renamed Discard changes.
- `apply_brand_vars.py` (102 replacements): hardcoded teal and navy in in-app rules now use variables. New `--primary-strong` and `--accent-strong` via `color-mix`.
- `apply_dark_text.py`: `--accent-text` makes accent-colored text light in dark mode.
- Risk register, incidents and Users page inline colors moved to classes.
- Theme: the header switch is each person's choice, the workspace Mode is only the default, and "auto" is resolved in code to light or dark.

**Docs**
- Google sign-in check guide created as a doc for the team.

**Files changed this session (49, plus 1 migration):**

Backend: `alembic/versions/059_unified_modules.py` (new, name as created), `app/services/ai_unified.py`, `app/schemas/report.py`, `app/api/v1/routes/reports.py`, `app/services/email.py`, `app/models/tenant.py`, `app/core/config.py`, `app/services/report.py`, `app/api/v1/routes/external.py`, `app/services/report_facts.py`, `app/services/ai_report.py`, `app/services/pdf_report.py`, `app/services/pptx_report.py` (new), `requirements.txt`, `tests/test_export_registries.py` (new), `app/schemas/admin.py`, `app/api/v1/routes/settings.py`, `app/services/settings.py`, `app/schemas/settings.py`, `app/services/auth.py`, `app/core/security.py`, `app/schemas/user.py`, `app/services/user.py`, `app/api/v1/routes/users.py`

Frontend: `src/utils/validation.ts`, `src/pages/ReportBuilder.tsx`, `src/hooks/useReports.ts`, `src/services/reports.ts`, `src/types/report.ts`, `src/components/reports/BlockSelector.tsx`, `src/components/reports/ReportPreview.tsx`, `src/pages/CreateWorkspace.tsx`, `src/pages/Login.tsx` and `src/pages/Register.tsx` (redesign dropped in), `src/utils/brand.ts`, `src/components/settings/WorkspaceSettings.tsx`, `src/store/uiStore.ts`, `src/hooks/useSettings.ts`, `src/hooks/useAuth.ts`, `src/App.tsx`, `src/components/risks/RiskTable.tsx`, `src/components/risks/StatCards.tsx`, `src/pages/Incidents.tsx`, `src/hooks/useUsers.ts`, `src/pages/Users.tsx`, `src/index.css`

Admin: `admin/src/pages/Workspaces.tsx`

Data: one-off `UPDATE tenants SET modules = ARRAY['risk','incident']` (Supabase SQL editor, mirrored in migration 059)

Docs: `SMARTRISK_V2_DECISIONS.md` (17 entries appended), `SMARTRISK_V2_SETUP.md` (section 35 appended)

**Status:** Complete in code. The checks below are carried over.

**Carried over (do these first next session, after the Session 26 list):**
1. Confirm `alembic heads` shows `059` after applying it, and that production, staging and local all have 057, 058 and 059.
2. Confirm `apply_dark_text.py` was run, and check dark mode on the incident drawer, Settings, modals and dashboard.
3. Test the theme fix: header choice survives reload and settings saves; Auto follows the OS.
4. Test Restore default colors, Discard changes, and no color flash on reload or after logout.
5. Test settings trimming as an Analyst (recipients and AI policy blank) and as an Owner.
6. Test Users page guards (self-promotion, Admin grants, last Admin) and that Analyst defaults show Manage Incidents and Review and Resolve ticked.
7. Check the incidents trend chart renders with `fill="var(--primary)"`.
8. If `tests/test_auth.py` calls `create_reset_token` with two arguments, add the version argument. Add `GOOGLE_CLIENT_ID` to the CI test environment if any test calls `google_auth`.
9. Re-upload to the project: every file listed above, plus `SMARTRISK_V2_BUILD.md` and `SMARTRISK_V2_SETUP.md`. The project's `reports/ReportPreview.tsx` is an old `ReportBuilder.tsx`; replace it with the real file.

**Open decisions:**
- Report colors: should the PDF and PowerPoint stay SmartRisk branded or follow the workspace colors?
- Recording how each account was created (`auth_provider` column, migration needed). The user is handling this on the backend side.
- Session 26 item 7 (the two remaining gradients) overlaps with the color work: decide alongside report colors.

**Next session starts with:**
1. Read SMARTRISK_V2_SETUP.md, SMARTRISK_V2_DECISIONS.md, then this file.
2. Migrations 057, 058 and 059 on every database.
3. Session 26 carried-over items 2 to 10.
4. Session 27 carried-over items above.
5. Inline navy text on pages not read this session (dashboard sections) moved to classes, so dark mode applies.
6. Optional cleanup: remove the now-unused `[data-theme="auto"]` rules from `index.css`.

---

### Session 26: October 2 to 8, 2026, Control Effectiveness Scale, Trend Axis, Triage Fix

**Completed:**

**Control effectiveness, Phase A (data and settings)**
- Migration 057: `ce_scale` (4 or 5, default 5, CHECK) and `ce_labels` (JSONB, seeded with the existing labels) on `workspace_matrix_config`, and `source` on `risk_history` (`user`, `scale_switch`, `import`, `restore`, CHECK).
- `ce_fraction()` in `risk_status.py` is the single definition. `_score` uses the workspace scale.
- `CeConfigUpdate` validates labels: trimmed, 40 characters, unique on the effective label, no label equal to another level's number.
- `GET /api/v1/matrix-config/control-effectiveness/preview` and `PUT /api/v1/matrix-config/control-effectiveness`.
- Scale switch: config row `FOR UPDATE`, blocked while any risk is above the target scale (the dialog and error name up to 20 blocking risks), confirm required, set-based residual recalculation, one `risk_history` row per affected risk with `source = scale_switch`, one audit entry (module `Settings`) and one feed event (`ce_scale_change`).
- Risk create, update, import and restore read the config `FOR SHARE`. `update_risk` reads the config before applying field changes, which avoids a deadlock with a switch.
- `CE_SCALE_SWITCH_ENABLED` backend lock, exposed to the UI as `ce_scale_switch_enabled`.
- Control Effectiveness settings tab with the scale chips, level labels and a confirm dialog.
- Recycle restore rescores against the current matrix and scale, and restores every field. `_serialize` now keeps `linked_decision_at` and `source_submission_id`.

**Control effectiveness, Phase B (backend readers)**
- `HIGH_CONTROL_RATING` removed. Added `ce_avg_pct`, `is_high_control` and `ce_label`. `is_contradicted` takes the scale.
- Every `/5`, `*20` and `>= 4` replaced in the dashboard KPIs and evidence, the register stats, the executive dashboard, `report_facts` (the percentage map was removed and `_pulse_residual` takes the scale) and the AI insight prompt (it previously said "4%" for level 4).
- Migration 058: `snapshots_monthly.control_strength_pct`. The monthly delta reads it, falling back to the raw value on scale 5 for older rows.
- Daily snapshot entries now store `severity`, `ce_scale` and `ce_fraction`. `get_daily_deltas` rebases the baseline residual across a scale switch and adds `scaleChanged`.
- Report methodology and the PDF Engine line state the scale.

**Control effectiveness, Phase C (frontend)**
- The backend builds `ce_options`. RiskForm, RiskDetailModal and the UnifiedSection `/ 5` text and note use it.
- Import sends the raw cell text, and `resolve_ce_input` resolves a number or a label in the backend. This fixed labels being silently imported as Not assessed.
- Feed wording added for `ce_scale_change`, and `Settings` added to the audit module filter.
- The dead frontend `computeScore` was removed.
- `SMARTRISK_V2_SETUP.md` Risk Scoring Engine section updated.

**Other fixes**
- Unified trend card uses a calendar axis covering the last 6 months. Incident bars come from live incidents, and residual dots come from snapshots plus a live current month. Diagnosed on staging, which has no monthly snapshots because its jobs only run while the instance is awake.
- Triage reroute and close called the undefined `_get_sub_or_404`, causing a NameError. Both now use `_get_pending_sub`. The reroute toast shows the backend message.
- `.modal-hd` gradient replaced with a solid tint.
- A navy "Incident Configuration" divider was added before Incident Category in LookupEditor.
- Connectors: a plain-language partner explainer PDF was produced. No build decision has been made.

**Status:** Complete in code. The switch lock stays `False` until the staging tests pass.

**Carried over (do these first next session):**
1. Confirm migrations 057 and 058 are applied on production Supabase, staging Supabase and local (`alembic upgrade head`, with `alembic heads` showing `058`). One environment errored before the SQL was run.
2. Run the Phase C tests:
   - The form dropdown shows the labels.
   - The detail modal shows the label.
   - Import accepts "Weak", "4" and "Not assessed", and rejects "Bogus".
   - On staging only, set `CE_SCALE_SWITCH_ENABLED = True`, switch to 4, and check the counts, residuals, feed, audit and form.
   - Confirm a level-5 risk blocks the switch.
   Then decide whether to enable the switch in production.
3. Retest triage reroute and close, plus a double action returning 409. Verify the hardcoded `severity='Medium'` exists in each workspace's incident severity list.
4. Check whether Ruff `F821` is enabled and whether CI runs Ruff on `app/`.
5. Scheduler conflict: SETUP section 15 says Postgres job store, while staging behaves like an in-memory store on a sleeping instance. Read `app_main.py` and decide on a durable runner. This is needed before any scheduled connector.
6. Open decision: rebuild past residual points from `risk_history` (complete on the staging workspace checked), and whether to use logged dates as marked estimates. Check whether `_next_id` can reuse a deleted ID first.
7. Open decision: two remaining gradients in `index.css` (around lines 1984 and 4463).
8. Confirm `facts.py`, `narrative.py` and `build_report.py` (the standalone sample report tool, still on "of 5") are out of scope.
9. Connectors: await the partner discussion. The first build would be saved import mappings and a manual KRI model.
10. Re-upload every file listed below to the project, since the project copies are now stale.

**Files changed this session (36, plus 2 migrations):**

Backend: `alembic/versions/057_add_ce_scale_and_history_source.py` (new), `alembic/versions/058_add_control_strength_pct_to_snapshots_monthly.py` (new), `app/models/matrix_config.py`, `app/models/risk_history.py`, `app/models/snapshot.py`, `app/schemas/matrix_config.py`, `app/schemas/risk.py`, `app/services/matrix_config.py`, `app/services/risk_status.py`, `app/services/risk.py`, `app/services/recycle.py`, `app/services/snapshot.py`, `app/services/dashboard.py`, `app/services/report.py`, `app/services/report_facts.py`, `app/services/pdf_report.py`, `app/services/ai_risk.py`, `app/services/submission.py`, `app/api/v1/routes/matrix.py`

Frontend: `src/components/settings/ControlEffectivenessSettings.tsx` (new), `src/pages/Settings.tsx`, `src/pages/AuditLog.tsx`, `src/pages/TriageQueue.tsx`, `src/types/matrix.ts`, `src/types/report.ts`, `src/types/risk.ts`, `src/services/matrix.ts`, `src/hooks/useMatrix.ts`, `src/utils/scoring.ts`, `src/utils/feedEvents.ts`, `src/components/risks/RiskForm.tsx`, `src/components/risks/RiskDetailModal.tsx`, `src/components/risks/ImportModal.tsx`, `src/components/dashboard/UnifiedSection.tsx`, `src/components/settings/LookupEditor.tsx`, `src/index.css`

Docs: `SMARTRISK_V2_SETUP.md` (Risk Scoring Engine section), `SMARTRISK_V2_DECISIONS.md` (8 entries appended)

---

### Session 25: October 1, 2026, Dashboard Alignment, Triage Integrity, Export Rebuild, Filter Parity

**Completed:**

**Unified dashboard**
- Card titles darkened and bolded via `.im-label`. This also applies to the Risk and Incident dashboards and IncidentStatCards.
- Residual risk on Enterprise Risk Health rounded to a whole number.
- Category Overlap capped at one finding.
- Donuts enlarged (fluid width, 210px high), starting at 12 o'clock.
- Exposure and Incident Trend on a single Y axis, with the legend below the chart and the height raised to 230px via `.dash-chart-wrap.im-trend-chart`.
- Operational Feed "All" tab: already capped at 3 rows, so no change was needed.
- Health status explained: 73 is "Monitoring" by band (Healthy starts at 76), then capped to "At Risk" because one risk exceeds its category appetite. No change made.

**Tables**
- Audited every table class. Fixed zero edge padding on `.u-modal-table`, `.apt-guide-table`, `.sev-map-table`, `.sev-preview-table` and `.inc-driver-table` with a `table.<class>` block at the end of `index.css`.
- `.sev-preview-table` got tighter padding and a `.sev-preview-scroll` wrapper to stop it overflowing its card.

**Triage queue**
- Root cause of the "cleared" submission: Accept wrote `accepted` before the form opened. Cancel then stranded the record, out of the queue and with no actions available.
- Accept now only opens the promote form. Promote goes from `pending` to `accepted` in one transaction. The accept route, service, TS function and hook were removed.
- `_get_pending_sub` (row lock plus a 409 when not pending) now guards merge, reroute, close and promote.
- Stranded rows reset to `pending` via one-off SQL in Supabase. This was a data fix, so there is no migration.
- Browser drafts: autosave, Cancel keeps the draft, Discard clears it, Draft pill in the inbox, and stale drafts pruned. This also fixed promote fields leaking between submissions.
- Promote category is now a combo box (list plus free text) with a new-category hint. `ensure_category` returns the canonical spelling and keeps the default categories (this fixed a bug that wiped them).

**Risk register export**
- PDF option removed, so the export is CSV only.
- Column picker covering every field, remembered per workspace.
- Every cell escaped, plus a formula-injection guard, a UTF-8 BOM and CRLF line endings.
- Pages past 1,000 rows. "Current filters" reuses `riskParams`, and the Selected scope now works.
- Headers aligned to the import auto-map ("Date Logged", "Mitigation Status").

**Stat cards**
- `_apply_risk_filters` is shared by `list_risks` and `get_stats`, so all 8 filters now apply to both the table and the cards.
- The hardcoded `0.75` was replaced by `APPETITE_NEAR_RATIO`.

**Files changed this session (17, plus one data fix):**

Backend: `app/services/submission.py`, `app/api/v1/routes/submissions.py`, `app/services/lookup.py`, `app/services/risk.py`, `app/api/v1/routes/risks.py`

Frontend: `src/components/dashboard/UnifiedSection.tsx`, `src/index.css`, `src/components/settings/IncidentSeveritySettings.tsx`, `src/pages/TriageQueue.tsx`, `src/utils/triageDraft.ts` (new), `src/services/submissions.ts`, `src/hooks/useSubmissions.ts`, `src/components/risks/PrintModal.tsx`, `src/pages/RiskRegister.tsx`, `src/utils/riskExport.ts` (new), `src/services/risks.ts`

Docs: `SMARTRISK_V2_DECISIONS.md` (9 entries appended)

Data: one-off `UPDATE risk_submissions` resetting stranded accepted rows to pending (Supabase SQL editor, no migration)

**Status:** Complete in code. The browser checks below are carried over.

**Carried over (do these first next session):**
1. Confirm dashboard snippets 1, 2 and 4 are applied. The last screenshot still showed light titles and residual `3.5`.
2. Run the triage test checklist: draft survives navigation, Discard works, Promote clears the draft, and a double merge returns 409.
3. Run the export checks: all three scopes, a register over 1,000 rows if available, Excel opens ₦ correctly, and re-import of an exported file. Verify the importer parses ISO dates (`2026-09-17`). This is still unverified.
4. Filter the register by "Exceeds appetite" and confirm the Risk Volume card total equals the table row count.
5. Open decision: should the Healthy band start lower than 76, and should one appetite breach cap the status at At Risk or lower it by a single band?
6. Re-upload the stale project files: `SMARTRISK_V2_BUILD.md`, `src/services/risks.ts`, and the migrations after `028`.

**Next session starts with: Control Effectiveness Phase A**
1. Read SMARTRISK_V2_SETUP.md, SMARTRISK_V2_DECISIONS.md (the October 1 CE entry), then this file.
2. Alembic head is `056`, so the migration will be `057`. Re-run `alembic heads` to confirm before numbering.
3. Phase A scope: the migration (`ce_scale` and `ce_labels` on the matrix config table), the model, schema and service, `ce_fraction()`, `_score`, the scale-switch recalculation with the block and confirm rules, the Settings tab, and an update to the stale SETUP section (lines 983 to 987).
4. Edge cases to design for:
   - **Recycle bin:** Restoring a risk rated 5 into a 4-scale workspace must be validated.
   - **Concurrency:** Risk edits made during a scale switch. The switch runs in one transaction.
   - **Null versus 0:** Keep them distinct everywhere.
   - **Labels:** Blank labels fall back to the level number. Labels are trimmed, unique and length-capped, and keyed by level so a scale change adds or drops keys cleanly.
   - **Imports:** Unique labels prevent an imported label matching two levels.
   - **Frontend preview:** `utils/scoring.ts` must read the scale from config.
   - **Downstream text:** AI prompts and report methodology text that state the scale.
   - **Snapshots:** Trend comparisons across a scale switch.
   - **Appetite:** Appetite statuses shift when residuals are recalculated.
   - **Logging:** Decide whether the bulk recalculation writes risk_history and activity feed rows.
   - **Audit:** The scale change gets an audit log entry.
   - **Caches:** Invalidate the dashboard, risks and stats queries after a switch.
5. Phase B (backend `/5`, `*20` and `>= 4` replacements) and Phase C (frontend form, table, detail, import) follow. The scale selector stays locked at 5 until Phase B ships.

---

### Session 24: September 21, 2026 — PDF Report, AI Sector Guard, Preview Modal, Risk Table, Auth Parity

**Completed:**

**VerifyPin**
- Help text changed from "Contact your workspace Owner to remove it" to "Contact your workspace Admin for access"

**PDF Report**
- Top risks table restructured: columns now Risk ID, Risk Owner, Description, Level, Controls, Mitigations, Residual; Trend column dropped; font reduced to 7pt for data rows, 8pt header; Controls and Mitigations sourced from new fields added to RiskRow and compute_top_risks
- `mitigation_plan` added to RiskRow dataclass, `_fetch_risks`, `compute_top_risks`, and `compute_top_emerging_risks`
- `controls` added to `compute_top_risks` and `compute_top_emerging_risks` dicts
- `_level_badge_cell` now accepts `col_width` parameter (default 22mm); top risks table passes 18mm; font auto-reduces to 7pt when column under 20mm; prevents overflow
- Org name displayed beside logo on cover page using a 2-column inner Table; previously logo showed alone with no name label
- Header right side now reads from `title` variable instead of hardcoded "Risk Management Report"
- Report period added under title in header (7pt, right-aligned); period computation moved before `_make_doc` call so it can be passed as parameter; `_make_doc` receives new `period: str = ""` parameter
- STATUS, TREND, CONFIDENCE posture block removed from executive dashboard PDF block
- Recommendations: action title colour changed from TEAL to NAVY; numbered list bullet colour changed from TEAL to NAVY; "Done when" completion criterion colour changed from GREEN to NAVY; hardcoded `Helvetica-Bold` in numbered list changed to `f_bold()`

**AI Report**
- Sector injection guard added to `_guard_rules`: explicitly demotes industry/sector persona context to tone only; prevents AI from attributing sector-specific mechanisms to generic risk descriptions
- `{ind}` removed from system prompt persona in `top-risks`, `top-emerging-risks`, and `major-incidents` blocks only; `ai-exec-summary` and `executive-commentary` retain it (they reason about org holistically)
- Evidence anchor added to user prompts for all three data-specific blocks: "Base every claim only on each risk's/incident's own description field below"

**Methodology Block**
- `residual_model_matches_engine`, `supplied_model_is_subtractive`, and `pulse_residuals` in `services_report_facts.py` all lacked None guard on `control_effectiveness`; any workspace with an unassessed risk caused a TypeError that silently swallowed the block, leaving it blank in preview

**Report Preview**
- `NarrativeReviewModal` added as module-scope component; replaces inline textarea with a full-height modal showing AI text with a disclaimer banner and Save/Cancel buttons
- Disclaimer links to `/settings?tab=ai` in a new tab
- `AIExecSummary`, `ExecutiveCommentary`, and `ConclusionBlock` converted to use `NarrativeTA` (and therefore the modal)
- AI-not-run prompt added: before PDF download and before showing the email modal, checks if any AI-capable block is active and `aiData` is empty; shows confirmation if so
- `AI_BLOCKS` constant added to `src/types/report.ts`; imported in `ReportBuilder`
- STATUS, TREND, CONFIDENCE posture grid removed from `ExecutiveDashboardBlock` in preview; `postureColor` unused variable removed
- Highlights (executive dashboard) always editable regardless of whether AI has run; pre-fills with deterministic bullets when AI not run

**Risk Table**
- Risk ID: bold (`fontWeight: 700`), navy (#1F2854), no longer green
- Date logged, description, owner, business impact, financial exposure: muted colour (`var(--muted)`), no bold
- Severity and residual columns: bold retained (numeric values)
- Level badge and freshness pill: unchanged (class-controlled)

**Auth Pages**
- Login: `auth-left-note` ("2 weeks full access, no card required") removed; returning users do not need trial messaging
- Register: left panel replaced with identical steps structure from Login page; `STEPS` constant added; `auth-left-note` retained on register (appropriate for new signups); lucide imports `Clock`, `BarChart2`, `Activity` removed

**CSS**
- Added: `.rb-review-trigger`, `.rb-narrative-preview`, `.rb-review-btn`, `.rb-review-btn:hover`, `.rb-ai-disclaimer`, `.rb-disclaimer-link`, `.rb-disclaimer-link:hover`

**Status:** Complete. No incomplete items.

**Files changed this session (12):**

Backend: `app/services/pdf_report.py`, `app/services/report.py`, `app/services/ai_report.py`, `app/services/report_facts.py`

Frontend: `src/pages/VerifyPin.tsx`, `src/pages/Login.tsx`, `src/pages/Register.tsx`, `src/pages/ReportBuilder.tsx`, `src/components/reports/ReportPreview.tsx`, `src/components/risks/RiskTable.tsx`, `src/types/report.ts`, `src/index.css`

**Next session starts with:**

1. Read `SMARTRISK_V2_SETUP.md`, `SMARTRISK_V2_DECISIONS.md`, then this file.
2. Visual QA: generate a PDF with all blocks selected, inspect top risks table, header period, logo+name, recommendation colours, done-when colour.
3. Confirm methodology block loads in preview on a workspace with at least one risk where control effectiveness is not set.

---

### Session 23: September 17, 2026 — Risk Register, Report, AI, Dashboard, Auth Polish

**Completed:**

**Risk Register**
- Sort: added Risk.id ASC tiebreaker — eliminates row jumping on refetch
- Edit risk: clear filters on successful edit so updated risk stays visible; removed erroneous setPage(1) after user correction
- Appetite filter: server-side filter added to list endpoint via LEFT JOIN on appetite_thresholds; dropdown added next to risk level filter
- Replace Internal/External source badge with amber "Set Controls" badge when control_effectiveness is None or 0; clicking opens edit modal
- Freshness tooltip: rebuilt FreshTip component using existing CSS, position: fixed, colour-coded per state; added HoverTip variant for appetite and decision columns; all data-tip tooltips replaced; tooltip box sizing made responsive (auto width, max-width 175px, 10px fonts)
- Avg Residual stat card: whole number display, shows value/matrix_max using residual_max threaded through ControlSignal schema and type
- Top Owner stat card: value rounded to whole number

**Control Effectiveness**
- Distinguish None (not assessed) from 0 (assessed, zero effectiveness) throughout frontend and backend
- Dropdown labels renamed: None, 0-No effective control, 1-Weak, 2-Limited, 3-Moderate, 4-Strong, 5-Very strong
- RiskRow preserves None instead of collapsing to 0
- Fixed all None comparison crash sites in services_report.py, services_report_facts.py
- Avg control strength now includes 0, excludes None

**Report PDF**
- Cover page: title font reduced (26→20pt), proper vertical spacing between elements using Spacer rows
- Avg Residual shown as value/matrix_max in Risk Snapshot and Executive Dashboard KPI strips
- Top risks: band-count-aware filtering (5/4-band top 2, 3-band top 1); description truncation removed
- Rename "What Leadership Needs To Know" to "Highlights"
- Remove key risk movements block from frontend, types, PDF renderer, and compute registry
- Exposure index denominator now uses likelihood_scale × impact_scale; fixes 80% ceiling on non-5x5 matrices
- Set Controls amber badge added under risk ID in top risks PDF table
- Organisation name used instead of workspace name throughout report and AI
- Executive dashboard not rendering fixed (None comparison crash in compute_executive_dashboard)

**AI Report**
- Four-level posture classification added to report_facts: controlled, watch, elevated, breach
- posture key exported in build_fact_slice governance dict
- _guard_rules upgraded with posture-aware tone instructions per level
- Executive dashboard prompt calibrated to POSTURE guard; section retitled to Highlights

**Dashboard**
- Risk pressure card: Total Incidents replaced with Est Financial Exposure; respects currency setting via formatMoneyCompact
- Control Strength shows 0% with prominent 0 instead of dash
- Risk Health gauge shows % suffix at all values
- Avg residual score rounded to whole number in card and pressure modal
- KPISummary: est_financial_exposure field added to schema, service, and frontend type

**Auth / Login**
- Login page redesigned: numbered steps left panel, segmented tabs, mobile layout
- All auth submit buttons background changed to teal (#01b88e) with #00967a hover
- PIN page Unlock button text centred, button background teal
- External submissions: org name and logo pulled from workspace settings and displayed in page headers
- Logo removal bug fixed: undefined → null sent to backend; sidebar onError clears broken logo
- New public endpoint /external/brand/{tenant_id} for ExternalRisk and ExternalIncident branding

**External Submissions**
- TokenResolveResponse extended with org_name and logo_url
- ExternalSubmit Brandbar shows logo and org name
- ExternalRisk and ExternalIncident fetch brand on mount

**Misc**
- ReportPreview.tsx build error fixed (KeyRiskMovementsData removal)
- Risk table sort stable (created_at DESC, id ASC)
- services_report_facts.py _derive_posture method added
- Residual max helper _residual_max used consistently across all report and stats computations

**Status:** Complete

**Files touched this session:**

Backend new/modified:
- `app/services/risk.py` — sort tiebreaker, exposure fix, residual_max in ControlSignal, est_financial_exposure
- `app/services/report.py` — all report block compute changes, top risks, exec dashboard unit, org name
- `app/services/report_facts.py` — _derive_posture, posture in fact slice, None comparison fixes
- `app/services/pdf_report.py` — cover page, Set Controls badge, description truncation, avg residual unit, exec dashboard
- `app/services/ai_report.py` — posture guard, executive prompt calibration
- `app/services/dashboard.py` — est_financial_exposure computation
- `app/services/settings.py` — org name preference over workspace name
- `app/services/submission.py` — org_name and logo_url in token resolve
- `app/schemas/risk.py` — ControlSignal residual_max
- `app/schemas/dashboard.py` — KPISummary est_financial_exposure
- `app/schemas/submission.py` — TokenResolveResponse org_name, logo_url
- `app/models/risk.py` — no change (read only)
- `app/routes/risks.py` — appetite filter param
- `app/routes/reports.py` — org name pass-through
- `app/routes/external.py` — /external/brand/{tenant_id} endpoint
- `app/routes/submissions.py` — no change (read only)

Frontend new/modified:
- `src/pages/Login.tsx` — full redesign
- `src/pages/VerifyPin.tsx` — button centred, teal background
- `src/pages/ExternalSubmit.tsx` — brandbar org_name, logo_url
- `src/pages/ExternalRisk.tsx` — brand fetch and display
- `src/pages/ExternalIncident.tsx` — brand fetch and display
- `src/components/risks/RiskTable.tsx` — Set Controls badge, FreshTip, HoverTip, sort, filter clear on edit, appetite filter render
- `src/components/risks/RiskForm.tsx` — CTRL_EFF labels, None/null type, dropdown values
- `src/components/risks/StatCards.tsx` — residual_max display, whole number top owner
- `src/components/risks/EditRiskModal.tsx` — null init for control_effectiveness
- `src/components/dashboard/RiskSection.tsx` — Est Financial Exposure, control strength 0%, health %, currency
- `src/components/reports/ReportPreview.tsx` — KeyRiskMovementsData removal
- `src/components/reports/BlockSelector.tsx` — key-risk-movements removed
- `src/components/layout/Sidebar.tsx` — onError logo clear
- `src/components/settings/WorkspaceSettings.tsx` — logo removal null fix
- `src/store/settingsStore.ts` — no change (read only)
- `src/types/risk.ts` — control_effectiveness null, residual_max in ControlSignal, RiskCreate fix
- `src/types/report.ts` — KeyRiskMovementsData removed, BlockKey updated
- `src/types/dashboard.ts` — est_financial_exposure in KPISummary
- `src/utils/scoring.ts` — no change (read only)
- `src/index.css` — fresh-tip sizing, auth button teal, auth steps, auth seg, login redesign classes
 
---

### Session 21: September 8, 2026 — Admin Panel (Backend + Frontend)

**Completed:**

**Migrations (Supabase SQL run on both staging and prod databases):**
- Migration 046: `admin_accounts` table with self-referencing `created_by`, role, status, last_login
- Migration 047: `admin_audit_log` table with nullable `admin_id` (ON DELETE SET NULL), JSONB meta, two indexes
- Migration 048: `api_error_log` table with nullable `tenant_id`, JSONB request_body, three indexes
- Migration 049: `status TEXT NOT NULL DEFAULT 'ACTIVE'` column added to `tenants` table

**Backend new files:**
- `app/models/admin_account.py`: AdminAccount ORM model, self-referencing FK
- `app/models/admin_audit_log.py`: AdminAuditLog ORM model, JSONB meta
- `app/models/api_error_log.py`: ApiErrorLog ORM model, JSONB request_body
- `app/core/admin_security.py`: create_admin_token and decode_admin_token using ADMIN_JWT_SECRET, type claim enforced on decode
- `app/core/admin_deps.py`: get_current_admin and require_super_admin dependencies, get_db imported from app.core.dependencies
- `app/middleware/error_log.py`: ErrorLogMiddleware captures 4xx/5xx, fire-and-forget via asyncio.create_task, scrubs sensitive fields before storing body
- `app/schemas/admin.py`: full schema layer covering auth, admin accounts, workspaces, overview stats, user intelligence, error log, audit log
- `app/services/admin_auth.py`: login, write_audit_log shared helper
- `app/services/admin_panel.py`: get_overview_stats (2 queries, not 8), list_workspaces (one join query), update_workspace, list_platform_users, list_admin_accounts, create_admin_account, update_admin_account, list_errors, get_error_summary, list_admin_audit_log
- `app/api/v1/routes/admin_auth.py`: POST /api/admin/auth/login, GET /api/admin/auth/me
- `app/api/v1/routes/admin_overview.py`: GET /api/admin/overview/stats
- `app/api/v1/routes/admin_workspaces.py`: GET /api/admin/workspaces, PATCH /api/admin/workspaces/{tenant_id}
- `app/api/v1/routes/admin_accounts.py`: GET /api/admin/platform-users, GET/POST /api/admin/admin-accounts, PATCH /api/admin/admin-accounts/{id}
- `app/api/v1/routes/admin_errors.py`: GET /api/admin/errors, GET /api/admin/errors/summary, GET /api/admin/audit-log
- `seed_admin.py`: interactive multi-account seed script, queues all entries before DB write, duplicate check per email, minimum 12-char password

**Backend modified files:**
- `app/models/__init__.py`: AdminAccount, AdminAuditLog, ApiErrorLog registered
- `app/core/config.py`: ADMIN_JWT_SECRET (required), ADMIN_FRONTEND_URL, ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES (60) added, allowed_origins extended to include admin frontend
- `app/main.py`: ErrorLogMiddleware imported and registered before TenantMiddleware (innermost), five admin routers imported from app.api.v1.routes and mounted under /api prefix

**Admin frontend (new app at /admin/):**
- Scaffolded via `npm create vite . -- --template react-ts`, ESLint selected
- Additional packages: react-router-dom, @tanstack/react-query, zustand, axios, recharts
- `admin/src/index.css`: full admin CSS with light theme tokens (--bg #f6f8fa, --card #ffffff, --sidebar #1F2854 fixed), sidebar text pinned to rgba-white fixed values independent of theme tokens, drawer, search bar, select, detail row, toggle, auth split layout classes
- `admin/src/types/admin.ts`: all TypeScript types for admin panel
- `admin/src/services/api.ts`: adminApi axios instance, Bearer token interceptor, 401 auto-clear, unwrap helper, adminAuthApi, overviewApi, workspacesApi, usersApi, errorsApi, adminAccountsApi, auditApi
- `admin/src/store/adminAuthStore.ts`: Zustand store with persist middleware
- `admin/src/components/layout/Sidebar.tsx`: nav sections (Platform, Observability, Admin), active state via NavLink, sign out button
- `admin/src/components/layout/Shell.tsx`: token guard redirects to /login, Outlet renders pages
- `admin/src/pages/Login.tsx`: split panel layout matching Pulse auth pattern, navy left panel with brand and feature points, light right panel with form, show/hide password toggle
- `admin/src/pages/Overview.tsx`: platform stat cards, conversion and activation rate cards, hourly error bar chart (recharts), top error paths table, 60s auto-refresh
- `admin/src/pages/Workspaces.tsx`: searchable filterable table, status badges, edit drawer with all editable fields, derived status logic, mutation invalidates overview query
- `admin/src/pages/PlatformUsers.tsx`: platform accounts table, relative time display, ghost filter, ghost count in subtitle
- `admin/src/pages/ApiErrors.tsx`: error summary stats, hourly chart, filterable log table, detail drawer showing scrubbed request body, 30s auto-refresh
- `admin/src/pages/AdminAccounts.tsx`: admin account table, create/edit drawer, self-edit guards (cannot change own role or deactivate own account), "you" pill on current admin row
- `admin/src/pages/AuditLog.tsx`: audit entries newest first, before/after diff in detail drawer with strikethrough old and highlighted new values, action badge with readable English labels

**Status:** Complete

---

