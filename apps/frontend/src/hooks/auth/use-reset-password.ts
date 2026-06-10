import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { http } from '@/lib/http'
import type { ResetPasswordRequestDTO } from '@note-app/shared'

export function useResetPassword() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (body: ResetPasswordRequestDTO) =>
      http.post('/auth/reset-password', body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Password reset — please log in')
      navigate('/login', { replace: true })
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
