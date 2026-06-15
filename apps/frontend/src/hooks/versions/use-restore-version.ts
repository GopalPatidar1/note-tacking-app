import { useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { NoteDTO } from '@note-app/shared'

export function useRestoreVersion(noteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) =>
      http
        .post<{ data: NoteDTO }>(`/notes/${noteId}/versions/${versionId}/restore`)
        .then((r) => r.data.data),
    onSuccess: (data) => {
      queryClient.setQueryData(['notes', noteId], data)
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['note-versions', noteId] })
    },
  })
}
