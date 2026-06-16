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

interface KeywordRow {
  id:        string
  title:     string
  createdAt: Date
  updatedAt: Date
  total:     bigint
}

function makeKeywordRow(overrides?: Partial<KeywordRow>): KeywordRow {
  return {
    id:        'note-1',
    title:     'hello asad world',
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
    title:     'hello asad world',
    content:   'some content',
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
    const row = makeKeywordRow()
    vi.mocked(searchRepository.search).mockResolvedValue([row])
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([makeNoteWithTags()])

    const result = await searchService.search('user-1', { q: 'asad', page: 1, limit: 20 })

    expect(result.query).toBe('asad')
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id:       'note-1',
      title:    'hello asad world',
      headline: 'hello <b>asad</b> world',
      tags:     [],
    })
    expect(result.items[0].createdAt).toBe(NOW.toISOString())
    expect(result.items[0].updatedAt).toBe(NOW.toISOString())
  })

  it('U02: returns empty result when search returns no rows', async () => {
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

  it('U03b: throws AppError — not a generic Error — so instanceof check works', async () => {
    await expect(
      searchService.search('user-1', { q: '   ', page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(AppError)
  })

  it('U04: converts bigint total to number correctly', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([makeKeywordRow({ total: BigInt(42) })])
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([makeNoteWithTags()])

    const result = await searchService.search('user-1', { q: 'asad', page: 1, limit: 20 })

    expect(result.total).toBe(42)
    expect(typeof result.total).toBe('number')
  })

  it('U05: tags default to [] for noteId not present in tagMap', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([makeKeywordRow({ id: 'note-999' })])
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([])

    const result = await searchService.search('user-1', { q: 'asad', page: 1, limit: 20 })

    expect(result.items[0].tags).toEqual([])
  })

  it('U06: items order matches repository row order (updatedAt DESC preserved)', async () => {
    const rows: KeywordRow[] = [
      makeKeywordRow({ id: 'note-1', title: 'asad first',  total: BigInt(2) }),
      makeKeywordRow({ id: 'note-2', title: 'asad second', total: BigInt(2) }),
    ]
    vi.mocked(searchRepository.search).mockResolvedValue(rows)
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([
      makeNoteWithTags({ id: 'note-1', title: 'asad first' }),
      makeNoteWithTags({ id: 'note-2', title: 'asad second' }),
    ])

    const result = await searchService.search('user-1', { q: 'asad', page: 1, limit: 20 })

    expect(result.items[0].id).toBe('note-1')
    expect(result.items[1].id).toBe('note-2')
  })

  it('U07: findManyWithTags is NOT called when search returns no rows', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([])

    await searchService.search('user-1', { q: 'nothing', page: 1, limit: 20 })

    expect(searchRepository.findManyWithTags).not.toHaveBeenCalled()
  })

  it('U08: buildHeadline — wraps single keyword occurrence in <b> tags', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([
      makeKeywordRow({ title: 'hello asad world' }),
    ])
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([
      makeNoteWithTags({ id: 'note-1', title: 'hello asad world' }),
    ])

    const result = await searchService.search('user-1', { q: 'asad', page: 1, limit: 20 })

    expect(result.items[0].headline).toBe('hello <b>asad</b> world')
  })

  it('U09: buildHeadline — case-insensitive, preserves original casing of matched text', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([
      makeKeywordRow({ title: 'ASAD123' }),
    ])
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([
      makeNoteWithTags({ id: 'note-1', title: 'ASAD123' }),
    ])

    const result = await searchService.search('user-1', { q: 'asad', page: 1, limit: 20 })

    expect(result.items[0].headline).toBe('<b>ASAD</b>123')
  })

  it('U10: buildHeadline — escapes regex special characters in query (no crash)', async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([
      makeKeywordRow({ title: 'test (scope) here' }),
    ])
    vi.mocked(searchRepository.findManyWithTags).mockResolvedValue([
      makeNoteWithTags({ id: 'note-1', title: 'test (scope) here' }),
    ])

    const result = await searchService.search('user-1', { q: '(scope)', page: 1, limit: 20 })

    expect(result.items[0].headline).toBe('test <b>(scope)</b> here')
  })
})
