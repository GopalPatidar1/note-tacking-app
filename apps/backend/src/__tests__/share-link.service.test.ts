import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ShareLink, Note, Tag } from '@prisma/client'

vi.mock('../repositories/share-link.repository', () => ({
  shareLinkRepository: {
    create:             vi.fn(),
    findByToken:        vi.fn(),
    findByIdWithNote:   vi.fn(),
    findNoteWithTags:   vi.fn(),
    incrementViewCount: vi.fn(),
    revoke:             vi.fn(),
  },
}))

vi.mock('../repositories/note.repository', () => ({
  noteRepository: {
    findById: vi.fn(),
  },
}))

import { shareLinkService } from '../services/share-link.service'
import { shareLinkRepository } from '../repositories/share-link.repository'
import { noteRepository } from '../repositories/note.repository'
import { NotFoundError, ForbiddenError, ShareLinkInvalidError } from '../errors/domain-errors'

const NOW     = new Date('2026-01-01T00:00:00.000Z')
const FUTURE  = new Date('2099-01-01T00:00:00.000Z')
const PAST    = new Date('2000-01-01T00:00:00.000Z')

type ShareLinkWithNote = ShareLink & { note: Note }
type NoteWithTags      = Note & { tags: Tag[] }

function makeNote(overrides?: Partial<Note>): Note {
  return {
    id:        'note-1',
    userId:    'user-1',
    title:     'Test Note',
    content:   '<p>Hello</p>',
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

const MOCK_TOKEN = 'a'.repeat(64)

function makeShareLink(overrides?: Partial<ShareLink>): ShareLink {
  return {
    id:        'link-1',
    noteId:    'note-1',
    token:     MOCK_TOKEN,
    expiresAt: null,
    revokedAt: null,
    viewCount: 0,
    createdAt: NOW,
    ...overrides,
  }
}

function makeShareLinkWithNote(
  linkOverrides?: Partial<ShareLink>,
  noteOverrides?: Partial<Note>,
): ShareLinkWithNote {
  return { ...makeShareLink(linkOverrides), note: makeNote(noteOverrides) }
}

function makeNoteWithTags(overrides?: Partial<Note>, tags: Tag[] = []): NoteWithTags {
  return { ...makeNote(overrides), tags }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── create ──────────────────────────────────────────────────────────────────

describe('shareLinkService.create', () => {
  it('U01: returns ShareLinkResponseDTO for valid owned note', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(shareLinkRepository.create).mockResolvedValue(makeShareLink())

    const result = await shareLinkService.create('user-1', 'note-1', {})

    expect(result.noteId).toBe('note-1')
    expect(result.viewCount).toBe(0)
    expect(result.revokedAt).toBeNull()
    expect(result.expiresAt).toBeNull()
    // verify the 64-char hex token was passed to the repository
    const callArg = vi.mocked(shareLinkRepository.create).mock.calls[0][0]
    expect(callArg.token).toHaveLength(64)
    expect(callArg.token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('U02: sets expiresAt to null when DTO omits the field', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(shareLinkRepository.create).mockResolvedValue(makeShareLink())

    await shareLinkService.create('user-1', 'note-1', {})

    expect(shareLinkRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: null }),
    )
  })

  it('U03: stores parsed Date when DTO provides ISO string', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(shareLinkRepository.create).mockResolvedValue(makeShareLink({ expiresAt: FUTURE }))

    const iso = FUTURE.toISOString()
    await shareLinkService.create('user-1', 'note-1', { expiresAt: iso })

    const call = vi.mocked(shareLinkRepository.create).mock.calls[0][0]
    expect(call.expiresAt).toBeInstanceOf(Date)
    expect(call.expiresAt?.toISOString()).toBe(iso)
  })

  it('U04: throws NotFoundError when note not found', async () => {
    vi.mocked(noteRepository.findById).mockResolvedValue(null)

    await expect(shareLinkService.create('user-1', 'bad-note', {}))
      .rejects.toThrow(NotFoundError)
  })
})

// ─── getPublic ────────────────────────────────────────────────────────────────

describe('shareLinkService.getPublic', () => {
  it('U05: returns PublicNoteDTO for valid, unexpired, unrevoked token', async () => {
    vi.mocked(shareLinkRepository.findByToken).mockResolvedValue(makeShareLinkWithNote())
    vi.mocked(shareLinkRepository.incrementViewCount).mockResolvedValue(undefined)
    vi.mocked(shareLinkRepository.findNoteWithTags).mockResolvedValue(
      makeNoteWithTags(undefined, [{ id: 't1', userId: 'user-1', name: 'Work', color: '#3B82F6', createdAt: NOW }]),
    )

    const result = await shareLinkService.getPublic('abc123')

    expect(result.id).toBe('note-1')
    expect(result.title).toBe('Test Note')
    expect(result.tags).toEqual([{ name: 'Work', color: '#3B82F6' }])
  })

  it('U06: throws ShareLinkInvalidError when token not found', async () => {
    vi.mocked(shareLinkRepository.findByToken).mockResolvedValue(null)

    await expect(shareLinkService.getPublic('nope'))
      .rejects.toThrow(ShareLinkInvalidError)
  })

  it('U07: throws ShareLinkInvalidError when revokedAt is set', async () => {
    vi.mocked(shareLinkRepository.findByToken).mockResolvedValue(
      makeShareLinkWithNote({ revokedAt: PAST }),
    )

    await expect(shareLinkService.getPublic('abc123'))
      .rejects.toThrow(ShareLinkInvalidError)
  })

  it('U08: throws ShareLinkInvalidError when expiresAt is in the past', async () => {
    vi.mocked(shareLinkRepository.findByToken).mockResolvedValue(
      makeShareLinkWithNote({ expiresAt: PAST }),
    )

    await expect(shareLinkService.getPublic('abc123'))
      .rejects.toThrow(ShareLinkInvalidError)
  })

  it('U09: throws ShareLinkInvalidError when note is soft-deleted', async () => {
    vi.mocked(shareLinkRepository.findByToken).mockResolvedValue(
      makeShareLinkWithNote({}, { deletedAt: PAST }),
    )

    await expect(shareLinkService.getPublic('abc123'))
      .rejects.toThrow(ShareLinkInvalidError)
  })

  it('U10: calls incrementViewCount before returning', async () => {
    vi.mocked(shareLinkRepository.findByToken).mockResolvedValue(makeShareLinkWithNote())
    vi.mocked(shareLinkRepository.incrementViewCount).mockResolvedValue(undefined)
    vi.mocked(shareLinkRepository.findNoteWithTags).mockResolvedValue(makeNoteWithTags())

    await shareLinkService.getPublic('abc123')

    expect(shareLinkRepository.incrementViewCount).toHaveBeenCalledWith('link-1')
  })

  it('U11: does NOT call incrementViewCount when token is invalid', async () => {
    vi.mocked(shareLinkRepository.findByToken).mockResolvedValue(null)

    await expect(shareLinkService.getPublic('abc123')).rejects.toThrow()

    expect(shareLinkRepository.incrementViewCount).not.toHaveBeenCalled()
  })
})

// ─── revoke ───────────────────────────────────────────────────────────────────

describe('shareLinkService.revoke', () => {
  it('U12: calls shareLinkRepository.revoke for valid owned link', async () => {
    vi.mocked(shareLinkRepository.findByIdWithNote).mockResolvedValue(makeShareLinkWithNote())
    vi.mocked(shareLinkRepository.revoke).mockResolvedValue(undefined)

    await shareLinkService.revoke('user-1', 'link-1')

    expect(shareLinkRepository.revoke).toHaveBeenCalledWith('link-1')
  })

  it('U13: throws NotFoundError when share link not found', async () => {
    vi.mocked(shareLinkRepository.findByIdWithNote).mockResolvedValue(null)

    await expect(shareLinkService.revoke('user-1', 'bad-id'))
      .rejects.toThrow(NotFoundError)
  })

  it('U14: throws ForbiddenError when note belongs to another user', async () => {
    vi.mocked(shareLinkRepository.findByIdWithNote).mockResolvedValue(
      makeShareLinkWithNote({}, { userId: 'other-user' }),
    )

    await expect(shareLinkService.revoke('user-1', 'link-1'))
      .rejects.toThrow(ForbiddenError)
  })

  it('U15: does NOT call shareLinkRepository.revoke when already revoked (idempotent)', async () => {
    vi.mocked(shareLinkRepository.findByIdWithNote).mockResolvedValue(
      makeShareLinkWithNote({ revokedAt: PAST }),
    )

    await shareLinkService.revoke('user-1', 'link-1')

    expect(shareLinkRepository.revoke).not.toHaveBeenCalled()
  })
})

// ─── token collision retry ────────────────────────────────────────────────────

describe('shareLinkService.create — token collision retry', () => {
  it('U16: retries once on TOKEN_COLLISION and returns successfully', async () => {
    const { AppError: AE } = await import('../errors/domain-errors')
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(shareLinkRepository.create)
      .mockRejectedValueOnce(new AE('Token collision', 500, 'TOKEN_COLLISION'))
      .mockResolvedValueOnce(makeShareLink())

    const result = await shareLinkService.create('user-1', 'note-1', {})

    expect(shareLinkRepository.create).toHaveBeenCalledTimes(2)
    expect(result.noteId).toBe('note-1')
  })

  it('U17: throws after two consecutive TOKEN_COLLISION errors', async () => {
    const { AppError: AE } = await import('../errors/domain-errors')
    const collision = new AE('Token collision', 500, 'TOKEN_COLLISION')
    vi.mocked(noteRepository.findById).mockResolvedValue(makeNote() as never)
    vi.mocked(shareLinkRepository.create)
      .mockRejectedValueOnce(collision)
      .mockRejectedValueOnce(collision)

    await expect(shareLinkService.create('user-1', 'note-1', {}))
      .rejects.toThrow('Unable to generate unique share token')

    expect(shareLinkRepository.create).toHaveBeenCalledTimes(2)
  })
})
