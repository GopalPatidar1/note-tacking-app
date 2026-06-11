import { z } from 'zod'

export const CreateNoteSchema = z.object({
  title:   z.string().min(1),
  content: z.string(),
  tagIds:  z.array(z.string().uuid()).default([]),
})

export const UpdateNoteSchema = z.object({
  title:   z.string().min(1).optional(),
  content: z.string().optional(),
  tagIds:  z.array(z.string().uuid()).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' })

export const ListNotesQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort:  z.enum([
    'createdAt_asc', 'createdAt_desc',
    'updatedAt_asc', 'updatedAt_desc',
    'title_asc',     'title_desc',
  ]).default('updatedAt_desc'),
  tagId: z.string().uuid().optional(),
})

export type CreateNoteDTO     = z.infer<typeof CreateNoteSchema>
export type UpdateNoteDTO     = z.infer<typeof UpdateNoteSchema>
export type ListNotesQueryDTO = z.infer<typeof ListNotesQuerySchema>

export interface TagDTO {
  id:        string
  userId:    string
  name:      string
  color:     string
  noteCount?: number
}

export interface NoteDTO {
  id:        string
  userId:    string
  title:     string
  content:   string
  tags:      TagDTO[]
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PaginatedNotesDTO {
  items: NoteDTO[]
  total: number
  page:  number
  limit: number
}

// ── search ──────────────────────────────────────────────────────

export const SearchQuerySchema = z.object({
  q:     z.string().min(1),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type SearchQueryDTO = z.infer<typeof SearchQuerySchema>

export interface SearchResultDTO {
  id:        string
  title:     string
  headline:  string
  tags:      Pick<TagDTO, 'name' | 'color'>[]
  createdAt: string
  updatedAt: string
}

export interface PaginatedSearchResultsDTO {
  items:  SearchResultDTO[]
  total:  number
  page:   number
  limit:  number
  query:  string
}
