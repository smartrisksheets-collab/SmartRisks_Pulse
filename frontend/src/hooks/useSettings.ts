// src/hooks/useSettings.ts

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyBrandColors } from "../utils/brand";
import {
  fetchNotificationPrefs,
  fetchSettings,
  patchNotificationPrefs,
  patchSettings,
  removePin,
  setPin,
} from "../services/settings";
import { useSettingsStore } from "../store/settingsStore";
import { useUIStore } from "../store/uiStore";
import type { SettingsData, NotificationPrefUpdate, SettingsUpdate } from "../types/settings";

const SETTINGS_KEY = ["settings"] as const;
const NOTIF_KEY = ["notification_prefs"] as const;


export function useSettings() {
  const queryClient = useQueryClient();
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const setLogoUrl = useSettingsStore((s) => s.setLogoUrl);
  const setTheme = useUIStore((s) => s.setTheme);

  const query = useQuery<SettingsData>({
    queryKey: SETTINGS_KEY,
    queryFn: fetchSettings,
    staleTime: 1000 * 60 * 5,
  });

  const update = useMutation({
    mutationFn: (payload: SettingsUpdate) => patchSettings(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_KEY, data);
      if (data.currency_symbol) setCurrency(data.currency_symbol);
      applyBrandColors(data.primary_color, data.accent_color);
      setTheme(data.theme_mode as "light" | "dark" | "auto");
      setLogoUrl(data.logo_url ?? null);
    },
  });

  const setPinMutation = useMutation({
    mutationFn: (new_pin: string) => setPin(new_pin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });

  const removePinMutation = useMutation({
    mutationFn: removePin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });

  useEffect(() => {
    const d = query.data;
    if (!d) return;
    applyBrandColors(d.primary_color, d.accent_color);
    setTheme(d.theme_mode as "light" | "dark" | "auto");
    setLogoUrl(d.logo_url ?? null);
  }, [query.data, setLogoUrl, setTheme]);

  return { query, update, setPinMutation, removePinMutation };
}

export function useNotificationPrefs() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: NOTIF_KEY,
    queryFn: fetchNotificationPrefs,
    staleTime: 1000 * 60 * 5,
  });

  const update = useMutation({
    mutationFn: (payload: NotificationPrefUpdate) =>
      patchNotificationPrefs(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(NOTIF_KEY, data);
    },
  });

  return { query, update };
}