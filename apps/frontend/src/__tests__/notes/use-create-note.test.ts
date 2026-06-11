import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useCreateNote } from '@/hooks/notes/use-create-note'
import { http } from '@/lib/http'
import type { NoteDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const mockNote: NoteDTO = {
  id: 'note-1',
  userId: 'user-1',
  title: 'New Note',
  content: '<p>Content</p>',
  tags: [],
  deletedAt: null,
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T10:00:00Z',
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

describe('useCreateNote', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /notes with the provided body', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { data: mockNote } })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useCreateNote(), { wrapper })

    await act(async () => {
      result.current.mutate({ title: 'New Note', content: '<p>Content</p>', tagIds: [] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(http.post).toHaveBeenCalledWith('/notes', {
      title: 'New Note',
      content: '<p>Content</p>',
      tagIds: [],
    })
  })

  it('returns the created note on success', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { data: mockNote } })
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useCreateNote(), { wrapper })

    await act(async () => {
      result.current.mutate({ title: 'New Note', content: '<p>Content</p>', tagIds: [] })
    })

    await waitFor(() => expect(result.current.data).toEqual(mockNote))
  })

  it('invalidates the ["notes"] query on success', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { data: mockNote } })
    const { wrapper, queryClient } = makeWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateNote(), { wrapper })

    await act(async () => {
      result.current.mutate({ title: 'New Note', content: '', tagIds: [] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notes'] })
  })

  it('shows error toast on failure', async () => {
    const { toast } = await import('sonner')
    vi.mocked(http.post).mockRejectedValue(new Error('Network error'))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useCreateNote(), { wrapper })

    await act(async () => {
      result.current.mutate({ title: 'New Note', content: '', tagIds: [] })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalledWith('Failed to create note')
  })
})
