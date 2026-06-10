import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Note, Tag, NoteVersion } from '@prisma/client'

vi.mock('../repositories/note.repository', () => ({
  noteRepository: {
    create:                   vi.fn(),
    findById:                 vi.fn(),
    findByIdIncludingDeleted: vi.fn(),
    findAll:                  vi.fn(),
    update:                   vi.fn(),
    softDelete:               vi.fn(),
  },
}))

vi.mock('../repositories/note-version.repository', () => ({
  noteVersionRepository: {
    getNextVersionNumber: vi.fn(),
    create:              vi.fn(),
  },
}))

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    tag:          { count: vi.fn() },
  },
}))

import { noteService } from '../services/note.service'
import { noteRepository } from '../repositories/note.repository'
import { noteVersionRepository } from '../repositories/note-version.repository'
import { prisma } from '../lib/prisma'
import { NotFoundError, ForbiddenError } from '../errors/domain-errors'

const NOW = new Date('2024-01-01T00:00:00.000Z')

function makeNote(overrides?: Partial<Note & { tags: Tag[] }>): Note & { tags: Tag[] } {
  return {
    id:        'note-1',
    userId:    'user-1',
    title:     'Test Note',
    content:   'Some content',
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    tags:      [],
    ...overrides,
  }
}

function makeVersion(overrides?: Partial<NoteVersion>): NoteVersion {
  return {
    id:            'ver-1',
    noteId:        'note-1',
    title:         'Test Note',
    content:       'Some content',
    versionNumber: 1,
    createdAt:     NOW,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── U01 — create: success ────────────────────────────────────────────────────
describe('noteService.create', () => {
  it('U01: calls noteRepository.create + noteVersionRepository.create in a transaction', async () => {
    const note = makeNote()
    vi.mocked(prisma.tag.count).mockResolvedValue(0)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      vi.mocked(noteRepository.create).mockResolvedValue(note)
      vi.mocked(noteVersionRepository.getNextVersionNumber).mockResolvedValue(1)
      vi.mocked(noteVersionRepository.create).mockResolvedValue(makeVersion())
      return fn({} as never)
    })

    const result = await noteService.create('user-1', { title: 'Test Note', content: 'Some content', tagIds: [] })

    expect(result.id).toBe('note-1')
    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })

  // ─── U02 — create: tag IDOR ────────────────────────────────────────────────
  it('U02: throws ForbiddenError when tagId does not belong to user', async () => {
    vi.mocked(prisma.tag.count).mockResolvedValue(0)

    await expect(
      noteService.create('user-1', { title: 'T', content: 'C', tagIds: ['tag-other'] }),
    ).rejects.toThrow(ForbiddenError)
  })

  // ─── U03 — create: no tagIds skips ownership check ────────────────────────
  it('U03: no tagIds — skips ownership check, still creates version', async () => {
    const note = makeNote()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      vi.mocked(noteRepository.create).mockResolvedValue(note)
      vi.mocked(noteVersionRepository.getNextVersionNumber).mockResolvedValue(1)
      vi.mocked(noteVersionRepository.create).mockResolvedValue(makeVersion())
      return fn({} as never)
    })

    const result = await noteService.create('user-1', { title: 'T', content: 'C', tagIds: [] })

    expect(prisma.tag.count).not.toHaveBeenCalled()
    expect(result.id).toBe('note-1')
  })
})

// ─── U04 — list ───────────────────────────────────────────────────────────────
describe('noteService.list', () => {
  it('U04: returns paginated result from repository', async () => {
    const note = makeNote()
    vi.mocked(noteRepository.findAll).mockResolvedValue({ items: [note], total: 1 })

    const result = await noteService.list('user-1', {
      page: 1, limit: 20, sort: 'updatedAt_desc',
    })

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
  })
})

// ─── U05 / U06 — getById ──────────────────────────────────────────────────────
describe('noteService.getById', () => {
  it('U05: returns note when found and userId matches', async () => {
    const note = makeNote()
    vi.mocked(noteRepository.findById).mockResolvedValue(note)

    const result = await noteService.getById('user-1', 'note-1')
    expect(result.id).toBe('note-1')
  })

  it('U06: throws NotFoundError when note is null', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)

    await expect(noteService.getById('user-1', 'note-x')).rejects.toThrow(NotFoundError)
  })
})

// ─── U07–U09 — update ─────────────────────────────────────────────────────────
describe('noteService.update', () => {
  it('U07: success — updates note and creates new version snapshot', async () => {
    const existing = makeNote()
    const updated  = makeNote({ title: 'Updated' })
    vi.mocked(noteRepository.findById).mockResolvedValue(existing)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      vi.mocked(noteRepository.update).mockResolvedValue(updated)
      vi.mocked(noteVersionRepository.getNextVersionNumber).mockResolvedValue(2)
      vi.mocked(noteVersionRepository.create).mockResolvedValue(makeVersion({ versionNumber: 2 }))
      return fn({} as never)
    })

    const result = await noteService.update('user-1', 'note-1', { title: 'Updated' })
    expect(result.title).toBe('Updated')
    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })

  it('U08: throws NotFoundError when note not found', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)

    await expect(noteService.update('user-1', 'note-x', { title: 'X' })).rejects.toThrow(NotFoundError)
  })

  it('U09: throws ForbiddenError on tagId ownership violation', async () => {
    const existing = makeNote()
    vi.mocked(noteRepository.findById).mockResolvedValue(existing)
    vi.mocked(prisma.tag.count).mockResolvedValue(0)

    await expect(
      noteService.update('user-1', 'note-1', { tagIds: ['tag-other'] }),
    ).rejects.toThrow(ForbiddenError)
  })
})

// ─── U10–U12 — delete ─────────────────────────────────────────────────────────
describe('noteService.delete', () => {
  it('U10: success — calls noteRepository.softDelete', async () => {
    const note = makeNote()
    vi.mocked(noteRepository.findByIdIncludingDeleted).mockResolvedValue(note)
    vi.mocked(noteRepository.softDelete).mockResolvedValue({ ...note, deletedAt: new Date() })

    await noteService.delete('user-1', 'note-1')
    expect(noteRepository.softDelete).toHaveBeenCalledWith('note-1')
  })

  it('U11: already soft-deleted — returns without error (idempotent)', async () => {
    const note = makeNote({ deletedAt: new Date() })
    vi.mocked(noteRepository.findByIdIncludingDeleted).mockResolvedValue(note)

    await expect(noteService.delete('user-1', 'note-1')).resolves.toBeUndefined()
    expect(noteRepository.softDelete).not.toHaveBeenCalled()
  })

  it('U12: note not found — throws NotFoundError', async () => {
    vi.mocked(noteRepository.findByIdIncludingDeleted).mockResolvedValue(null)

    await expect(noteService.delete('user-1', 'note-x')).rejects.toThrow(NotFoundError)
  })
})
