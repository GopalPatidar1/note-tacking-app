import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { NoteVersionDTO } from '@note-app/shared'

export function useNoteVersion(noteId: string, versionId: string | null) {
  return useQuery({
    queryKey: ['note-version', noteId, versionId],
    queryFn:  () =>
      http
        .get<{ data: NoteVersionDTO }>(`/notes/${noteId}/versions/${versionId}`)
        .then((r) => r.data.data),
    enabled: !!noteId && !!versionId,
  })
}
