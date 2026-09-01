import type { UserRole } from '../types/api';

// Owner is the stored value in workspace_members.role and is compared directly
// in backend permission logic. Only the label shown to users changes.
const ROLE_LABELS: Record<string, string> = {
  Owner: 'Admin',
};

export function roleLabel(role: UserRole | string | null | undefined): string {
  if (!role) return '';
  return ROLE_LABELS[role] ?? role;
}