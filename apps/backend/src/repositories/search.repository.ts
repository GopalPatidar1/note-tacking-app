import type { Note, Tag } from '@prisma/client'
import { prisma } from '../lib/prisma'

interface FtsRow {
  id:        string
  title:     string
  headline:  string
  rank:      number
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
  ): Promise<FtsRow[]> {
    const offset = (page - 1) * limit

    return prisma.$queryRaw<FtsRow[]>`
      SELECT
        n.id,
        n.title,
        ts_headline(
          'english',
          n.title || ' ' || n.content,
          plainto_tsquery('english', ${q})
        ) AS headline,
        ts_rank(
          to_tsvector('english', n.title || ' ' || n.content),
          plainto_tsquery('english', ${q})
        ) AS rank,
        n."createdAt",
        n."updatedAt",
        COUNT(*) OVER () AS total
      FROM notes n
      WHERE n."userId"    = ${userId}
        AND n."deletedAt" IS NULL
        AND to_tsvector('english', n.title || ' ' || n.content)
            @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit} OFFSET ${offset}
    `
  },

  findManyWithTags(ids: string[]): Promise<NoteWithTags[]> {
    return prisma.note.findMany({
      where:   { id: { in: ids }, deletedAt: null },
      include: { tags: true },
    })
  },
}
