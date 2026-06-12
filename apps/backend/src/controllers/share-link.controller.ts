import { Request, Response } from 'express'
import { CreateShareLinkSchema } from '@note-app/shared'
import { shareLinkService } from '../services/share-link.service'

export const shareLinkController = {
  async create(req: Request, res: Response) {
    const body = CreateShareLinkSchema.parse(req.body ?? {})
    const link = await shareLinkService.create(req.user.id, req.params.id as string, body)
    res.status(201).json({ data: link })
  },

  async getPublic(req: Request, res: Response) {
    const note = await shareLinkService.getPublic(req.params.token as string)
    res.status(200).json({ data: note })
  },

  async revoke(req: Request, res: Response) {
    await shareLinkService.revoke(req.user.id, req.params.id as string)
    res.status(200).json({ data: { message: 'Share link revoked' } })
  },
}
