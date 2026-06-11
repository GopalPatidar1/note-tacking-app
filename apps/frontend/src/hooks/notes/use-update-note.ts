import { useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { UpdateNoteDTO, NoteDTO } from '@note-app/shared'

export function useUpdateNote(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateNoteDTO) =>
      http.patch<{ data: NoteDTO }>(`/notes/${id}`, body).then((r) => r.data.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['notes', id], updated)
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}
