import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useNoteVersion } from '@/hooks/versions/use-note-version'
import { http } from '@/lib/http'
import type { NoteVersionDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({ http: { get: vi.fn() } }))

const mockVersion: NoteVersionDTO = {
  id:            'ver-1',
  noteId:        'note-1',
  title:         'Note v1',
  content:       '<p>v1</p>',
  versionNumber: 1,
  createdAt:     '2026-06-11T10:00:00Z',
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useNoteVersion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls GET /notes/:id/versions/:versionId', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockVersion } })

    const { result } = renderHook(() => useNoteVersion('note-1', 'ver-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(http.get).toHaveBeenCalledWith('/notes/note-1/versions/ver-1')
  })

  it('query is disabled when versionId is null', async () => {
    const { result } = renderHook(() => useNoteVersion('note-1', null), {
      wrapper: makeWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(http.get).not.toHaveBeenCalled()
  })
})
