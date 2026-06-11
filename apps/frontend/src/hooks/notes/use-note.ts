import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { NoteDTO } from '@note-app/shared'

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: ['notes', id],
    queryFn: () =>
      http.get<{ data: NoteDTO }>(`/notes/${id}`).then((r) => r.data.data),
    enabled: !!id,
  })
}
