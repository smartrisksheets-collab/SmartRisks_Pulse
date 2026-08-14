// src/services/settings.ts

import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import { useAuthStore } from "../store/authStore";
import type {
  NotificationPref,
  NotificationPrefUpdate,
  SettingsData,
  SettingsUpdate,
} from "../types/settings";

export const fetchSettings = (): Promise<SettingsData> =>
  apiGet<SettingsData>("/api/v1/settings");

export const patchSettings = (payload: SettingsUpdate): Promise<SettingsData> =>
  apiPatch<SettingsData>("/api/v1/settings", payload);

export const setPin = (new_pin: string): Promise<{ has_pin: boolean }> =>
  apiPost<{ has_pin: boolean }>("/api/v1/settings/pin", { new_pin });

export const removePin = (): Promise<{ has_pin: boolean }> =>
  apiDelete<{ has_pin: boolean }>("/api/v1/settings/pin");

export const fetchNotificationPrefs = (): Promise<NotificationPref> =>
  apiGet<NotificationPref>("/api/v1/notifications/prefs");

export async function uploadLogo(file: File): Promise<{ logo_url: string }> {
  const token = useAuthStore.getState().token;
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${base}/api/v1/settings/logo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Upload failed");
  }
  const body = await res.json() as { data: { logo_url: string } };
  return body.data;
}

export const patchNotificationPrefs = (
  payload: NotificationPrefUpdate
): Promise<NotificationPref> =>
  apiPatch<NotificationPref>("/api/v1/notifications/prefs", payload);