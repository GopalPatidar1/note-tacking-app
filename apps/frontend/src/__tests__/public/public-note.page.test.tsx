import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { PublicNotePage } from '@/pages/public/public-note.page'
import type { PublicNoteDTO } from '@note-app/shared'

vi.mock('@/lib/public-http', () => ({
  publicHttp: { get: vi.fn() },
}))

import { publicHttp } from '@/lib/public-http'

const mockNote: PublicNoteDTO = {
  id:        'note-1',
  title:     'Meeting notes',
  content:   '<p>Discussed the <b>roadmap</b> with the team.</p>',
  tags:      [{ name: 'Work', color: '#3B82F6' }],
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T12:00:00Z',
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage(token = 'abc123') {
  const client = makeClient()
  return render(
    createElement(
      QueryClientProvider,
      { client },
      <MemoryRouter initialEntries={[`/public/${token}`]}>
        <Routes>
          <Route path="/public/:token" element={<PublicNotePage />} />
        </Routes>
      </MemoryRouter>,
    ),
  )
}

describe('PublicNotePage', () => {
  beforeEach(() => vi.clearAllMocks())

  // T-13a
  it('shows loading spinner while query is pending', () => {
    vi.mocked(publicHttp.get).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByLabelText(/loading note/i)).toBeInTheDocument()
  })

  // T-13b
  it('renders the note title as h1 on success', async () => {
    vi.mocked(publicHttp.get).mockResolvedValue({ data: { data: mockNote } })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Meeting notes' })).toBeInTheDocument()
  })

  // T-13c
  it('renders tag pills with correct names', async () => {
    vi.mocked(publicHttp.get).mockResolvedValue({ data: { data: mockNote } })
    renderPage()
    expect(await screen.findByText('Work')).toBeInTheDocument()
  })

  // T-13d
  it('renders note content via dangerouslySetInnerHTML', async () => {
    vi.mocked(publicHttp.get).mockResolvedValue({ data: { data: mockNote } })
    const { container } = renderPage()
    await waitFor(() => screen.findByRole('heading', { name: 'Meeting notes' }))
    const bold = container.querySelector('b')
    expect(bold).not.toBeNull()
    expect(bold?.textContent).toBe('roadmap')
  })

  // T-13e
  it('shows "Link invalid or expired" message when query errors', async () => {
    vi.mocked(publicHttp.get).mockRejectedValue(new Error('Not found'))
    renderPage()
    expect(await screen.findByText(/link invalid or expired/i)).toBeInTheDocument()
  })

  // T-13f
  it('renders "Shared note — view only" footer on success', async () => {
    vi.mocked(publicHttp.get).mockResolvedValue({ data: { data: mockNote } })
    renderPage()
    expect(await screen.findByText(/shared note — view only/i)).toBeInTheDocument()
  })
})
