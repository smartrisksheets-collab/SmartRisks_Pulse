DELETE FROM notification_prefs
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM activity_feed
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM external_submissions
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM incidents
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM workspace_matrix_config
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM recycle_bin
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM report_settings
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM report_templates
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM risk_history
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM snapshots_monthly
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM snapshots_daily
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM risks
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM audit_logs
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM lookups
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM workspace_members
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54'
);

DELETE FROM workspace_members
WHERE account_id = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54';

DELETE FROM tenants
WHERE created_by = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54';

DELETE FROM accounts
WHERE id = '63a0cbff-e304-4aa4-9b6a-cc37a24dfb54';