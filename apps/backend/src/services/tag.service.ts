import type { Tag } from '@prisma/client'
import type { CreateTagDTO, UpdateTagDTO, TagResponseDTO } from '@note-app/shared'
import { tagRepository } from '../repositories/tag.repository'
import { NotFoundError } from '../errors/domain-errors'

type TagWithCount = Tag & { _count: { notes: number } }

function toTagResponseDTO(tag: TagWithCount): TagResponseDTO {
  return {
    id:        tag.id,
    userId:    tag.userId,
    name:      tag.name,
    color:     tag.color,
    createdAt: tag.createdAt.toISOString(),
    noteCount: tag._count.notes,
  }
}

export const tagService = {
  async list(userId: string): Promise<TagResponseDTO[]> {
    const tags = await tagRepository.findAll(userId)
    return tags.map(toTagResponseDTO)
  },

  async create(userId: string, dto: CreateTagDTO): Promise<TagResponseDTO> {
    const tag = await tagRepository.create({ userId, ...dto })
    return toTagResponseDTO(tag)
  },

  async update(userId: string, tagId: string, dto: UpdateTagDTO): Promise<TagResponseDTO> {
    const existing = await tagRepository.findById(tagId, userId)
    if (!existing) throw new NotFoundError('Tag not found')
    const updated = await tagRepository.update(tagId, dto)
    return toTagResponseDTO(updated)
  },

  async delete(userId: string, tagId: string): Promise<void> {
    const existing = await tagRepository.findById(tagId, userId)
    if (!existing) throw new NotFoundError('Tag not found')
    await tagRepository.delete(tagId, userId)
  },
}
