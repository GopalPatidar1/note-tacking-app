import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Tag } from '@prisma/client'

vi.mock('../repositories/tag.repository', () => ({
  tagRepository: {
    findAll:  vi.fn(),
    findById: vi.fn(),
    create:   vi.fn(),
    update:   vi.fn(),
    delete:   vi.fn(),
  },
}))

import { tagService } from '../services/tag.service'
import { tagRepository } from '../repositories/tag.repository'
import { NotFoundError } from '../errors/domain-errors'

const NOW = new Date('2024-01-01T00:00:00.000Z')

type TagWithCount = Tag & { _count: { notes: number } }

function makeTag(overrides?: Partial<TagWithCount>): TagWithCount {
  return {
    id:        'tag-1',
    userId:    'user-1',
    name:      'Work',
    color:     '#3B82F6',
    createdAt: NOW,
    _count:    { notes: 3 },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── U01–U02: list ────────────────────────────────────────────────────────────
describe('tagService.list', () => {
  it('U01: returns mapped TagResponseDTO[] from repository', async () => {
    const tag = makeTag()
    vi.mocked(tagRepository.findAll).mockResolvedValue([tag])

    const result = await tagService.list('user-1')

    expect(result).toEqual([{
      id:        'tag-1',
      userId:    'user-1',
      name:      'Work',
      color:     '#3B82F6',
      createdAt: NOW.toISOString(),
      noteCount: 3,
    }])
    expect(tagRepository.findAll).toHaveBeenCalledWith('user-1')
  })

  it('U02: returns [] when user has no tags', async () => {
    vi.mocked(tagRepository.findAll).mockResolvedValue([])

    const result = await tagService.list('user-1')

    expect(result).toEqual([])
  })
})

// ─── U03: create ─────────────────────────────────────────────────────────────
describe('tagService.create', () => {
  it('U03: returns new TagResponseDTO with noteCount: 0', async () => {
    const tag = makeTag({ _count: { notes: 0 } })
    vi.mocked(tagRepository.create).mockResolvedValue(tag)

    const result = await tagService.create('user-1', { name: 'Work', color: '#3B82F6' })

    expect(result.noteCount).toBe(0)
    expect(tagRepository.create).toHaveBeenCalledWith({ userId: 'user-1', name: 'Work', color: '#3B82F6' })
  })
})

// ─── U04–U05: update ─────────────────────────────────────────────────────────
describe('tagService.update', () => {
  it('U04: returns updated TagResponseDTO', async () => {
    const existing = makeTag()
    const updated  = makeTag({ name: 'Personal', _count: { notes: 3 } })
    vi.mocked(tagRepository.findById).mockResolvedValue(existing)
    vi.mocked(tagRepository.update).mockResolvedValue(updated)

    const result = await tagService.update('user-1', 'tag-1', { name: 'Personal' })

    expect(result.name).toBe('Personal')
    expect(tagRepository.update).toHaveBeenCalledWith('tag-1', { name: 'Personal' })
  })

  it('U05: throws NotFoundError when findById returns null', async () => {
    vi.mocked(tagRepository.findById).mockResolvedValue(null)

    await expect(tagService.update('user-1', 'bad-id', { name: 'X' }))
      .rejects.toThrow(NotFoundError)
  })
})

// ─── U06–U07: delete ─────────────────────────────────────────────────────────
describe('tagService.delete', () => {
  it('U06: calls tagRepository.delete on success', async () => {
    vi.mocked(tagRepository.findById).mockResolvedValue(makeTag())
    vi.mocked(tagRepository.delete).mockResolvedValue(undefined)

    await tagService.delete('user-1', 'tag-1')

    expect(tagRepository.delete).toHaveBeenCalledWith('tag-1', 'user-1')
  })

  it('U07: throws NotFoundError when findById returns null', async () => {
    vi.mocked(tagRepository.findById).mockResolvedValue(null)

    await expect(tagService.delete('user-1', 'bad-id'))
      .rejects.toThrow(NotFoundError)
  })
})
