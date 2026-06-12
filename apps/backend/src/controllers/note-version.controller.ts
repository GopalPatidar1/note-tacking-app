import { type Request, type Response } from 'express'
import { z, ListVersionsQuerySchema }  from '@note-app/shared'
import { noteVersionService }          from '../services/note-version.service'

const uuidSchema = z.string().uuid()

export const noteVersionController = {
  async list(req: Request, res: Response) {
    const noteId = uuidSchema.parse(req.params.id)
    const query  = ListVersionsQuerySchema.parse(req.query)
    const result = await noteVersionService.list(req.user.id, noteId, query)
    res.status(200).json({ data: result })
  },

  async getById(req: Request, res: Response) {
    const noteId    = uuidSchema.parse(req.params.id)
    const versionId = uuidSchema.parse(req.params.versionId)
    const result    = await noteVersionService.getById(req.user.id, noteId, versionId)
    res.status(200).json({ data: result })
  },

  async restore(req: Request, res: Response) {
    const noteId    = uuidSchema.parse(req.params.id)
    const versionId = uuidSchema.parse(req.params.versionId)
    const note      = await noteVersionService.restore(req.user.id, noteId, versionId)
    res.status(200).json({ data: note })
  },
}
