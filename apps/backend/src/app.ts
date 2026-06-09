import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import authRouter from './routes/auth.routes'
import { errorHandler } from './middleware/error.middleware'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors())
  app.use(express.json())

  app.use('/api/auth', authRouter)

  app.use(errorHandler)

  return app
}
