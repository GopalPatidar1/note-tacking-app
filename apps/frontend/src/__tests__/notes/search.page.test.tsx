import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { SearchPage } from '@/pages/notes/search.page'
import type { PaginatedSearchResultsDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({ http: { get: vi.fn() } }))
vi.mock('@/hooks/auth/use-logout', () => ({
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { name: string } | null }) => unknown) =>
    selector({ user: { name: 'Alice' } }),
}))

import { http } from '@/lib/http'

const mockData: PaginatedSearchResultsDTO = {
  items: [
    {
      id: 'note-1',
      title: 'Meeting notes',
      headline: 'Discussed <b>roadmap</b> with team',
      tags: [],
      createdAt: '2026-06-10T10:00:00Z',
      updatedAt: '2026-06-10T10:00:00Z',
    },
    {
      id: 'note-2',
      title: 'Q3 Planning',
      headline: 'The <b>roadmap</b> needs owners',
      tags: [],
      createdAt: '2026-06-08T10:00:00Z',
      updatedAt: '2026-06-08T10:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
  query: 'roadmap',
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage(initialPath = '/search') {
  const client = makeClient()
  return render(
    createElement(
      QueryClientProvider,
      { client },
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
          <Route path="/notes/:id" element={<div data-testid="editor-page" />} />
        </Routes>
      </MemoryRouter>,
    ),
  )
}

describe('SearchPage', () => {
  beforeEach(() => vi.clearAllMocks())

  // Scenario H — idle state
  it('shows idle prompt when no query is present', () => {
    renderPage('/search')
    expect(screen.getByText(/Type at least 2 characters/i)).toBeInTheDocument()
    expect(http.get).not.toHaveBeenCalled()
  })

  it('shows idle prompt when query is only 1 character', () => {
    renderPage('/search?q=a')
    expect(screen.getByText(/Type at least 2 characters/i)).toBeInTheDocument()
  })

  // Scenario I — debounce: does NOT fire immediately
  it('does not call the API immediately on input change (before debounce)', () => {
    vi.useFakeTimers()
    renderPage('/search')
    const input = screen.getByPlaceholderText(/Search notes/i)
    // Directly fire change event — synchronous, no timer advancement
    fireEvent.change(input, { target: { value: 'ro' } })
    expect(http.get).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('calls the API after the 400ms debounce fires', async () => {
    vi.useFakeTimers()
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockData } })
    renderPage('/search')
    const input = screen.getByPlaceholderText(/Search notes/i)
    fireEvent.change(input, { target: { value: 'roadmap' } })
    expect(http.get).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(http.get).toHaveBeenCalledWith('/search', expect.objectContaining({
      params: expect.objectContaining({ q: 'roadmap' }),
    }))
    vi.useRealTimers()
  })

  // Scenario J — loading state
  it('shows skeleton rows while loading', () => {
    vi.mocked(http.get).mockReturnValue(new Promise(() => {}))
    renderPage('/search?q=roadmap')
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBe(3)
  })

  // Scenario K — results rendered
  it('shows result count and result cards when data resolves', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockData } })
    renderPage('/search?q=roadmap')
    expect(await screen.findByText(/2 results for/i)).toBeInTheDocument()
    expect(screen.getByText('Meeting notes')).toBeInTheDocument()
    expect(screen.getByText('Q3 Planning')).toBeInTheDocument()
  })

  it('uses singular "result" for a single match', async () => {
    const single: PaginatedSearchResultsDTO = { ...mockData, items: [mockData.items[0]], total: 1 }
    vi.mocked(http.get).mockResolvedValue({ data: { data: single } })
    renderPage('/search?q=roadmap')
    expect(await screen.findByText(/1 result for/)).toBeInTheDocument()
  })

  // Scenario L — empty state
  it('shows empty state when no results are returned', async () => {
    const empty: PaginatedSearchResultsDTO = { ...mockData, items: [], total: 0 }
    vi.mocked(http.get).mockResolvedValue({ data: { data: empty } })
    renderPage('/search?q=roadmap')
    expect(await screen.findByText(/No notes found for/i)).toBeInTheDocument()
  })

  // Scenario M — error state
  it('shows error message when the API call fails', async () => {
    vi.mocked(http.get).mockRejectedValue(new Error('Network error'))
    renderPage('/search?q=roadmap')
    expect(await screen.findByText(/Search failed/i)).toBeInTheDocument()
  })

  // Scenario N — pagination (FR-4 pagination requirement)
  it('renders pagination when total exceeds one page', async () => {
    const paged: PaginatedSearchResultsDTO = { ...mockData, total: 40, limit: 20, page: 1 }
    vi.mocked(http.get).mockResolvedValue({ data: { data: paged } })
    renderPage('/search?q=roadmap')
    await screen.findByText('Meeting notes')
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /prev/i })).toBeInTheDocument()
  })

  it('does not render pagination when all results fit on one page', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { data: mockData } })
    renderPage('/search?q=roadmap')
    await screen.findByText('Meeting notes')
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
  })
})
