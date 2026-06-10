import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { http } from '@/lib/http'
import type { ForgotPasswordRequestDTO } from '@note-app/shared'

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordRequestDTO) =>
      http.post('/auth/forgot-password', body).then((r) => r.data),
    onError: () => {
      toast.error('Something went wrong. Please try again.')
    },
  })
}
