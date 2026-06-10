import type { Prisma } from '@prisma/client'
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
}
