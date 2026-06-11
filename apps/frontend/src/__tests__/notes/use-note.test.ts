import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useNote } from '@/hooks/notes/use-note'
import { http } from '@/lib/http'
import type { NoteDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({ http: { get: vi.fn() } }))

const mockNote: NoteDTO = {
  id: 'note-1',
  userId: 'user-1',
  title: 'Test Note',
  content: '<p>Hello</p>',
  tags: [],
  deletedAt: null,
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T10:00:00Z',
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useNote', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches note by id when id is provided', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockNote } })

    const { result } = renderHook(() => useNote('note-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockNote)
    expect(http.get).toHaveBeenCalledWith('/notes/note-1')
  })

  it('does not fetch when id is undefined', () => {
    const { result } = renderHook(() => useNote(undefined), {
      wrapper: makeWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(http.get).not.toHaveBeenCalled()
  })
})
