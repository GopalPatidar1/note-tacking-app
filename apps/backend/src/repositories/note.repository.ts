import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

type Tx = Prisma.TransactionClient

const NOTE_INCLUDE = { tags: true } as const

export const noteRepository = {
  create(
    data: { userId: string; title: string; content: string; tagIds: string[] },
    tx?: Tx,
  ) {
    const client = tx ?? prisma
    return client.note.create({
      data: {
        userId:  data.userId,
        title:   data.title,
        content: data.content,
        tags:    data.tagIds.length > 0 ? { connect: data.tagIds.map(id => ({ id })) } : undefined,
      },
      include: NOTE_INCLUDE,
    })
  },

  findById(id: string, userId: string) {
    return prisma.note.findFirst({
      where:   { id, userId, deletedAt: null },
      include: NOTE_INCLUDE,
    })
  },

  findByIdIncludingDeleted(id: string, userId: string) {
    return prisma.note.findFirst({
      where:   { id, userId },
      include: NOTE_INCLUDE,
    })
  },

  findAll(
    userId: string,
    opts: {
      page:         number
      limit:        number
      orderBy:      Prisma.NoteOrderByWithRelationInput
      tagId?:       string
      createdFrom?: Date
      createdTo?:   Date
      updatedFrom?: Date
      updatedTo?:   Date
    },
  ) {
    const where: Prisma.NoteWhereInput = {
      userId,
      deletedAt: null,
      ...(opts.tagId
        ? { tags: { some: { id: opts.tagId, userId } } }
        : {}),
      ...(opts.createdFrom || opts.createdTo
        ? {
            createdAt: {
              ...(opts.createdFrom ? { gte: opts.createdFrom } : {}),
              ...(opts.createdTo   ? { lte: opts.createdTo }   : {}),
            },
          }
        : {}),
      ...(opts.updatedFrom || opts.updatedTo
        ? {
            updatedAt: {
              ...(opts.updatedFrom ? { gte: opts.updatedFrom } : {}),
              ...(opts.updatedTo   ? { lte: opts.updatedTo }   : {}),
            },
          }
        : {}),
    }

    return Promise.all([
      prisma.note.findMany({
        where,
        orderBy: opts.orderBy,
        skip:    (opts.page - 1) * opts.limit,
        take:    opts.limit,
        include: NOTE_INCLUDE,
      }),
      prisma.note.count({ where }),
    ]).then(([items, total]) => ({ items, total }))
  },

  update(
    id: string,
    data: { title?: string; content?: string; tagIds?: string[] },
    tx?: Tx,
  ) {
    const client = tx ?? prisma
    return client.note.update({
      where: { id },
      data: {
        ...(data.title   !== undefined ? { title:   data.title }   : {}),
        ...(data.content !== undefined ? { content: data.content } : {}),
        ...(data.tagIds  !== undefined ? { tags: { set: data.tagIds.map(id => ({ id })) } } : {}),
      },
      include: NOTE_INCLUDE,
    })
  },

  softDelete(id: string) {
    return prisma.note.update({
      where: { id },
      data:  { deletedAt: new Date() },
    })
  },
}
