import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NoteVersion } from '@prisma/client'

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    noteVersion: {
      findMany: vi.fn(),
      count:    vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

import { noteVersionRepository } from '../repositories/note-version.repository'
import { prisma } from '../lib/prisma'

const NOW = new Date('2024-01-01T00:00:00.000Z')

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

// ─── listByNoteId ─────────────────────────────────────────────────────────────

describe('noteVersionRepository.listByNoteId', () => {
  it('R01: returns items with correct orderBy DESC and skip/take', async () => {
    const v1 = makeVersion({ versionNumber: 2, id: 'ver-2' })
    const v2 = makeVersion({ versionNumber: 1, id: 'ver-1' })
    vi.mocked(prisma.noteVersion.findMany).mockResolvedValue([v1, v2])
    vi.mocked(prisma.noteVersion.count).mockResolvedValue(2)

    const result = await noteVersionRepository.listByNoteId('note-1', { page: 1, limit: 20 })

    expect(prisma.noteVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where:   { noteId: 'note-1' },
        orderBy: { versionNumber: 'desc' },
        skip:    0,
        take:    20,
      }),
    )
    expect(result.items).toEqual([v1, v2])
  })

  it('R02: calculates correct skip for page 2', async () => {
    vi.mocked(prisma.noteVersion.findMany).mockResolvedValue([])
    vi.mocked(prisma.noteVersion.count).mockResolvedValue(5)

    await noteVersionRepository.listByNoteId('note-1', { page: 2, limit: 20 })

    expect(prisma.noteVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    )
  })

  it('R03: returns total from count', async () => {
    vi.mocked(prisma.noteVersion.findMany).mockResolvedValue([])
    vi.mocked(prisma.noteVersion.count).mockResolvedValue(7)

    const result = await noteVersionRepository.listByNoteId('note-1', { page: 1, limit: 20 })

    expect(prisma.noteVersion.count).toHaveBeenCalledWith({ where: { noteId: 'note-1' } })
    expect(result.total).toBe(7)
  })
})

// ─── findById ─────────────────────────────────────────────────────────────────

describe('noteVersionRepository.findById', () => {
  it('R04: returns version when id and noteId both match', async () => {
    const version = makeVersion()
    vi.mocked(prisma.noteVersion.findFirst).mockResolvedValue(version)

    const result = await noteVersionRepository.findById('ver-1', 'note-1')

    expect(prisma.noteVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'ver-1', noteId: 'note-1' },
    })
    expect(result).toEqual(version)
  })

  it('R05: returns null when noteId does not match (IDOR guard)', async () => {
    vi.mocked(prisma.noteVersion.findFirst).mockResolvedValue(null)

    const result = await noteVersionRepository.findById('ver-1', 'note-other')

    expect(prisma.noteVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'ver-1', noteId: 'note-other' },
    })
    expect(result).toBeNull()
  })
})
