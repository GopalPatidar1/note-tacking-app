import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { router } from './router'
import { queryClient } from './lib/query-client'
import { useAuthStore, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './stores/auth.store'
import './index.css'

const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
if (accessToken && refreshToken) {
  useAuthStore.getState().setTokens({ accessToken, refreshToken })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>
)
