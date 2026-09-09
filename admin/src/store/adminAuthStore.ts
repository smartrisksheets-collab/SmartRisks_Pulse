import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AdminAuthState {
  token: string | null
  admin: {
    id: string
    email: string
    name: string
    role: string
  } | null
  setAuth: (token: string, admin: AdminAuthState['admin']) => void
  clear: () => void
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      setAuth: (token, admin) => set({ token, admin }),
      clear: () => set({ token: null, admin: null }),
    }),
    { name: 'admin-auth' }
  )
)