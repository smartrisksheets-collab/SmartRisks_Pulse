import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'auto';

interface UIState {
  sidebarCollapsed: boolean;
  mobSidebarOpen: boolean;
  theme: Theme;
  themeChosen: boolean;
  toggleSidebar: () => void;
  setMobSidebarOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  applyWorkspaceTheme: (theme: Theme) => void;
}

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function applyTheme(theme: Theme) {
  const resolved = theme === 'auto' ? (darkQuery?.matches ? 'dark' : 'light') : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      mobSidebarOpen: false,
      theme: 'light',
      themeChosen: false,

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobSidebarOpen: (open) => set({ mobSidebarOpen: open }),
      setTheme: (theme) => { applyTheme(theme); set({ theme, themeChosen: true }); },
      applyWorkspaceTheme: (theme) => {
        if (get().themeChosen) return;
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: 'sr-ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, theme: s.theme, themeChosen: s.themeChosen }),
      onRehydrateStorage: () => (state) => { if (state) applyTheme(state.theme); },
    }
  )
);

darkQuery?.addEventListener('change', () => {
  if (useUIStore.getState().theme === 'auto') applyTheme('auto');
});