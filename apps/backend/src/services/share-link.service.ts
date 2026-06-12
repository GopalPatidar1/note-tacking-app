import { randomBytes } from 'crypto'
import type { ShareLink } from '@prisma/client'
import type { CreateShareLinkDTO, ShareLinkResponseDTO, PublicNoteDTO } from '@note-app/shared'
import { shareLinkRepository } from '../repositories/share-link.repository'
import { noteRepository }      from '../repositories/note.repository'
import { AppError, NotFoundError, ForbiddenError, ShareLinkInvalidError } from '../errors/domain-errors'

function toShareLinkDTO(link: ShareLink): ShareLinkResponseDTO {
  return {
    id:        link.id,
    noteId:    link.noteId,
    token:     link.token,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    viewCount: link.viewCount,
    createdAt: link.createdAt.toISOString(),
  }
}

export const shareLinkService = {
  async create(userId: string, noteId: string, dto: CreateShareLinkDTO): Promise<ShareLinkResponseDTO> {
    const note = await noteRepository.findById(noteId, userId)
    if (!note) throw new NotFoundError('Note not found')

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null

    for (let attempt = 0; attempt < 2; attempt++) {
      const token = randomBytes(32).toString('hex')
      try {
        const link = await shareLinkRepository.create({ noteId, token, expiresAt })
        return toShareLinkDTO(link)
      } catch (err) {
        if (err instanceof AppError && err.code === 'TOKEN_COLLISION') continue
        throw err
      }
    }

    throw new AppError('Unable to generate unique share token', 500, 'INTERNAL_ERROR')
  },

  async getPublic(token: string): Promise<PublicNoteDTO> {
    const linkWithNote = await shareLinkRepository.findByToken(token)
    if (!linkWithNote)               throw new ShareLinkInvalidError()
    if (linkWithNote.revokedAt)      throw new ShareLinkInvalidError()
    if (linkWithNote.expiresAt && linkWithNote.expiresAt < new Date()) throw new ShareLinkInvalidError()
    if (linkWithNote.note.deletedAt) throw new ShareLinkInvalidError()

    await shareLinkRepository.incrementViewCount(linkWithNote.id)

    const note = await shareLinkRepository.findNoteWithTags(linkWithNote.noteId)
    if (!note) throw new ShareLinkInvalidError()

    return {
      id:        note.id,
      title:     note.title,
      content:   note.content,
      tags:      note.tags.map(t => ({ name: t.name, color: t.color })),
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }
  },

  async revoke(userId: string, shareLinkId: string): Promise<void> {
    const linkWithNote = await shareLinkRepository.findByIdWithNote(shareLinkId)
    if (!linkWithNote)                       throw new NotFoundError('Share link not found')
    if (linkWithNote.note.userId !== userId) throw new ForbiddenError()
    if (linkWithNote.revokedAt)              return  // already revoked — preserve original timestamp
    await shareLinkRepository.revoke(shareLinkId)
  },
}
