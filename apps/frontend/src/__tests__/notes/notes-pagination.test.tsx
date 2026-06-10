import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NotesPagination } from '@/components/notes/notes-pagination'

describe('NotesPagination', () => {
  it('renders nothing when total is less than or equal to limit', () => {
    const { container } = render(
      <NotesPagination page={1} total={10} limit={20} onPageChange={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when total equals limit exactly', () => {
    const { container } = render(
      <NotesPagination page={1} total={20} limit={20} onPageChange={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders Prev and Next buttons when total > limit', () => {
    render(<NotesPagination page={2} total={60} limit={20} onPageChange={vi.fn()} />)
    expect(screen.getByText('← Prev')).toBeInTheDocument()
    expect(screen.getByText('Next →')).toBeInTheDocument()
  })

  it('disables Prev button on the first page', () => {
    render(<NotesPagination page={1} total={60} limit={20} onPageChange={vi.fn()} />)
    expect(screen.getByText('← Prev').closest('button')).toBeDisabled()
    expect(screen.getByText('Next →').closest('button')).not.toBeDisabled()
  })

  it('disables Next button on the last page', () => {
    render(<NotesPagination page={3} total={60} limit={20} onPageChange={vi.fn()} />)
    expect(screen.getByText('Next →').closest('button')).toBeDisabled()
    expect(screen.getByText('← Prev').closest('button')).not.toBeDisabled()
  })

  it('calls onPageChange with page + 1 when Next is clicked', async () => {
    const onPageChange = vi.fn()
    render(<NotesPagination page={1} total={60} limit={20} onPageChange={onPageChange} />)
    await userEvent.click(screen.getByText('Next →'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange with page - 1 when Prev is clicked', async () => {
    const onPageChange = vi.fn()
    render(<NotesPagination page={3} total={60} limit={20} onPageChange={onPageChange} />)
    await userEvent.click(screen.getByText('← Prev'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange with correct page when a numbered button is clicked', async () => {
    const onPageChange = vi.fn()
    render(<NotesPagination page={1} total={60} limit={20} onPageChange={onPageChange} />)
    await userEvent.click(screen.getByText('2'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('renders all page numbers when total pages <= 7', () => {
    render(<NotesPagination page={1} total={140} limit={20} onPageChange={vi.fn()} />)
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument()
    }
  })
})
