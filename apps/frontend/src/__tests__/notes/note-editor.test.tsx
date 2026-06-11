import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { NoteEditorPage } from '@/pages/notes/note-editor.page'
import type { NoteDTO, TagDTO } from '@note-app/shared'

vi.mock('@/lib/http', () => ({
  http: {
    get:   vi.fn(),
    post:  vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('@tiptap/react', async () => {
  const actual = await vi.importActual<typeof import('@tiptap/react')>('@tiptap/react')
  return {
    ...actual,
    useEditor: () => ({
      chain: () => ({ focus: () => ({ toggleBold: () => ({ run: vi.fn() }), toggleItalic: () => ({ run: vi.fn() }), toggleStrike: () => ({ run: vi.fn() }), toggleCode: () => ({ run: vi.fn() }), toggleHeading: () => ({ run: vi.fn() }), toggleBulletList: () => ({ run: vi.fn() }), toggleOrderedList: () => ({ run: vi.fn() }) }) }),
      isActive: () => false,
      getHTML: () => '<p></p>',
      destroy: vi.fn(),
    }),
    EditorContent: ({ editor: _editor }: { editor: unknown }) =>
      createElement('div', { 'data-testid': 'tiptap-editor' }),
  }
})

import { http } from '@/lib/http'

const mockNote: NoteDTO = {
  id: 'note-1',
  userId: 'user-1',
  title: 'Existing Note',
  content: '<p>Existing content</p>',
  tags: [{ id: 'tag-1', userId: 'user-1', name: 'Work', color: '#3B82F6' }],
  deletedAt: null,
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T10:00:00Z',
}

const mockTags: TagDTO[] = [
  { id: 'tag-1', userId: 'user-1', name: 'Work', color: '#3B82F6' },
  { id: 'tag-2', userId: 'user-1', name: 'Personal', color: '#10B981' },
]

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries:   { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderEditor(path: string, initialEntries: string[]) {
  const queryClient = makeClient()
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        { initialEntries },
        createElement(
          Routes,
          null,
          createElement(Route, { path, element: createElement(NoteEditorPage) })
        )
      )
    )
  )
}

describe('NoteEditorPage — create mode (/notes/new)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(http.get).mockResolvedValue({ data: { data: [] } })
  })

  it('renders the title input and Create Note button', async () => {
    renderEditor('/notes/new', ['/notes/new'])
    expect(screen.getByRole('textbox', { name: /note title/i })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create note/i })).toBeInTheDocument()
    )
  })

  it('Create Note button is disabled when title is empty', async () => {
    renderEditor('/notes/new', ['/notes/new'])
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create note/i })).toBeDisabled()
    })
  })

  it('Create Note button is enabled after typing a title', async () => {
    const user = userEvent.setup()
    renderEditor('/notes/new', ['/notes/new'])

    const titleInput = screen.getByRole('textbox', { name: /note title/i })
    await user.type(titleInput, 'My new note')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create note/i })).not.toBeDisabled()
    )
  })

  it('calls POST /notes when Create Note is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(http.post).mockResolvedValue({ data: { data: mockNote } })
    vi.mocked(http.get).mockResolvedValue({ data: { data: [] } })

    renderEditor('/notes/new', ['/notes/new'])

    const titleInput = screen.getByRole('textbox', { name: /note title/i })
    await user.type(titleInput, 'My new note')

    const createBtn = await screen.findByRole('button', { name: /create note/i })
    await user.click(createBtn)

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/notes', expect.objectContaining({ title: 'My new note' }))
    )
  })

  it('navigates to /notes/:id after successful creation', async () => {
    const user = userEvent.setup()
    vi.mocked(http.post).mockResolvedValue({ data: { data: mockNote } })
    vi.mocked(http.get).mockImplementation((url: string) => {
      if (url === '/notes/note-1') return Promise.resolve({ data: { data: mockNote } })
      return Promise.resolve({ data: { data: [] } })
    })

    // Render with both /notes/new and /notes/:id routes so redirect can resolve
    const queryClient = makeClient()
    render(
      createElement(QueryClientProvider, { client: queryClient },
        createElement(MemoryRouter, { initialEntries: ['/notes/new'] },
          createElement(Routes, null,
            createElement(Route, { path: '/notes/new', element: createElement(NoteEditorPage) }),
            createElement(Route, { path: '/notes/:id', element: createElement('div', { 'data-testid': 'editor-page' }, 'editor loaded') })
          )
        )
      )
    )

    const titleInput = screen.getByRole('textbox', { name: /note title/i })
    await user.type(titleInput, 'My new note')

    const createBtn = await screen.findByRole('button', { name: /create note/i })
    await user.click(createBtn)

    await waitFor(() =>
      expect(screen.getByTestId('editor-page')).toBeInTheDocument()
    )
  })
})

