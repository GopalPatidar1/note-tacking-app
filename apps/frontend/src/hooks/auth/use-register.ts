import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { http } from '@/lib/http'
import { useAuthStore } from '@/stores/auth.store'
import type { RegisterRequestDTO, AuthResponseDTO } from '@note-app/shared'

export function useRegister() {
  const { setTokens, setUser } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (body: RegisterRequestDTO) =>
      http.post<{ data: AuthResponseDTO }>('/auth/register', body).then((r) => r.data.data),
    onSuccess: ({ accessToken, refreshToken, user }) => {
      setTokens({ accessToken, refreshToken })
      setUser(user)
      navigate('/notes', { replace: true })
    },
    onError: (error: unknown) => {
      const message = extractErrorMessage(error)
      toast.error(message)
    },
  })
}

function extractErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response
  ) {
    const data = error.response.data as { error?: { message?: string } }
    return data?.error?.message ?? 'Something went wrong'
  }
  return 'Something went wrong'
}
