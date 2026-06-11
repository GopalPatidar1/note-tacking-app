import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useSearch } from '@/hooks/notes/use-search'
import { http } from '@/lib/http'
import type { PaginatedSearchResultsDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({ http: { get: vi.fn() } }))

const mockResults: PaginatedSearchResultsDTO = {
  items: [
    {
      id: 'note-1',
      title: 'Meeting notes',
      headline: 'Discussed <b>roadmap</b> with the team',
      tags: [{ name: 'Work', color: '#3B82F6' }],
      createdAt: '2026-06-10T10:00:00Z',
      updatedAt: '2026-06-10T10:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  query: 'roadmap',
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useSearch', () => {
  beforeEach(() => vi.clearAllMocks())

  // Scenario A — enabled guard
  it('does not call GET /search when q is shorter than 2 chars', () => {
    renderHook(() => useSearch({ q: 'a', page: 1, limit: 20 }), {
      wrapper: makeWrapper(),
    })

    expect(http.get).not.toHaveBeenCalled()
  })

  it('does not call GET /search when q is empty', () => {
    renderHook(() => useSearch({ q: '', page: 1, limit: 20 }), {
      wrapper: makeWrapper(),
    })

    expect(http.get).not.toHaveBeenCalled()
  })

  // Scenario B — fires when q >= 2
  it('calls GET /search with correct params when q has 2+ chars', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockResults } })

    renderHook(() => useSearch({ q: 'ro', page: 1, limit: 20 }), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1))
    expect(http.get).toHaveBeenCalledWith('/search', {
      params: { q: 'ro', page: 1, limit: 20 },
    })
  })

  // Scenario C — returns paginated data
  it('returns paginated search results on success', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockResults } })

    const { result } = renderHook(
      () => useSearch({ q: 'roadmap', page: 1, limit: 20 }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockResults)
    expect(result.current.data?.items).toHaveLength(1)
    expect(result.current.data?.query).toBe('roadmap')
  })

  // Scenario D — unique cache keys
  it('uses different query keys for different q values', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockResults } })

    const { result: r1 } = renderHook(
      () => useSearch({ q: 'foo', page: 1, limit: 20 }),
      { wrapper: makeWrapper() },
    )
    const { result: r2 } = renderHook(
      () => useSearch({ q: 'bar', page: 1, limit: 20 }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => expect(r1.current.isSuccess).toBe(true))
    await waitFor(() => expect(r2.current.isSuccess).toBe(true))

    // Both hooks fired independently — each with its own q
    expect(http.get).toHaveBeenCalledWith('/search', expect.objectContaining({ params: expect.objectContaining({ q: 'foo' }) }))
    expect(http.get).toHaveBeenCalledWith('/search', expect.objectContaining({ params: expect.objectContaining({ q: 'bar' }) }))
  })
})
