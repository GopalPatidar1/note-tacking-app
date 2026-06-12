import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Note, NoteVersion, Tag } from '@prisma/client'

vi.mock('../repositories/note.repository', () => ({
  noteRepository: {
    findById: vi.fn(),
    update:   vi.fn(),
  },
}))

vi.mock('../repositories/note-version.repository', () => ({
  noteVersionRepository: {
    findAll:              vi.fn(),
    findById:             vi.fn(),
    getNextVersionNumber: vi.fn(),
    create:               vi.fn(),
    deleteExcess:         vi.fn(),
  },
}))

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
}))

import { noteVersionService }       from '../services/note-version.service'
import { noteRepository }           from '../repositories/note.repository'
import { noteVersionRepository }    from '../repositories/note-version.repository'
import { NotFoundError }            from '../errors/domain-errors'

const NOW = new Date('2026-01-01T00:00:00.000Z')

function makeNote(overrides?: Partial<Note>): Note & { tags: Tag[] } {
  return {
    id:        'note-1',
    userId:    'user-1',
    title:     'Original title',
    content:   '<p>Original content</p>',
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    tags:      [],
    ...overrides,
  }
}

function makeVersion(overrides?: Partial<NoteVersion>): NoteVersion {
  return {
    id:            'version-1',
    noteId:        'note-1',
    title:         'Version title',
    content:       '<p>Version content</p>',
    versionNumber: 1,
    createdAt:     NOW,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── list ────────────────────────────────────────────────────────────────────

describe('noteVersionService.list', () => {
  it('U01: returns PaginatedVersionsDTO with correct shape', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(noteVersionRepository.findAll).mockResolvedValue({
      items: [makeVersion(), makeVersion({ id: 'version-2', versionNumber: 2 })],
      total: 2,
    })

    const result = await noteVersionService.list('user-1', 'note-1', { page: 1, limit: 20 })

    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      id:            'version-1',
      noteId:        'note-1',
      versionNumber: 1,
      createdAt:     NOW.toISOString(),
    })
  })

  it('U02: throws NotFoundError when note not found', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)

    await expect(noteVersionService.list('user-1', 'bad-note', { page: 1, limit: 20 }))
      .rejects.toThrow(NotFoundError)
  })

  it('U03: throws NotFoundError when note is soft-deleted (findById returns null)', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)

    await expect(noteVersionService.list('user-1', 'note-1', { page: 1, limit: 20 }))
      .rejects.toThrow(NotFoundError)
  })

  it('U04: returns empty items array when no versions exist', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(noteVersionRepository.findAll).mockResolvedValue({ items: [], total: 0 })

    const result = await noteVersionService.list('user-1', 'note-1', { page: 1, limit: 20 })

    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })
})

// ─── getById ─────────────────────────────────────────────────────────────────

describe('noteVersionService.getById', () => {
  it('U05: returns NoteVersionDTO for valid note + version', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(makeVersion())

    const result = await noteVersionService.getById('user-1', 'note-1', 'version-1')

    expect(result.id).toBe('version-1')
    expect(result.noteId).toBe('note-1')
    expect(result.title).toBe('Version title')
    expect(result.content).toBe('<p>Version content</p>')
    expect(result.versionNumber).toBe(1)
    expect(result.createdAt).toBe(NOW.toISOString())
  })

  it('U06: throws NotFoundError when note not found', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)

    await expect(noteVersionService.getById('user-1', 'bad-note', 'version-1'))
      .rejects.toThrow(NotFoundError)
  })

  it('U07: throws NotFoundError when version not found', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(null)

    await expect(noteVersionService.getById('user-1', 'note-1', 'bad-version'))
      .rejects.toThrow(NotFoundError)
  })

  it('U08: throws NotFoundError when version exists on a different note', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    // findById scopes by noteId — returns null when note does not match
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(null)

    await expect(noteVersionService.getById('user-1', 'note-1', 'version-from-other-note'))
      .rejects.toThrow(NotFoundError)
  })
})

// ─── restore ─────────────────────────────────────────────────────────────────

describe('noteVersionService.restore', () => {
  it('U09: calls noteRepository.update + noteVersionRepository.create in transaction', async () => {
    const version = makeVersion({ title: 'Old title', content: '<p>Old</p>' })
    const updatedNote = makeNote({ title: 'Old title', content: '<p>Old</p>' })

    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(version)
    vi.mocked(noteRepository.update).mockResolvedValue(updatedNote as never)
    vi.mocked(noteVersionRepository.getNextVersionNumber).mockResolvedValue(3)
    vi.mocked(noteVersionRepository.create).mockResolvedValue(makeVersion({ versionNumber: 3 }))

    await noteVersionService.restore('user-1', 'note-1', 'version-1')

    expect(noteRepository.update).toHaveBeenCalledWith(
      'note-1',
      { title: 'Old title', content: '<p>Old</p>' },
      expect.anything(),
    )
    expect(noteVersionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: 'note-1', title: 'Old title', content: '<p>Old</p>', versionNumber: 3 }),
      expect.anything(),
    )
  })

  it('U10: returns NoteDTO reflecting restored title and content', async () => {
    const version = makeVersion({ title: 'Restored title', content: '<p>Restored</p>' })
    const updatedNote = makeNote({ title: 'Restored title', content: '<p>Restored</p>' })

    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(version)
    vi.mocked(noteRepository.update).mockResolvedValue(updatedNote as never)
    vi.mocked(noteVersionRepository.getNextVersionNumber).mockResolvedValue(2)
    vi.mocked(noteVersionRepository.create).mockResolvedValue(makeVersion({ versionNumber: 2 }))

    const result = await noteVersionService.restore('user-1', 'note-1', 'version-1')

    expect(result.title).toBe('Restored title')
    expect(result.content).toBe('<p>Restored</p>')
    expect(result.id).toBe('note-1')
    expect(result.userId).toBe('user-1')
  })

  it('U11: throws NotFoundError when note not found', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)

    await expect(noteVersionService.restore('user-1', 'bad-note', 'version-1'))
      .rejects.toThrow(NotFoundError)
  })

  it('U12: throws NotFoundError when version not found', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(null)

    await expect(noteVersionService.restore('user-1', 'note-1', 'bad-version'))
      .rejects.toThrow(NotFoundError)
  })

  it('U13: calls deleteExcess after restore', async () => {
    const version     = makeVersion({ title: 'Old title', content: '<p>Old</p>' })
    const updatedNote = makeNote({ title: 'Old title', content: '<p>Old</p>' })

    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(version)
    vi.mocked(noteRepository.update).mockResolvedValue(updatedNote as never)
    vi.mocked(noteVersionRepository.getNextVersionNumber).mockResolvedValue(3)
    vi.mocked(noteVersionRepository.create).mockResolvedValue(makeVersion({ versionNumber: 3 }))
    vi.mocked(noteVersionRepository.deleteExcess).mockResolvedValue()

    await noteVersionService.restore('user-1', 'note-1', 'version-1')

    expect(noteVersionRepository.deleteExcess).toHaveBeenCalledWith('note-1', 50)
  })
})
