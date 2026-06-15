import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { PaginatedVersionsDTO } from '@note-app/shared'

export function useNoteVersions(noteId: string, page = 1) {
  return useQuery({
    queryKey: ['note-versions', noteId, page],
    queryFn:  () =>
      http
        .get<{ data: PaginatedVersionsDTO }>(`/notes/${noteId}/versions`, {
          params: { page, limit: 20 },
        })
        .then((r) => r.data.data),
    enabled: !!noteId,
  })
}
