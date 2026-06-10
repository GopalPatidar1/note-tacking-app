import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { http } from '@/lib/http'

export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      http.delete<{ data: { message: string } }>(`/notes/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.success('Note deleted')
    },
    onError: () => {
      toast.error('Failed to delete note')
    },
  })
}
