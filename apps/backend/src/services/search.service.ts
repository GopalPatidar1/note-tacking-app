import type {
  SearchQueryDTO,
  SearchResultDTO,
  PaginatedSearchResultsDTO,
  TagDTO,
} from '@note-app/shared'
import { searchRepository } from '../repositories/search.repository'
import { AppError } from '../errors/domain-errors'

function buildHeadline(title: string, q: string): string {
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return title.replace(new RegExp(`(${escaped})`, 'gi'), '<b>$1</b>')
}

export const searchService = {
  async search(userId: string, dto: SearchQueryDTO): Promise<PaginatedSearchResultsDTO> {
    const q = dto.q.trim()
    if (q.length === 0) {
      throw new AppError('Search query must not be empty', 400, 'VALIDATION_ERROR')
    }

    const rows = await searchRepository.search(userId, q, dto.page, dto.limit)

    if (rows.length === 0) {
      return { items: [], total: 0, page: dto.page, limit: dto.limit, query: q }
    }

    const ids           = rows.map(r => r.id)
    const notesWithTags = await searchRepository.findManyWithTags(ids)

    const tagMap = new Map<string, Pick<TagDTO, 'name' | 'color'>[]>(
      notesWithTags.map(n => [
        n.id,
        n.tags.map(t => ({ name: t.name, color: t.color })),
      ]),
    )

    const items: SearchResultDTO[] = rows.map(row => ({
      id:        row.id,
      title:     row.title,
      headline:  buildHeadline(row.title, q),
      tags:      tagMap.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))

    return {
      items,
      total: Number(rows[0].total),
      page:  dto.page,
      limit: dto.limit,
      query: q,
    }
  },
}
