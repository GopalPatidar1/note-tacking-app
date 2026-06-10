import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { PaginatedNotesDTO, ListNotesQueryDTO } from '@note-app/shared'

export function useNotes(filters: Partial<ListNotesQueryDTO>) {
  return useQuery({
    queryKey: ['notes', filters],
    queryFn: () =>
      http
        .get<{ data: PaginatedNotesDTO }>('/notes', { params: filters })
        .then((r) => r.data.data),
  })
}
