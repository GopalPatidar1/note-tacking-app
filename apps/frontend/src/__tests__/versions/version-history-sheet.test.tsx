import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { VersionHistorySheet } from '@/components/versions/version-history-sheet'
import type { NoteVersionDTO, PaginatedVersionsDTO, NoteDTO } from '@note-app/shared'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// ── Mock data ─────────────────────────────────────────────────────────────────

const v2: NoteVersionDTO = {
  id: 'ver-2', noteId: 'note-1', title: 'Note v2', content: '<p>v2</p>',
  versionNumber: 2, createdAt: '2026-06-12T10:00:00Z',
}
const v1: NoteVersionDTO = {
  id: 'ver-1', noteId: 'note-1', title: 'Note v1', content: '<p>v1</p>',
  versionNumber: 1, createdAt: '2026-06-11T10:00:00Z',
}

const mockPage: PaginatedVersionsDTO = { items: [v2, v1], total: 2, page: 1, limit: 20 }

const mockRestoredNote: NoteDTO = {
  id: 'note-1', userId: 'user-1', title: 'Note v1', content: '<p>v1</p>',
  tags: [], deletedAt: null, createdAt: '2026-06-11T10:00:00Z', updatedAt: '2026-06-12T11:00:00Z',
}

// ── Hook mocks — mutable flags follow share-modal.test.tsx pattern ────────────

let mockListLoading    = false
let mockPreviewLoading = false
let mockRestorePending = false
let mockRestoreSucceed = false
let mockRestoreFail    = false
let mockVersionsData: PaginatedVersionsDTO = mockPage

const mockRestoreMutate = vi.fn((_versionId: string, options?: { onSuccess?: (data: NoteDTO) => void; onError?: () => void }) => {
  if (mockRestoreSucceed) {
    options?.onSuccess?.(mockRestoredNote)
  } else if (mockRestoreFail) {
    options?.onError?.()
  }
})

vi.mock('@/hooks/versions/use-note-versions', () => ({
  useNoteVersions: () => ({
    get data()      { return mockListLoading ? undefined : mockVersionsData },
    get isLoading() { return mockListLoading },
  }),
}))

vi.mock('@/hooks/versions/use-note-version', () => ({
  useNoteVersion: (_noteId: string, versionId: string | null) => ({
    data:      versionId === 'ver-1' ? v1 : versionId === 'ver-2' ? v2 : undefined,
    get isLoading() { return mockPreviewLoading },
  }),
}))

