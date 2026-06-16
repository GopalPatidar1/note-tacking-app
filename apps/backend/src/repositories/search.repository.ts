import type { Note, Tag } from '@prisma/client'
import { prisma } from '../lib/prisma'

interface KeywordRow {
  id:        string
  title:     string
  createdAt: Date
  updatedAt: Date
  total:     bigint
}

type NoteWithTags = Note & { tags: Tag[] }

export const searchRepository = {
  async search(
    userId: string,
    q: string,
    page: number,
    limit: number,
  ): Promise<KeywordRow[]> {
    const pattern = `%${q}%`
    const offset  = (page - 1) * limit

    return prisma.$queryRaw<KeywordRow[]>`
      SELECT
        id,
        title,
        "createdAt",
        "updatedAt",
        COUNT(*) OVER () AS total
      FROM notes
      WHERE "userId"    = ${userId}
        AND "deletedAt" IS NULL
        AND title       ILIKE ${pattern}
      ORDER BY "updatedAt" DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    `
  },

  findManyWithTags(ids: string[]): Promise<NoteWithTags[]> {
    return prisma.note.findMany({
      where:   { id: { in: ids }, deletedAt: null },
      include: { tags: true },
    })
  },
}
