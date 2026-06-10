import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { http } from '@/lib/http'
import { useAuthStore } from '@/stores/auth.store'
import type { LoginRequestDTO, AuthResponseDTO } from '@note-app/shared'

export function useLogin() {
  const { setTokens, setUser } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (body: LoginRequestDTO) =>
      http.post<{ data: AuthResponseDTO }>('/auth/login', body).then((r) => r.data.data),
    onSuccess: ({ accessToken, refreshToken, user }) => {
      setTokens({ accessToken, refreshToken })
      setUser(user)
      navigate('/notes', { replace: true })
    },
    onError: (error: unknown) => {
      const message = extractLoginErrorMessage(error)
      toast.error(message)
    },
  })
}

function extractLoginErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: { error?: { message?: string } } } }).response
    if (response?.status === 401) return 'Invalid email or password'
    return response?.data?.error?.message ?? 'Something went wrong'
  }
  return 'Something went wrong'
}
