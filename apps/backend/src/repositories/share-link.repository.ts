import { Prisma } from '@prisma/client'
import type { ShareLink, Note, Tag } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AppError } from '../errors/domain-errors'

type ShareLinkWithNote = ShareLink & { note: Note }
type NoteWithTags      = Note & { tags: Tag[] }

export const shareLinkRepository = {
  async create(data: { noteId: string; token: string; expiresAt: Date | null }): Promise<ShareLink> {
    try {
      return await prisma.shareLink.create({ data })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('Token collision', 500, 'TOKEN_COLLISION')
      }
      throw err
    }
  },

  findByToken(token: string): Promise<ShareLinkWithNote | null> {
    return prisma.shareLink.findUnique({
      where:   { token },
      include: { note: true },
    })
  },

  findByIdWithNote(id: string): Promise<ShareLinkWithNote | null> {
    return prisma.shareLink.findUnique({
      where:   { id },
      include: { note: true },
    })
  },

  findNoteWithTags(noteId: string): Promise<NoteWithTags | null> {
    return prisma.note.findFirst({
      where:   { id: noteId, deletedAt: null },
      include: { tags: true },
    })
  },

  incrementViewCount(id: string): Promise<void> {
    return prisma.shareLink
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .then(() => undefined)
  },

  revoke(id: string): Promise<void> {
    return prisma.shareLink
      .update({ where: { id }, data: { revokedAt: new Date() } })
      .then(() => undefined)
  },
}
