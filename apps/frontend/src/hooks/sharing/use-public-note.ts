import { useQuery } from '@tanstack/react-query'
import { publicHttp } from '@/lib/public-http'
import type { PublicNoteDTO } from '@note-app/shared'

export function usePublicNote(token: string) {
  return useQuery({
    queryKey: ['public-note', token],
    queryFn: () =>
      publicHttp
        .get<{ data: PublicNoteDTO }>(`/public/${token}`)
        .then((r) => r.data.data),
    retry: false,
  })
}
