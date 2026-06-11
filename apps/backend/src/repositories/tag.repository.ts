import type { Tag } from '@prisma/client'
import { prisma } from '../lib/prisma'

type TagWithCount = Tag & { _count: { notes: number } }

const TAG_INCLUDE = {
  _count: { select: { notes: { where: { deletedAt: null } } } },
} as const

export const tagRepository = {
  findAll(userId: string): Promise<TagWithCount[]> {
    return prisma.tag.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      include: TAG_INCLUDE,
    })
  },

  findById(id: string, userId: string): Promise<Tag | null> {
    return prisma.tag.findFirst({ where: { id, userId } })
  },

  create(data: { userId: string; name: string; color: string }): Promise<TagWithCount> {
    return prisma.tag.create({ data, include: TAG_INCLUDE })
  },

  update(id: string, data: { name?: string; color?: string }): Promise<TagWithCount> {
    return prisma.tag.update({ where: { id }, data, include: TAG_INCLUDE })
  },

  delete(id: string, userId: string): Promise<void> {
    return prisma.tag.deleteMany({ where: { id, userId } }).then(() => undefined)
  },
}
