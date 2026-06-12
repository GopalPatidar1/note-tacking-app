import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

type Tx = Prisma.TransactionClient

export const noteVersionRepository = {
  async getNextVersionNumber(noteId: string, tx?: Tx): Promise<number> {
    const client = tx ?? prisma
    const latest = await client.noteVersion.findFirst({
      where:   { noteId },
      orderBy: { versionNumber: 'desc' },
      select:  { versionNumber: true },
    })
    return (latest?.versionNumber ?? 0) + 1
  },

  create(
    data: { noteId: string; title: string; content: string; versionNumber: number },
    tx?: Tx,
  ) {
    const client = tx ?? prisma
    return client.noteVersion.create({ data })
  },

  findAll(noteId: string, opts: { page: number; limit: number }) {
    return Promise.all([
      prisma.noteVersion.findMany({
        where:   { noteId },
        orderBy: { versionNumber: 'desc' },
        skip:    (opts.page - 1) * opts.limit,
        take:    opts.limit,
      }),
      prisma.noteVersion.count({ where: { noteId } }),
    ]).then(([items, total]) => ({ items, total }))
  },

  findById(versionId: string, noteId: string) {
    return prisma.noteVersion.findFirst({
      where: { id: versionId, noteId },
    })
  },

  async deleteExcess(noteId: string, keepCount: number): Promise<void> {
    const boundary = await prisma.noteVersion.findMany({
      where:   { noteId },
      orderBy: { versionNumber: 'desc' },
      skip:    keepCount,
      take:    1,
      select:  { versionNumber: true },
    })
    if (boundary.length === 0) return
    await prisma.noteVersion.deleteMany({
      where: { noteId, versionNumber: { lte: boundary[0].versionNumber } },
    })
  },
}
