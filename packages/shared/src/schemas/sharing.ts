import { z } from 'zod'

export const CreateShareLinkSchema = z.object({
  expiresAt: z.string().datetime().nullable().optional(),
})

export type CreateShareLinkDTO = z.infer<typeof CreateShareLinkSchema>

export interface ShareLinkResponseDTO {
  id:        string
  noteId:    string
  token:     string
  expiresAt: string | null
  revokedAt: string | null
  viewCount: number
  createdAt: string
}

export interface PublicNoteDTO {
  id:        string
  title:     string
  content:   string
  tags:      { name: string; color: string }[]
  createdAt: string
  updatedAt: string
}
