import { Request, Response } from 'express'
import { CreateTagSchema, UpdateTagSchema } from '@note-app/shared'
import { tagService } from '../services/tag.service'

export const tagController = {
  async list(req: Request, res: Response) {
    const tags = await tagService.list(req.user.id)
    res.status(200).json({ data: tags })
  },

  async create(req: Request, res: Response) {
    const body = CreateTagSchema.parse(req.body)
    const tag = await tagService.create(req.user.id, body)
    res.status(201).json({ data: tag })
  },

  async update(req: Request, res: Response) {
    const body = UpdateTagSchema.parse(req.body)
    const tag = await tagService.update(req.user.id, req.params.id as string, body)
    res.status(200).json({ data: tag })
  },

  async delete(req: Request, res: Response) {
    await tagService.delete(req.user.id, req.params.id as string)
    res.status(200).json({ data: { message: 'Tag deleted' } })
  },
}
