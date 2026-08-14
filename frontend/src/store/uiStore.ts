import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'auto';

interface UIState {
  sidebarCollapsed: boolean;
  mobSidebarOpen: boolean;
  theme: Theme;
  toggleSidebar: () => void;
  setMobSidebarOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobSidebarOpen: false,
      theme: 'light',

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobSidebarOpen: (open) => set({ mobSidebarOpen: open }),
      setTheme: (theme) => { applyTheme(theme); set({ theme }); },
    }),
    {
      name: 'sr-ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, theme: s.theme }),
      onRehydrateStorage: () => (state) => { if (state) applyTheme(state.theme); },
    }
  )
);