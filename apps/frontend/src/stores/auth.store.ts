import { create } from 'zustand'
import type { UserPublic } from '@note-app/shared'

const ACCESS_TOKEN_KEY = 'auth.accessToken'
const REFRESH_TOKEN_KEY = 'auth.refreshToken'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: UserPublic | null
  isAuthenticated: boolean

  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void
  setUser: (user: UserPublic) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,

  setTokens: ({ accessToken, refreshToken }) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    set({ accessToken, refreshToken, isAuthenticated: true })
  },

  setUser: (user) => {
    set({ user })
  },

  clearAuth: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    set({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false })
  },
}))

export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY }
