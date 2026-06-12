import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { SearchResultCard } from '@/components/notes/search-result-card'
import type { SearchResultDTO } from '@note-app/shared'

const mockResult: SearchResultDTO = {
  id: 'note-1',
  title: 'Meeting notes',
  headline: 'Discussed <b>roadmap</b> with the team',
  tags: [{ name: 'Work', color: '#3B82F6' }],
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T10:00:00Z',
}

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderCard(result = mockResult) {
  return render(
    <MemoryRouter>
      <SearchResultCard result={result} />
    </MemoryRouter>,
  )
}

describe('SearchResultCard', () => {
  // Scenario E — renders result fields
  it('renders the note title', () => {
    renderCard()
    expect(screen.getByText('Meeting notes')).toBeInTheDocument()
  })

  it('renders tag pill name', () => {
    renderCard()
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('renders the formatted date', () => {
    renderCard()
    expect(screen.getByText(/Jun 10, 2026/)).toBeInTheDocument()
  })

  // Scenario F — highlights are rendered as HTML (not stripped)
  it('renders ts_headline with <b> tag preserved in DOM', () => {
    const { container } = renderCard()
    const bold = container.querySelector('b')
    expect(bold).not.toBeNull()
    expect(bold?.textContent).toBe('roadmap')
  })

  it('renders surrounding headline text alongside highlight', () => {
    renderCard()
    expect(screen.getByText(/Discussed/)).toBeInTheDocument()
    expect(screen.getByText(/with the team/)).toBeInTheDocument()
  })

  // Scenario G — click navigates to editor
  it('navigates to /notes/:id when card is clicked', async () => {
    renderCard()
    await userEvent.click(screen.getByText('Meeting notes'))
    expect(mockNavigate).toHaveBeenCalledWith('/notes/note-1')
  })
})
