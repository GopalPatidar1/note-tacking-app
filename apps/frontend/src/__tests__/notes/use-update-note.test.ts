import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useUpdateNote } from '@/hooks/notes/use-update-note'
import { http } from '@/lib/http'
import type { NoteDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({ http: { patch: vi.fn() } }))

const mockNote: NoteDTO = {
  id: 'note-1',
  userId: 'user-1',
  title: 'Updated Note',
  content: '<p>Updated</p>',
  tags: [],
  deletedAt: null,
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T11:00:00Z',
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
    queryClient,
  }
}

describe('useUpdateNote', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls PATCH /notes/:id with the provided body', async () => {
    vi.mocked(http.patch).mockResolvedValue({ data: { data: mockNote } })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useUpdateNote('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate({ title: 'Updated Note', content: '<p>Updated</p>' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(http.patch).toHaveBeenCalledWith('/notes/note-1', {
      title: 'Updated Note',
      content: '<p>Updated</p>',
    })
  })

  it('updates the query cache with the returned note on success', async () => {
    vi.mocked(http.patch).mockResolvedValue({ data: { data: mockNote } })
    const { wrapper, queryClient } = makeWrapper()

    const { result } = renderHook(() => useUpdateNote('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate({ title: 'Updated Note' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryData(['notes', 'note-1'])).toEqual(mockNote)
  })

  it('invalidates the ["notes"] list query on success', async () => {
    vi.mocked(http.patch).mockResolvedValue({ data: { data: mockNote } })
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateNote('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate({ title: 'Updated Note' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notes'] })
  })

  it('returns the updated note on success', async () => {
    vi.mocked(http.patch).mockResolvedValue({ data: { data: mockNote } })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useUpdateNote('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate({ content: '<p>Updated</p>' })
    })

    await waitFor(() => expect(result.current.data).toEqual(mockNote))
  })
})
