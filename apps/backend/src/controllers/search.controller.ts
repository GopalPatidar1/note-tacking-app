import { Request, Response } from 'express'
import { SearchQuerySchema } from '@note-app/shared'
import { searchService } from '../services/search.service'

export const searchController = {
  async search(req: Request, res: Response) {
    const query = SearchQuerySchema.parse(req.query)
    const result = await searchService.search(req.user.id, query)
    res.status(200).json({ data: result })
  },
}
