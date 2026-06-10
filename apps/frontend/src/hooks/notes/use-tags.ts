import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { TagDTO } from '@note-app/shared'

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () =>
      http.get<{ data: TagDTO[] }>('/tags').then((r) => r.data.data),
  })
}
