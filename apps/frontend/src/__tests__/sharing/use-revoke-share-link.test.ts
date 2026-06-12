import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useRevokeShareLink } from '@/hooks/sharing/use-revoke-share-link'
import { http } from '@/lib/http'

vi.mock('@/lib/http', () => ({ http: { delete: vi.fn() } }))

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  }
}

describe('useRevokeShareLink', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls DELETE /share/:id with the correct link ID', async () => {
    vi.mocked(http.delete).mockResolvedValue({ data: { data: { message: 'Share link revoked' } } })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRevokeShareLink(), { wrapper })

    await act(async () => {
      result.current.mutate('link-1')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(http.delete).toHaveBeenCalledWith('/share/link-1')
  })

  it('sets isSuccess true on 200 response', async () => {
    vi.mocked(http.delete).mockResolvedValue({ data: {} })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useRevokeShareLink(), { wrapper })

    await act(async () => {
      result.current.mutate('link-2')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
  })
})
