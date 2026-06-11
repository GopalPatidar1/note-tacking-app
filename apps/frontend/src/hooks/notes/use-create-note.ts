import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { http } from '@/lib/http'
import type { CreateNoteDTO, NoteDTO } from '@note-app/shared'

export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateNoteDTO) =>
      http.post<{ data: NoteDTO }>('/notes', body).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
    onError: () => {
      toast.error('Failed to create note')
    },
  })
}
