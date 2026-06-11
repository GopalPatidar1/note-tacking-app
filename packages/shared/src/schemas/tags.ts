import { z } from 'zod'

const HEX_COLOR = /^#([0-9A-Fa-f]{3}){1,2}$/

export const CreateTagSchema = z.object({
  name:  z.string().min(1),
  color: z.string().regex(HEX_COLOR, 'Must be a valid hex color (#RGB or #RRGGBB)'),
})

export const UpdateTagSchema = z.object({
  name:  z.string().min(1).optional(),
  color: z.string().regex(HEX_COLOR, 'Must be a valid hex color (#RGB or #RRGGBB)').optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' })

export type CreateTagDTO = z.infer<typeof CreateTagSchema>
export type UpdateTagDTO = z.infer<typeof UpdateTagSchema>

export interface TagResponseDTO {
  id:        string
  userId:    string
  name:      string
  color:     string
  createdAt: string
  noteCount: number
}
