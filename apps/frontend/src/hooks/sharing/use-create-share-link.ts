import { useMutation } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { CreateShareLinkDTO, ShareLinkResponseDTO } from '@note-app/shared'

export function useCreateShareLink(noteId: string) {
  return useMutation({
    mutationFn: (body: CreateShareLinkDTO) =>
      http
        .post<{ data: ShareLinkResponseDTO }>(`/notes/${noteId}/share`, body)
        .then((r) => r.data.data),
  })
}
