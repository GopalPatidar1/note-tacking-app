import type { Prisma, NoteVersion } from '@prisma/client'
import { prisma } from '../lib/prisma'

type Tx = Prisma.TransactionClient

export const noteVersionRepository = {
  async getNextVersionNumber(noteId: string, tx?: Tx): Promise<number> {
    const client = tx ?? prisma
    const count = await client.noteVersion.count({ where: { noteId } })
    return count + 1
  },

  create(
    data: { noteId: string; title: string; content: string; versionNumber: number },
    tx?: Tx,
  ) {
    const client = tx ?? prisma
    return client.noteVersion.create({ data })
  },

  async listByNoteId(
    noteId: string,
    opts: { page: number; limit: number },
  ): Promise<{ items: NoteVersion[]; total: number }> {
    const [items, total] = await prisma.$transaction([
      prisma.noteVersion.findMany({
        where:   { noteId },
        orderBy: { versionNumber: 'desc' },
        skip:    (opts.page - 1) * opts.limit,
        take:    opts.limit,
      }),
      prisma.noteVersion.count({ where: { noteId } }),
    ])
    return { items, total }
  },

  findById(id: string, noteId: string): Promise<NoteVersion | null> {
    return prisma.noteVersion.findFirst({ where: { id, noteId } })
  },
}
