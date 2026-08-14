// src/store/settingsStore.ts

import { create } from "zustand";

interface SettingsState {
  currency: string;
  logoUrl: string | null;
  setCurrency: (symbol: string) => void;
  setLogoUrl: (url: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  currency: "₦",
  logoUrl: null,
  setCurrency: (symbol) => set({ currency: symbol }),
  setLogoUrl: (url) => set({ logoUrl: url }),
}));