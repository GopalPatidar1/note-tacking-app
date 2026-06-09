import { prisma } from '../lib/prisma'

export const refreshTokenRepository = {
  create(userId: string, token: string, expiresAt: Date) {
    return prisma.refreshToken.create({ data: { userId, token, expiresAt } })
  },

  findByToken(token: string) {
    return prisma.refreshToken.findUnique({ where: { token } })
  },

  deleteByToken(token: string) {
    return prisma.refreshToken.deleteMany({ where: { token } })
  },
}
