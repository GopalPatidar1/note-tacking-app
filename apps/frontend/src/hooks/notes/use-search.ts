import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import type { SearchQueryDTO, PaginatedSearchResultsDTO } from '@note-app/shared'

export function useSearch(params: SearchQueryDTO) {
  return useQuery({
    queryKey: ['search', params],
    queryFn: () =>
      http
        .get<{ data: PaginatedSearchResultsDTO }>('/search', { params })
        .then((r) => r.data.data),
    enabled: params.q.length >= 2,
  })
}
