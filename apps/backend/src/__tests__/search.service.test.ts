import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../repositories/search.repository', () => ({
  searchRepository: {
    search:           vi.fn(),
    findManyWithTags: vi.fn(),
  },
}))

import { searchService } from '../services/search.service'
import { searchRepository } from '../repositories/search.repository'
import { AppError } from '../errors/domain-errors'
import type { Note, Tag } from '@prisma/client'

const NOW = new Date('2024-01-01T00:00:00.000Z')

interface FtsRow {
  id:        string
  title:     string
  headline:  string
  rank:      number
  createdAt: Date
  updatedAt: Date
  total:     bigint
}

function makeFtsRow(overrides?: Partial<FtsRow>): FtsRow {
  return {
    id:        'note-1',
    title:     'Meeting notes',
    headline:  'Discussed <b>roadmap</b> with the team',
    rank:      0.5,
    createdAt: NOW,
    updatedAt: NOW,
    total:     BigInt(1),
    ...overrides,
  }
}

function makeNoteWithTags(overrides?: Partial<Note & { tags: Tag[] }>): Note & { tags: Tag[] } {
  return {
    id:        'note-1',
    userId:    'user-1',
    title:     'Meeting notes',
    content:   'Discussed roadmap',
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    tags:      [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('searchService.search', () => {
  it('U01: returns PaginatedSearchResultsDTO with correct shape for valid query', async () => {
    const row = makeFtsRow()
    vi.mocked(searchRepository.search).mockResolvedValue([row])
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([makeNoteWithTags()])

    const result = await searchService.search('user-1', { q: 'roadmap', page: 1, limit: 20 })

    expect(result.query).toBe('roadmap')
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id:       'note-1',
      title:    'Meeting notes',
      headline: 'Discussed <b>roadmap</b> with the team',
      tags:     [],
    })
    expect(result.items[0].createdAt).toBe(NOW.toISOString())
    expect(result.items[0].updatedAt).toBe(NOW.toISOString())
  })

  it('U02: returns empty result when FTS returns no rows', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([])

    const result = await searchService.search('user-1', { q: 'xyz', page: 1, limit: 20 })

    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20, query: 'xyz' })
    expect(searchRepository.findManyWithTags).not.toHaveBeenCalled()
  })

  it('U03: throws AppError(400, VALIDATION_ERROR) for whitespace-only query', async () => {
    await expect(
      searchService.search('user-1', { q: '   ', page: 1, limit: 20 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code:       'VALIDATION_ERROR',
    })
    expect(searchRepository.search).not.toHaveBeenCalled()
  })

  it('U04: converts bigint total to number correctly', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([makeFtsRow({ total: BigInt(42) })])
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([makeNoteWithTags()])

    const result = await searchService.search('user-1', { q: 'roadmap', page: 1, limit: 20 })

    expect(result.total).toBe(42)
    expect(typeof result.total).toBe('number')
  })

  it('U05: tags default to [] for noteId not present in tagMap', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([makeFtsRow({ id: 'note-999' })])
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([])

    const result = await searchService.search('user-1', { q: 'roadmap', page: 1, limit: 20 })

    expect(result.items[0].tags).toEqual([])
  })

  it('U06: items order matches FTS row order (rank preserved)', async () => {
    const rows: FtsRow[] = [
      makeFtsRow({ id: 'note-1', rank: 0.9, total: BigInt(2) }),
      makeFtsRow({ id: 'note-2', rank: 0.3, total: BigInt(2) }),
    ]
    vi.mocked(searchRepository.search).mockResolvedValue(rows)
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([
      makeNoteWithTags({ id: 'note-1' }),
      makeNoteWithTags({ id: 'note-2' }),
    ])

    const result = await searchService.search('user-1', { q: 'roadmap', page: 1, limit: 20 })

    expect(result.items[0].id).toBe('note-1')
    expect(result.items[1].id).toBe('note-2')
  })

  it('U07: findManyWithTags is NOT called when FTS returns no rows', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([])

    await searchService.search('user-1', { q: 'nothing', page: 1, limit: 20 })

    expect(searchRepository.findManyWithTags).not.toHaveBeenCalled()
  })

  it('U03b: throws AppError — not a generic Error — so instanceof check works', async () => {
    await expect(
      searchService.search('user-1', { q: '   ', page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(AppError)
  })
})
