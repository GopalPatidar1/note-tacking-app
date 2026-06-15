import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useNoteVersions } from '@/hooks/versions/use-note-versions'
import { http } from '@/lib/http'
import type { PaginatedVersionsDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({ http: { get: vi.fn() } }))

const mockVersionsPage: PaginatedVersionsDTO = {
  items: [
    {
      id:            'ver-2',
      noteId:        'note-1',
      title:         'Note v2',
      content:       '<p>v2</p>',
      versionNumber: 2,
      createdAt:     '2026-06-12T10:00:00Z',
    },
    {
      id:            'ver-1',
      noteId:        'note-1',
      title:         'Note v1',
      content:       '<p>v1</p>',
      versionNumber: 1,
      createdAt:     '2026-06-11T10:00:00Z',
    },
  ],
  total: 2,
  page:  1,
  limit: 20,
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useNoteVersions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls GET /notes/:id/versions with page and limit params', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockVersionsPage } })

    const { result } = renderHook(() => useNoteVersions('note-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(http.get).toHaveBeenCalledWith('/notes/note-1/versions', {
      params: { page: 1, limit: 20 },
    })
  })

  it('returns PaginatedVersionsDTO on success', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockVersionsPage } })

    const { result } = renderHook(() => useNoteVersions('note-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockVersionsPage)
  })

  it('query is disabled when noteId is empty string', async () => {
    const { result } = renderHook(() => useNoteVersions(''), {
      wrapper: makeWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(http.get).not.toHaveBeenCalled()
  })
})
