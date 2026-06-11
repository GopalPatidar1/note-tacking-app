import express, { type Application } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import authRouter from './routes/auth.routes'
import noteRouter from './routes/note.routes'
import tagRouter from './routes/tag.routes'
import { errorHandler } from './middleware/error.middleware'

export function createApp(): Application {
  const app = express()

  app.use(helmet())
  app.use(cors())
  app.use(express.json())

  app.use('/api/auth', authRouter)
  app.use('/api/notes', noteRouter)
  app.use('/api/tags', tagRouter)

  app.use(errorHandler)

  return app
}
