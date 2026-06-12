import { useMutation } from '@tanstack/react-query'
import { http } from '@/lib/http'

export function useRevokeShareLink() {
  return useMutation({
    mutationFn: (shareLinkId: string) =>
      http.delete(`/share/${shareLinkId}`),
  })
}
