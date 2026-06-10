import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { NoteCard } from '@/components/notes/note-card'
import type { NoteDTO } from '@note-app/shared'

const mockNote: NoteDTO = {
  id: 'note-1',
  userId: 'user-1',
  title: 'Test Note',
  content: '<p>Hello <strong>world</strong> this is a test note</p>',
  tags: [
    { id: 'tag-1', userId: 'user-1', name: 'Work', color: '#3B82F6' },
  ],
  deletedAt: null,
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T10:00:00Z',
}

function renderCard(onDelete = vi.fn()) {
  return render(
    <MemoryRouter>
      <NoteCard note={mockNote} onDelete={onDelete} />
    </MemoryRouter>
  )
}

describe('NoteCard', () => {
  it('renders the note title', () => {
    renderCard()
    expect(screen.getByText('Test Note')).toBeInTheDocument()
  })

  it('renders stripped content preview', () => {
    renderCard()
    expect(screen.getByText(/Hello world this is a test note/)).toBeInTheDocument()
  })

  it('renders tag pill with correct name', () => {
    renderCard()
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('renders the formatted date', () => {
    renderCard()
    expect(screen.getByText(/Jun 10, 2026/)).toBeInTheDocument()
  })

  it('calls onDelete with note id when delete button is clicked', async () => {
    const onDelete = vi.fn()
    renderCard(onDelete)
    const deleteBtn = screen.getByRole('button', { name: /delete note/i })
    await userEvent.click(deleteBtn)
    expect(onDelete).toHaveBeenCalledWith('note-1')
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('truncates long preview to 120 chars with ellipsis', () => {
    const longNote: NoteDTO = {
      ...mockNote,
      content: `<p>${'A'.repeat(200)}</p>`,
    }
    render(
      <MemoryRouter>
        <NoteCard note={longNote} onDelete={vi.fn()} />
      </MemoryRouter>
    )
    const preview = screen.getByText(/A+…/)
    expect(preview.textContent).toHaveLength(121)
  })

  it('renders no preview when content is empty', () => {
    const emptyNote: NoteDTO = { ...mockNote, content: '' }
    renderCard()
    const card = render(
      <MemoryRouter>
        <NoteCard note={emptyNote} onDelete={vi.fn()} />
      </MemoryRouter>
    )
    expect(card.container.querySelector('p.text-muted-foreground')).toBeNull()
  })
})
