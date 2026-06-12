import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { createElement } from 'react'
import { ShareModal } from '@/components/sharing/share-modal'
import type { ShareLinkResponseDTO } from '@note-app/shared'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockLink: ShareLinkResponseDTO = {
  id:        'link-1',
  noteId:    'note-1',
  token:     'abc123token',
  expiresAt: null,
  revokedAt: null,
  viewCount: 0,
  createdAt: '2026-06-12T10:00:00Z',
}

const mockCreateMutateAsync = vi.fn()
const mockRevokeMutateAsync = vi.fn()

// Mutable flags — lets per-test overrides control what the hook returns
let mockCreatePending = false
let mockCreateError   = false
let mockRevokePending = false

vi.mock('@/hooks/sharing/use-create-share-link', () => ({
  useCreateShareLink: () => ({
    mutateAsync: mockCreateMutateAsync,
    get isPending() { return mockCreatePending },
    get isError()   { return mockCreateError },
  }),
}))

vi.mock('@/hooks/sharing/use-revoke-share-link', () => ({
  useRevokeShareLink: () => ({
    mutateAsync: mockRevokeMutateAsync,
    get isPending() { return mockRevokePending },
  }),
}))

// Clipboard stub: const object so the getter always returns the same reference.
// In beforeEach we REPLACE the writeText property (not the variable), which
// avoids any module-closure staleness in Vitest's transformed output.
const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }

beforeAll(() => {
  Object.defineProperty(Navigator.prototype, 'clipboard', {
    get: () => clipboard,
    configurable: true,
  })
})

function makeWrapper() {
  const queryClient = new QueryClient()
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

function renderModal(props?: Partial<{ noteId: string; open: boolean; onOpenChange: () => void }>) {
  const onOpenChange = vi.fn()
  const result = render(
    <ShareModal
      noteId={props?.noteId ?? 'note-1'}
      open={props?.open ?? true}
      onOpenChange={props?.onOpenChange ?? onOpenChange}
    />,
    { wrapper: makeWrapper() },
  )
  return { onOpenChange, ...result }
}

describe('ShareModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Replace with a fresh spy after the clear so this test gets a clean slate
    clipboard.writeText = vi.fn().mockResolvedValue(undefined)
    mockCreatePending = false
    mockCreateError   = false
    mockRevokePending = false
  })

  // T-12a
  it('renders all four expiry radio labels', () => {
    renderModal()
    expect(screen.getByLabelText('No expiry')).toBeInTheDocument()
    expect(screen.getByLabelText('1 day')).toBeInTheDocument()
    expect(screen.getByLabelText('7 days')).toBeInTheDocument()
    expect(screen.getByLabelText('30 days')).toBeInTheDocument()
  })

  // T-12b
  it('renders "Generate Link" button enabled by default', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /generate link/i })).toBeEnabled()
  })

  // T-12c
  it('shows "No links generated yet." when links list is empty', () => {
    renderModal()
    expect(screen.getByText(/no links generated yet/i)).toBeInTheDocument()
  })

  // T-12d
  it('shows the new link URL in the active-links list after successful generation', async () => {
    const user = userEvent.setup()
    mockCreateMutateAsync.mockResolvedValue(mockLink)
    renderModal()

    await user.click(screen.getByRole('button', { name: /generate link/i }))

    await waitFor(() => {
      expect(screen.getByText(/abc123token/)).toBeInTheDocument()
    })
  })

  // T-12e — the generated link URL contains /public/:token
  it('displays the correct public URL in the link row', async () => {
    const user = userEvent.setup()
    mockCreateMutateAsync.mockResolvedValue(mockLink)
    renderModal()

    await user.click(screen.getByRole('button', { name: /generate link/i }))
    await waitFor(() => screen.getByText(/abc123token/))

    // Dialog renders in a Portal — query document.body for the code element
    const code = document.body.querySelector('code')
    expect(code?.textContent).toContain('/public/abc123token')
  })

  // T-12f — clicking copy calls clipboard.writeText with the correct URL and shows toast
  it('calls clipboard.writeText with correct URL and shows success toast', async () => {
    const { toast } = await import('sonner')
    const user = userEvent.setup()
    mockCreateMutateAsync.mockResolvedValue(mockLink)
    renderModal()

    await user.click(screen.getByRole('button', { name: /generate link/i }))
    await waitFor(() => screen.getByText(/abc123token/))

    // fireEvent bypasses userEvent's async pointer-event scheduling, ensuring
    // the React onClick handler fires before we assert.
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }))

    // writeText is called synchronously; toast fires in the .then() microtask
    expect(clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/public/abc123token`,
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Link copied to clipboard'),
    )
  })

  // T-12g
  it('calls revokeShareLink mutation with the correct link ID', async () => {
    const user = userEvent.setup()
    mockCreateMutateAsync.mockResolvedValue(mockLink)
    mockRevokeMutateAsync.mockResolvedValue(undefined)
    renderModal()

    await user.click(screen.getByRole('button', { name: /generate link/i }))
    await waitFor(() => screen.getByRole('button', { name: /revoke/i }))

    await user.click(screen.getByRole('button', { name: /revoke/i }))

    await waitFor(() =>
      expect(mockRevokeMutateAsync).toHaveBeenCalledWith('link-1'),
    )
  })

  // T-12h
  it('removes the revoked link from the list on mutation success', async () => {
    const user = userEvent.setup()
    mockCreateMutateAsync.mockResolvedValue(mockLink)
    mockRevokeMutateAsync.mockResolvedValue(undefined)
    renderModal()

    await user.click(screen.getByRole('button', { name: /generate link/i }))
    await waitFor(() => screen.getByText(/abc123token/))

    await user.click(screen.getByRole('button', { name: /revoke/i }))

    await waitFor(() =>
      expect(screen.queryByText(/abc123token/)).not.toBeInTheDocument(),
    )
  })

  // T-12i — expiry badge shown in link row (two occurrences: the radio label + the link row badge)
  it('shows "No expiry" in the link row when link has no expiresAt', async () => {
    const user = userEvent.setup()
    mockCreateMutateAsync.mockResolvedValue(mockLink)
    renderModal()

    await user.click(screen.getByRole('button', { name: /generate link/i }))
    await waitFor(() => expect(screen.getAllByText(/no expiry/i).length).toBeGreaterThanOrEqual(2))

    // The first match is the radio label; the second is the link-row expiry badge
    const matches = screen.getAllByText(/no expiry/i)
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  // T-12j — generate button shows spinner and is disabled while mutation is pending
  it('shows spinner text and disables the Generate button while pending', () => {
    mockCreatePending = true
    renderModal()
    // Button label changes to "Generating…" and becomes disabled
    const btn = screen.getByRole('button', { name: /generating/i })
    expect(btn).toBeDisabled()
  })

  // T-12k — inline error message shown when generate mutation fails
  it('shows inline error message when generation fails', () => {
    mockCreateError = true
    renderModal()
    expect(screen.getByText(/failed to generate link/i)).toBeInTheDocument()
  })
})
