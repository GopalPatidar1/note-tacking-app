import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useCreateShareLink } from '@/hooks/sharing/use-create-share-link'
import { http } from '@/lib/http'
import type { ShareLinkResponseDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }))

const mockLink: ShareLinkResponseDTO = {
  id:        'link-1',
  noteId:    'note-1',
  token:     'abc123',
  expiresAt: null,
  revokedAt: null,
  viewCount: 0,
  createdAt: '2026-06-12T10:00:00Z',
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  }
}

describe('useCreateShareLink', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls POST /notes/:id/share with expiresAt: null when no expiry', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { data: mockLink } })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateShareLink('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate({ expiresAt: null })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(http.post).toHaveBeenCalledWith('/notes/note-1/share', { expiresAt: null })
  })

  it('calls POST /notes/:id/share with an ISO datetime when expiresAt is provided', async () => {
    const futureDate = '2026-06-19T10:00:00.000Z'
    const linkWithExpiry: ShareLinkResponseDTO = { ...mockLink, expiresAt: futureDate }
    vi.mocked(http.post).mockResolvedValue({ data: { data: linkWithExpiry } })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateShareLink('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate({ expiresAt: futureDate })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(http.post).toHaveBeenCalledWith('/notes/note-1/share', { expiresAt: futureDate })
  })

  it('returns ShareLinkResponseDTO on success', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { data: mockLink } })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateShareLink('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate({ expiresAt: null })
    })

    await waitFor(() => expect(result.current.data).toEqual(mockLink))
  })

  it('sets isError when http.post rejects', async () => {
    vi.mocked(http.post).mockRejectedValue(new Error('Network error'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateShareLink('note-1'), { wrapper })

    await act(async () => {
      result.current.mutate({ expiresAt: null })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
