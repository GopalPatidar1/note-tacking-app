import { Request, Response } from 'express'
import { CreateNoteSchema, UpdateNoteSchema, ListNotesQuerySchema } from '@note-app/shared'
import { noteService } from '../services/note.service'

export const noteController = {
  async list(req: Request, res: Response) {
    const query = ListNotesQuerySchema.parse(req.query)
    const result = await noteService.list(req.user.id, query)
    res.status(200).json({ data: result })
  },

  async create(req: Request, res: Response) {
    const body = CreateNoteSchema.parse(req.body)
    const note = await noteService.create(req.user.id, body)
    res.status(201).json({ data: note })
  },

  async getById(req: Request, res: Response) {
    const note = await noteService.getById(req.user.id, req.params.id as string)
    res.status(200).json({ data: note })
  },

  async update(req: Request, res: Response) {
    const body = UpdateNoteSchema.parse(req.body)
    const note = await noteService.update(req.user.id, req.params.id as string, body)
    res.status(200).json({ data: note })
  },

  async delete(req: Request, res: Response) {
    await noteService.delete(req.user.id, req.params.id as string)
    res.status(200).json({ data: { message: 'Note deleted' } })
  },
}