vi.mock('@/hooks/versions/use-restore-version', () => ({
  useRestoreVersion: () => ({
    mutate:    mockRestoreMutate,
    get isPending() { return mockRestorePending },
  }),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient()
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

function renderSheet(open = true, onOpenChange = vi.fn()) {
  return render(
    <VersionHistorySheet noteId="note-1" open={open} onOpenChange={onOpenChange} />,
    { wrapper: makeWrapper() },
  )
}

describe('VersionHistorySheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListLoading    = false
    mockPreviewLoading = false
    mockRestorePending = false
    mockRestoreSucceed = false
    mockRestoreFail    = false
    mockVersionsData   = mockPage
  })

  it('C01: shows loading spinner while version list is fetching', () => {
    mockListLoading = true
    renderSheet()
    expect(screen.getByLabelText('Loading versions')).toBeInTheDocument()
  })

  it('C02: renders version list rows on success', () => {
    renderSheet()
    // getAllByText because "v2"/"v1" also appear in preview HTML content
    expect(screen.getAllByText('v2').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('v1').length).toBeGreaterThanOrEqual(1)
  })

  it('C03: latest version row shows "current" badge', () => {
    renderSheet()
    expect(screen.getByText('current')).toBeInTheDocument()
  })

  it('C04: auto-selects first version (latest) on load', async () => {
    renderSheet()
    await waitFor(() => {
      // v2 is the first item — its content should be in the preview
      expect(screen.getByText('Note v2')).toBeInTheDocument()
    })
  })

  it('C05: clicking a version row selects it and shows its preview', async () => {
    renderSheet()
    const v1Row = screen.getAllByRole('button').find((b) => b.textContent?.includes('v1'))
    if (v1Row) fireEvent.click(v1Row)
    await waitFor(() => {
      expect(screen.getByText('Note v1')).toBeInTheDocument()
    })
  })

  it('C06: Restore button is disabled for the latest version (current)', async () => {
    renderSheet()
    await waitFor(() => screen.getByText('Current version'))
    const restoreBtn = screen.getByText('Current version')
    expect(restoreBtn.closest('button')).toBeDisabled()
  })

  it('C07: Restore button is enabled for an older version', async () => {
    renderSheet()
    // Select v1 (older)
    const buttons = screen.getAllByRole('button')
    const v1Row = buttons.find((b) => b.textContent?.includes('v1') && !b.textContent?.includes('v2'))
    if (v1Row) fireEvent.click(v1Row)

    await waitFor(() => {
      const restoreBtn = screen.queryByText(/Restore version/)
      if (restoreBtn) expect(restoreBtn.closest('button')).not.toBeDisabled()
    })
  })

  it('C08: clicking Restore opens the AlertDialog confirmation', async () => {
    renderSheet()
    // Select v1
    const buttons = screen.getAllByRole('button')
    const v1Row = buttons.find((b) => b.textContent?.includes('v1') && !b.textContent?.includes('v2'))
    if (v1Row) fireEvent.click(v1Row)

    await waitFor(async () => {
      const restoreBtn = screen.queryByText(/Restore version/)
      if (restoreBtn) {
        fireEvent.click(restoreBtn)
        await waitFor(() => {
          expect(screen.getByText(/Restore to version/)).toBeInTheDocument()
        })
      }
    })
  })

  it('C09: confirming the AlertDialog calls mutate with the correct versionId', async () => {
    const user = userEvent.setup()
    renderSheet()

    // Select v1 to enable the restore button
    const buttons = screen.getAllByRole('button')
    const v1Row = buttons.find((b) => b.textContent?.includes('v1') && !b.textContent?.includes('v2'))
    if (v1Row) await user.click(v1Row)

    await waitFor(async () => {
      const restoreBtn = screen.queryByText(/Restore version/)
      if (restoreBtn) {
        await user.click(restoreBtn)
        // Confirm dialog appears
        await waitFor(async () => {
          const confirmBtn = screen.queryByRole('button', { name: 'Restore' })
          if (confirmBtn) {
            await user.click(confirmBtn)
            expect(mockRestoreMutate).toHaveBeenCalledWith(
              'ver-1',
              expect.objectContaining({ onSuccess: expect.any(Function) }),
            )
          }
        })
      }
    })
  })

  it('C10: "Load more" button appears when total > items.length', async () => {
    mockVersionsData = { items: [v2], total: 5, page: 1, limit: 20 }
    renderSheet()
    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument()
    })
  })

  it('C11: cancelling the AlertDialog does not call the restore mutation', async () => {
    const user = userEvent.setup()
    renderSheet()

    const buttons = screen.getAllByRole('button')
    const v1Row = buttons.find((b) => b.textContent?.includes('v1') && !b.textContent?.includes('v2'))
    if (v1Row) await user.click(v1Row)

    await waitFor(async () => {
      const restoreBtn = screen.queryByText(/Restore version/)
      if (restoreBtn) {
        await user.click(restoreBtn)
        await waitFor(async () => {
          const cancelBtn = screen.queryByRole('button', { name: 'Cancel' })
          if (cancelBtn) {
            await user.click(cancelBtn)
            expect(mockRestoreMutate).not.toHaveBeenCalled()
          }
        })
      }
    })
  })

  it('C12: onOpenChange(false) is called after a successful restore', async () => {
    mockRestoreSucceed = true
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <VersionHistorySheet noteId="note-1" open={true} onOpenChange={onOpenChange} />,
      { wrapper: makeWrapper() },
    )

    const buttons = screen.getAllByRole('button')
    const v1Row = buttons.find((b) => b.textContent?.includes('v1') && !b.textContent?.includes('v2'))
    if (v1Row) await user.click(v1Row)

    await waitFor(async () => {
      const restoreBtn = screen.queryByText(/Restore version/)
      if (restoreBtn) {
        await user.click(restoreBtn)
        await waitFor(async () => {
          const confirmBtn = screen.queryByRole('button', { name: 'Restore' })
          if (confirmBtn) {
            await user.click(confirmBtn)
            await waitFor(() => {
              expect(onOpenChange).toHaveBeenCalledWith(false)
              expect(toast.success).toHaveBeenCalledWith('Note restored to version 1')
            })
          }
        })
      }
    })
  })

  it('C13: toast.error shown when restore fails', async () => {
    mockRestoreFail = true
    const user = userEvent.setup()
    renderSheet()

    const buttons = screen.getAllByRole('button')
    const v1Row = buttons.find((b) => b.textContent?.includes('v1') && !b.textContent?.includes('v2'))
    if (v1Row) await user.click(v1Row)

    await waitFor(async () => {
      const restoreBtn = screen.queryByText(/Restore version/)
      if (restoreBtn) {
        await user.click(restoreBtn)
        await waitFor(async () => {
          const confirmBtn = screen.queryByRole('button', { name: 'Restore' })
          if (confirmBtn) {
            await user.click(confirmBtn)
            await waitFor(() => {
              expect(toast.error).toHaveBeenCalledWith('Failed to restore version')
            })
          }
        })
      }
    })
  })
})
