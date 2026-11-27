import { apiGet, apiPost, apiPut } from './api';
import type { JoinableWorkspace, JoinDomainSetting, JoinRequestItem } from '../types/join';

export const JOINABLE_KEY = ['join', 'workspaces'] as const;
export const JOIN_DOMAIN_KEY = ['join', 'domain'] as const;
export const JOIN_REQUESTS_KEY = ['join', 'requests'] as const;

export const getJoinable = () => apiGet<JoinableWorkspace[]>('/api/v1/join/workspaces');
export const askToJoin = (tenantId: string) => apiPost<JoinableWorkspace>(`/api/v1/join/workspaces/${tenantId}`);

export const getJoinDomain = () => apiGet<JoinDomainSetting>('/api/v1/join/domain');
export const setJoinDomain = (enabled: boolean) => apiPut<JoinDomainSetting>('/api/v1/join/domain', { enabled });
export const getJoinRequests = () => apiGet<JoinRequestItem[]>('/api/v1/join/requests');
export const approveJoin = (id: string, role: 'Manager' | 'Analyst') =>
  apiPost<{ approved: boolean }>(`/api/v1/join/requests/${id}/approve`, { role });
export const declineJoin = (id: string) => apiPost<{ declined: boolean }>(`/api/v1/join/requests/${id}/decline`);
