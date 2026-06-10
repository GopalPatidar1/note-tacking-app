import axios from 'axios'
import { useAuthStore } from '@/stores/auth.store'

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean
  }
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
})

http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error)

    const original = error.config
    if (!original) return Promise.reject(error)

    const isAuthEndpoint = original.url?.startsWith('/auth/')

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true
      const { refreshToken } = useAuthStore.getState()

      if (!refreshToken) {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
          `${import.meta.env.VITE_API_URL as string}/auth/refresh`,
          { refreshToken }
        )
        useAuthStore.getState().setTokens(data.data)
        original.headers.Authorization = `Bearer ${data.data.accessToken}`
        return http(original)
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export { http }
