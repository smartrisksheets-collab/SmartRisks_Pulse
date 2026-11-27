import { useQuery } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch } from './api';
import { useAuthStore } from '../store/authStore';
import type { Profile } from '../types/profile';

export const PROFILE_KEY = ['me'] as const;

export const getProfile = () => apiGet<Profile>('/api/v1/me');
export const updateProfile = (first_name: string, last_name: string) =>
  apiPatch<Profile>('/api/v1/me', { first_name, last_name });
export const removePhoto = () => apiDelete<Profile>('/api/v1/me/photo');

// Multipart, so it goes through fetch like the logo upload.
export async function uploadPhoto(file: File): Promise<Profile> {
  const token = useAuthStore.getState().token;
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${base}/api/v1/me/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => ({})) as { data?: Profile; error?: string };
  if (!res.ok || !body.data) throw new Error(body.error ?? 'Your photo could not be uploaded.');
  return body.data;
}

export function useProfile() {
  const token = useAuthStore(s => s.token);
  return useQuery({ queryKey: PROFILE_KEY, queryFn: getProfile, enabled: !!token, staleTime: 5 * 60 * 1000 });
}
