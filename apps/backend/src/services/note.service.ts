import type { Note, Tag, NoteVersion } from '@prisma/client'
import type {
  CreateNoteDTO,
  UpdateNoteDTO,
  ListNotesQueryDTO,
  NoteDTO,
  TagDTO,
  PaginatedNotesDTO,
  NoteVersionDTO,
  PaginatedVersionsDTO,
} from '@note-app/shared'
import { prisma } from '../lib/prisma'
import { noteRepository } from '../repositories/note.repository'
import { noteVersionRepository } from '../repositories/note-version.repository'
import { NotFoundError, ForbiddenError } from '../errors/domain-errors'

type NoteWithTags = Note & { tags: Tag[] }

const SORT_MAP: Record<string, object> = {
  createdAt_asc:  { createdAt: 'asc' },
  createdAt_desc: { createdAt: 'desc' },
  updatedAt_asc:  { updatedAt: 'asc' },
  updatedAt_desc: { updatedAt: 'desc' },
  title_asc:      { title: 'asc' },
  title_desc:     { title: 'desc' },
}

function toTagDTO(tag: Tag): TagDTO {
  return { id: tag.id, userId: tag.userId, name: tag.name, color: tag.color }
}

function toVersionDTO(v: NoteVersion): NoteVersionDTO {
  return {
    id:            v.id,
    noteId:        v.noteId,
    title:         v.title,
    content:       v.content,
    versionNumber: v.versionNumber,
    createdAt:     v.createdAt.toISOString(),
  }
}

function toNoteDTO(note: NoteWithTags): NoteDTO {
  return {
    id:        note.id,
    userId:    note.userId,
    title:     note.title,
    content:   note.content,
    tags:      note.tags.map(toTagDTO),
    deletedAt: note.deletedAt?.toISOString() ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  }
}

async function checkNoteOwnership(noteId: string, userId: string): Promise<void> {
  const note = await noteRepository.findById(noteId, userId)
  if (!note) {
    const exists = await noteRepository.findByIdOnly(noteId)
    if (exists) throw new ForbiddenError('Access denied')
    throw new NotFoundError('Note not found')
  }
}

async function validateTagOwnership(tagIds: string[], userId: string): Promise<void> {
  if (tagIds.length === 0) return
  const owned = await prisma.tag.count({ where: { id: { in: tagIds }, userId } })
  if (owned !== tagIds.length) throw new ForbiddenError('One or more tags do not belong to this user')
}

export const noteService = {
  async create(userId: string, dto: CreateNoteDTO): Promise<NoteDTO> {
    await validateTagOwnership(dto.tagIds, userId)

    const note = await prisma.$transaction(async (tx) => {
      const created = await noteRepository.create(
        { userId, title: dto.title, content: dto.content, tagIds: dto.tagIds },
        tx,
      )
      const versionNumber = await noteVersionRepository.getNextVersionNumber(created.id, tx)
      await noteVersionRepository.create(
        { noteId: created.id, title: created.title, content: created.content, versionNumber },
        tx,
      )
      return created
    })

    return toNoteDTO(note)
  },

  async list(userId: string, query: ListNotesQueryDTO): Promise<PaginatedNotesDTO> {
    const orderBy = (SORT_MAP[query.sort] ?? { updatedAt: 'desc' }) as object
    const { items, total } = await noteRepository.findAll(userId, {
      page:    query.page,
      limit:   query.limit,
      orderBy: orderBy as Parameters<typeof noteRepository.findAll>[1]['orderBy'],
      tagId:   query.tagId,
    })
    return { items: items.map(toNoteDTO), total, page: query.page, limit: query.limit }
  },

  async getById(userId: string, noteId: string): Promise<NoteDTO> {
    const note = await noteRepository.findById(noteId, userId)
    if (!note) throw new NotFoundError('Note not found')
    return toNoteDTO(note)
  },

  async update(userId: string, noteId: string, dto: UpdateNoteDTO): Promise<NoteDTO> {
    const existing = await noteRepository.findById(noteId, userId)
    if (!existing) throw new NotFoundError('Note not found')

    if (dto.tagIds !== undefined) {
      await validateTagOwnership(dto.tagIds, userId)
    }

    const note = await prisma.$transaction(async (tx) => {
      const updated = await noteRepository.update(noteId, dto, tx)
      const versionNumber = await noteVersionRepository.getNextVersionNumber(noteId, tx)
      await noteVersionRepository.create(
        { noteId, title: updated.title, content: updated.content, versionNumber },
        tx,
      )
      return updated
    })

    return toNoteDTO(note)
  },

  async delete(userId: string, noteId: string): Promise<void> {
    const note = await noteRepository.findByIdIncludingDeleted(noteId, userId)
    if (!note) throw new NotFoundError('Note not found')
    if (note.deletedAt) return
    await noteRepository.softDelete(noteId)
  },

  async listVersions(
    userId: string,
    noteId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedVersionsDTO> {
    await checkNoteOwnership(noteId, userId)
    const { items, total } = await noteVersionRepository.listByNoteId(noteId, { page, limit })
    return { items: items.map(toVersionDTO), total, page, limit }
  },

  async getVersion(
    userId: string,
    noteId: string,
    versionId: string,
  ): Promise<NoteVersionDTO> {
    await checkNoteOwnership(noteId, userId)
    const version = await noteVersionRepository.findById(versionId, noteId)
    if (!version) throw new NotFoundError('Version not found')
    return toVersionDTO(version)
  },

  async restoreVersion(
    userId: string,
    noteId: string,
    versionId: string,
  ): Promise<NoteDTO> {
    await checkNoteOwnership(noteId, userId)
    const version = await noteVersionRepository.findById(versionId, noteId)
    if (!version) throw new NotFoundError('Version not found')

    const restored = await prisma.$transaction(async (tx) => {
      const updated = await noteRepository.update(
        noteId,
        { title: version.title, content: version.content },
        tx,
      )
      const versionNumber = await noteVersionRepository.getNextVersionNumber(noteId, tx)
      await noteVersionRepository.create(
        { noteId, title: updated.title, content: updated.content, versionNumber },
        tx,
      )
      return updated
    })

    return toNoteDTO(restored)
  },
}
