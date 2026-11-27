// Join by email domain (batch 5).
export type JoinRequestStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'DECLINED';

export interface JoinableWorkspace {
  tenant_id: string;
  name: string;
  request_status: JoinRequestStatus;
}

export interface JoinDomainSetting {
  enabled: boolean;
  domain: string | null;
  your_domain: string;
  allowed: boolean;
}

export interface JoinRequestItem {
  id: string;
  email: string;
  name: string | null;
  requested_at: string;
}