describe('NoteEditorPage — edit mode (/notes/:id)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(http.get).mockImplementation((url: string) => {
      if (url === '/notes/note-1') return Promise.resolve({ data: { data: mockNote } })
      if (url === '/tags')        return Promise.resolve({ data: { data: mockTags } })
      return Promise.reject(new Error(`Unexpected GET: ${url}`))
    })
  })

  it('shows loading spinner before note loads', () => {
    vi.mocked(http.get).mockReturnValue(new Promise(() => {}))
    renderEditor('/notes/:id', ['/notes/note-1'])
    expect(screen.getByLabelText(/loading note/i)).toBeInTheDocument()
  })

  it('populates title from fetched note', async () => {
    renderEditor('/notes/:id', ['/notes/note-1'])

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /note title/i })).toHaveValue('Existing Note')
    )
  })

  it('renders the TipTap editor area', async () => {
    renderEditor('/notes/:id', ['/notes/note-1'])
    await waitFor(() => expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument())
  })

  it('renders tag selector with all available tags', async () => {
    renderEditor('/notes/:id', ['/notes/note-1'])
    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })
  })

  it('shows "Unsaved changes" after editing the title', async () => {
    const user = userEvent.setup()
    renderEditor('/notes/:id', ['/notes/note-1'])

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /note title/i })).toHaveValue('Existing Note')
    )

    await user.type(screen.getByRole('textbox', { name: /note title/i }), ' edited')
    await waitFor(() => expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument())
  })

  it('calls PATCH /notes/:id after debounce delay', async () => {
    vi.mocked(http.patch).mockResolvedValue({ data: { data: mockNote } })

    renderEditor('/notes/:id', ['/notes/note-1'])

    // Wait for data to load with real timers so waitFor works correctly
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /note title/i })).toHaveValue('Existing Note')
    )

    // Enable fake timers AFTER data load — avoids waitFor deadlock
    vi.useFakeTimers()

    fireEvent.change(screen.getByRole('textbox', { name: /note title/i }), {
      target: { value: 'Existing Note edited' },
    })

    // Advance past the 1500ms debounce
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(http.patch).toHaveBeenCalledWith('/notes/note-1', expect.any(Object))

    vi.useRealTimers()
  })

  it('shows "Saved" after a successful autosave', async () => {
    vi.mocked(http.patch).mockResolvedValue({ data: { data: mockNote } })

    renderEditor('/notes/:id', ['/notes/note-1'])

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /note title/i })).toHaveValue('Existing Note')
    )

    vi.useFakeTimers()

    fireEvent.change(screen.getByRole('textbox', { name: /note title/i }), {
      target: { value: 'Existing Note edited' },
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(screen.getByText(/^saved$/i)).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows "Save failed" on autosave error', async () => {
    vi.mocked(http.patch).mockRejectedValue(new Error('Network error'))

    renderEditor('/notes/:id', ['/notes/note-1'])

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /note title/i })).toHaveValue('Existing Note')
    )

    vi.useFakeTimers()

    fireEvent.change(screen.getByRole('textbox', { name: /note title/i }), {
      target: { value: 'Existing Note edited' },
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })

    expect(screen.getByText(/save failed/i)).toBeInTheDocument()

    vi.useRealTimers()
  })
})
