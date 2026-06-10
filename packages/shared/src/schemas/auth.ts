import { z } from 'zod'
import type { UserPublic } from '../types/user'

const passwordSchema = z
  .string()
  .min(8)
  .regex(
    /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+$/,
    'Password must contain at least one uppercase letter, one digit, and one special character'
  )

export const RegisterRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
})

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
})

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
})

export type RegisterRequestDTO = z.infer<typeof RegisterRequestSchema>
export type LoginRequestDTO = z.infer<typeof LoginRequestSchema>
export type LogoutRequestDTO = z.infer<typeof LogoutRequestSchema>
export type RefreshRequestDTO = z.infer<typeof RefreshRequestSchema>

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email(),
})

export const ResetPasswordRequestSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(1),
  newPassword: passwordSchema,
})

export type ForgotPasswordRequestDTO = z.infer<typeof ForgotPasswordRequestSchema>
export type ResetPasswordRequestDTO = z.infer<typeof ResetPasswordRequestSchema>

export interface AuthResponseDTO {
  accessToken: string
  refreshToken: string
  user: UserPublic
}

export interface RefreshResponseDTO {
  accessToken: string
  refreshToken: string
}
