import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Note, Tag, NoteVersion } from '@prisma/client'

vi.mock('../repositories/note.repository', () => ({
  noteRepository: {
    create:                   vi.fn(),
    findById:                 vi.fn(),
    findByIdOnly:             vi.fn(),
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
    listByNoteId:        vi.fn(),
    findById:            vi.fn(),
  },
}))

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    tag: { count: vi.fn() },
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
    content:   '<p>Hello</p>',
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
    content:       '<p>Hello</p>',
    versionNumber: 1,
    createdAt:     NOW,
    ...overrides,
  }
}

beforeEach(() => { vi.clearAllMocks() })

// ─── listVersions ─────────────────────────────────────────────────────────────

describe('noteService.listVersions', () => {
  it('S01: throws NotFoundError when note does not exist', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)
    vi.mocked(noteRepository.findByIdOnly).mockResolvedValue(null)

    await expect(noteService.listVersions('user-1', 'note-1', 1, 20))
      .rejects.toBeInstanceOf(NotFoundError)
  })

  it('S10: throws ForbiddenError when note belongs to a different user', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)
    vi.mocked(noteRepository.findByIdOnly).mockResolvedValue(makeNote())

    await expect(noteService.listVersions('user-1', 'note-1', 1, 20))
      .rejects.toBeInstanceOf(ForbiddenError)
  })

  it('S02: returns PaginatedVersionsDTO on success', async () => {
    const note    = makeNote()
    const version = makeVersion()
    vi.mocked(noteRepository.findById).mockResolvedValue(note)
    vi.mocked(noteVersionRepository.listByNoteId).mockResolvedValue({
      items: [version],
      total: 1,
    })

    const result = await noteService.listVersions('user-1', 'note-1', 1, 20)

    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('ver-1')
    expect(result.items[0].createdAt).toBe(NOW.toISOString())
  })
})

// ─── getVersion ───────────────────────────────────────────────────────────────

describe('noteService.getVersion', () => {
  it('S03: throws NotFoundError when note does not exist', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)
    vi.mocked(noteRepository.findByIdOnly).mockResolvedValue(null)

    await expect(noteService.getVersion('user-1', 'note-1', 'ver-1'))
      .rejects.toBeInstanceOf(NotFoundError)
  })

  it('S11: throws ForbiddenError when note belongs to a different user', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)
    vi.mocked(noteRepository.findByIdOnly).mockResolvedValue(makeNote())

    await expect(noteService.getVersion('user-1', 'note-1', 'ver-1'))
      .rejects.toBeInstanceOf(ForbiddenError)
  })

  it('S04: throws NotFoundError when version not found', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote())
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(null)

    await expect(noteService.getVersion('user-1', 'note-1', 'ver-999'))
      .rejects.toBeInstanceOf(NotFoundError)
  })

  it('S05: returns NoteVersionDTO on success', async () => {
    const version = makeVersion()
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote())
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(version)

    const result = await noteService.getVersion('user-1', 'note-1', 'ver-1')

    expect(result.id).toBe('ver-1')
    expect(result.versionNumber).toBe(1)
    expect(result.createdAt).toBe(NOW.toISOString())
  })
})

// ─── restoreVersion ───────────────────────────────────────────────────────────

describe('noteService.restoreVersion', () => {
  it('S06: throws NotFoundError when note does not exist', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)
    vi.mocked(noteRepository.findByIdOnly).mockResolvedValue(null)

    await expect(noteService.restoreVersion('user-1', 'note-1', 'ver-1'))
      .rejects.toBeInstanceOf(NotFoundError)
  })

  it('S12: throws ForbiddenError when note belongs to a different user', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)
    vi.mocked(noteRepository.findByIdOnly).mockResolvedValue(makeNote())

    await expect(noteService.restoreVersion('user-1', 'note-1', 'ver-1'))
      .rejects.toBeInstanceOf(ForbiddenError)
  })

  it('S07: throws NotFoundError when version not found', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote())
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(null)

    await expect(noteService.restoreVersion('user-1', 'note-1', 'ver-999'))
      .rejects.toBeInstanceOf(NotFoundError)
  })

  it('S08: calls noteRepository.update + getNextVersionNumber + noteVersionRepository.create in transaction', async () => {
    const note    = makeNote()
    const version = makeVersion({ title: 'Old Title', content: '<p>Old</p>', versionNumber: 1 })
    const updated = makeNote({ title: 'Old Title', content: '<p>Old</p>', updatedAt: new Date() })

    vi.mocked(noteRepository.findById).mockResolvedValue(note)
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(version)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      vi.mocked(noteRepository.update).mockResolvedValue(updated)
      vi.mocked(noteVersionRepository.getNextVersionNumber).mockResolvedValue(2)
      vi.mocked(noteVersionRepository.create).mockResolvedValue(makeVersion({ versionNumber: 2 }))
      return fn({} as never)
    })

    await noteService.restoreVersion('user-1', 'note-1', 'ver-1')

    expect(noteRepository.update).toHaveBeenCalledWith(
      'note-1',
      { title: 'Old Title', content: '<p>Old</p>' },
      expect.anything(),
    )
    expect(noteVersionRepository.getNextVersionNumber).toHaveBeenCalledWith('note-1', expect.anything())
    expect(noteVersionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: 'note-1', versionNumber: 2 }),
      expect.anything(),
    )
  })

  it('S13: restoreVersion does not pass tagIds to update and returned DTO preserves existing tags', async () => {
    const existingTag = { id: 'tag-1', userId: 'user-1', name: 'Work', color: '#000', createdAt: NOW }
    const note    = makeNote({ tags: [existingTag] })
    const version = makeVersion({ title: 'Old Title', content: '<p>Old</p>' })
    const updated = makeNote({ title: 'Old Title', content: '<p>Old</p>', tags: [existingTag] })

    vi.mocked(noteRepository.findById).mockResolvedValue(note)
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(version)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      vi.mocked(noteRepository.update).mockResolvedValue(updated)
      vi.mocked(noteVersionRepository.getNextVersionNumber).mockResolvedValue(2)
      vi.mocked(noteVersionRepository.create).mockResolvedValue(makeVersion({ versionNumber: 2 }))
      return fn({} as never)
    })

    const result = await noteService.restoreVersion('user-1', 'note-1', 'ver-1')

    const updateCall = vi.mocked(noteRepository.update).mock.calls[0][1]
    expect(updateCall).not.toHaveProperty('tagIds')
    expect(updateCall).toMatchObject({ title: 'Old Title', content: '<p>Old</p>' })
    expect(result.tags).toHaveLength(1)
    expect(result.tags[0].id).toBe('tag-1')
  })

  it('S09: returns NoteDTO of the restored note', async () => {
    const note    = makeNote()
    const version = makeVersion()
    const updated = makeNote({ title: 'Test Note', content: '<p>Hello</p>' })

    vi.mocked(noteRepository.findById).mockResolvedValue(note)
    vi.mocked(noteVersionRepository.findById).mockResolvedValue(version)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      vi.mocked(noteRepository.update).mockResolvedValue(updated)
      vi.mocked(noteVersionRepository.getNextVersionNumber).mockResolvedValue(2)
      vi.mocked(noteVersionRepository.create).mockResolvedValue(makeVersion({ versionNumber: 2 }))
      return fn({} as never)
    })

    const result = await noteService.restoreVersion('user-1', 'note-1', 'ver-1')

    expect(result.id).toBe('note-1')
    expect(result.title).toBe('Test Note')
    expect(result.tags).toEqual([])
  })
})
