import type { Note, NoteVersion, Tag } from '@prisma/client'
import type {
  ListVersionsQueryDTO,
  NoteVersionDTO,
  PaginatedVersionsDTO,
  NoteDTO,
  TagDTO,
} from '@note-app/shared'
import { MAX_VERSIONS_PER_NOTE } from '@note-app/shared'
import { prisma }                from '../lib/prisma'
import { noteRepository }        from '../repositories/note.repository'
import { noteVersionRepository } from '../repositories/note-version.repository'
import { NotFoundError, ForbiddenError } from '../errors/domain-errors'

type NoteWithTags = Note & { tags: Tag[] }

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
    tags:      note.tags.map((t): TagDTO => ({ id: t.id, userId: t.userId, name: t.name, color: t.color })),
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

export const noteVersionService = {
  async list(userId: string, noteId: string, query: ListVersionsQueryDTO): Promise<PaginatedVersionsDTO> {
    await checkNoteOwnership(noteId, userId)

    const { items, total } = await noteVersionRepository.findAll(noteId, {
      page: query.page, limit: query.limit,
    })
    return { items: items.map(toVersionDTO), total, page: query.page, limit: query.limit }
  },

  async getById(userId: string, noteId: string, versionId: string): Promise<NoteVersionDTO> {
    await checkNoteOwnership(noteId, userId)

    const version = await noteVersionRepository.findById(versionId, noteId)
    if (!version) throw new NotFoundError('Version not found')

    return toVersionDTO(version)
  },

  async restore(userId: string, noteId: string, versionId: string): Promise<NoteDTO> {
    await checkNoteOwnership(noteId, userId)

    const version = await noteVersionRepository.findById(versionId, noteId)
    if (!version) throw new NotFoundError('Version not found')

    const updated = await prisma.$transaction(async (tx) => {
      const u = await noteRepository.update(
        noteId,
        { title: version.title, content: version.content },
        tx,
      )
      const versionNumber = await noteVersionRepository.getNextVersionNumber(noteId, tx)
      await noteVersionRepository.create(
        { noteId, title: version.title, content: version.content, versionNumber },
        tx,
      )
      return u
    })

    await noteVersionRepository.deleteExcess(noteId, MAX_VERSIONS_PER_NOTE)
    return toNoteDTO(updated)
  },
}
