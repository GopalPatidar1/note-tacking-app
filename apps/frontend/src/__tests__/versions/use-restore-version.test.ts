import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useRestoreVersion } from '@/hooks/versions/use-restore-version'
import { http } from '@/lib/http'
import type { NoteDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }))

const mockNote: NoteDTO = {
  id:        'note-1',
  userId:    'user-1',
  title:     'Restored Note',
  content:   '<p>v1</p>',
  tags:      [],
  deletedAt: null,
  createdAt: '2026-06-11T10:00:00Z',
  updatedAt: '2026-06-12T10:00:00Z',
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  }
}

describe('useRestoreVersion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /notes/:id/versions/:versionId/restore', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { data: mockNote } })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRestoreVersion('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate('ver-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(http.post).toHaveBeenCalledWith('/notes/note-1/versions/ver-1/restore')
  })

  it('onSuccess sets query data and invalidates note queries', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { data: mockNote } })
    const { wrapper, queryClient } = makeWrapper()

    const setQueryDataSpy   = vi.spyOn(queryClient, 'setQueryData')
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRestoreVersion('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate('ver-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(setQueryDataSpy).toHaveBeenCalledWith(['notes', 'note-1'], mockNote)
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['notes'] })
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['note-versions', 'note-1'] })
  })

  it('propagates error to isError state', async () => {
    vi.mocked(http.post).mockRejectedValue(new Error('Network error'))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useRestoreVersion('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate('ver-1')
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
