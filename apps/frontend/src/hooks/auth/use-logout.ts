import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { http } from '@/lib/http'
import { useAuthStore } from '@/stores/auth.store'

export function useLogout() {
  const { clearAuth, refreshToken } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => http.post('/auth/logout', { refreshToken }),
    onSuccess: () => {
      clearAuth()
      navigate('/login', { replace: true })
    },
    onError: () => {
      // Clear auth locally even if the server call fails
      clearAuth()
      navigate('/login', { replace: true })
      toast.error('Logged out (session may have expired)')
    },
  })
}
