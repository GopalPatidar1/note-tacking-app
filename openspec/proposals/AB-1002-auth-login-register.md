# Spec Proposal — AB-1002: Auth Login/Register

**Date:** 2026-06-09  
**Author:** gopalp@mindfiresolutions.com  
**Scope:** API contract + backend design  
**Status:** DRAFT

---

## 1. Summary

Implement user registration, login, logout, and refresh-token rotation. All auth state lives in:
- `users` table (identity + bcrypt password hash)
- `refresh_tokens` table (opaque rotating tokens)

Access tokens are short-lived JWTs (15 min). Refresh tokens are opaque 32-byte hex strings stored in the DB (7 days). Token rotation invalidates the old refresh token on every use.

---

## 2. OpenAPI Contract Delta

### 2a. Schema additions / changes

**New schema: `RefreshRequest`**
```yaml
RefreshRequest:
  type: object
  required: [refreshToken]
  properties:
    refreshToken:
      type: string
```

**Modified schema: `RegisterRequest`** — add `password.pattern` for complexity rule
```yaml
RegisterRequest:
  type: object
  required: [name, email, password]
  properties:
    name:
      type: string
      minLength: 1
      example: Alice
    email:
      type: string
      format: email
      example: alice@example.com
    password:
      type: string
      minLength: 8
      pattern: '^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+$'
      description: Must contain ≥1 uppercase letter, ≥1 digit, ≥1 special character
      example: s3cur3P@ss
```

### 2b. New path: `POST /auth/refresh`

```yaml
/auth/refresh:
  post:
    tags: [Auth]
    summary: Exchange a valid refresh token for a new token pair (rotation)
    operationId: refreshTokens
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/RefreshRequest"
    responses:
      "200":
        description: New token pair issued; old refresh token invalidated
        content:
          application/json:
            schema:
              type: object
              properties:
                data:
                  $ref: "#/components/schemas/AuthTokens"
      "400":
        $ref: "#/components/responses/ValidationError"
      "401":
        description: Refresh token not found, expired, or already rotated
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ErrorResponse"
            example:
              error:
                message: Refresh token is invalid or has expired
                code: INVALID_REFRESH_TOKEN
```

### 2c. Error codes inventory (auth domain)

| HTTP | Code | Trigger |
|------|------|---------|
| 409 | `EMAIL_CONFLICT` | Email already registered |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password at login |
| 401 | `INVALID_REFRESH_TOKEN` | Refresh token not found / expired / already rotated |
| 400 | `VALIDATION_ERROR` | Zod schema violation (existing response) |

---

## 3. Backend Design

### 3a. Layer breakdown

```
POST /auth/register
  → AuthController.register()
    → AuthService.register(dto)
      → UserRepository.findByEmail(email)       // 409 if found
      → bcrypt.hash(password, 12)
      → UserRepository.create({ name, email, passwordHash })
      → generateAccessToken(userId)
      → RefreshTokenRepository.create(userId)   // random 32-byte hex
      → return { accessToken, refreshToken, user }

POST /auth/login
  → AuthController.login()
    → AuthService.login(dto)
      → UserRepository.findByEmail(email)       // 401 if not found
      → bcrypt.compare(password, hash)          // 401 if mismatch
      → generateAccessToken(userId)
      → RefreshTokenRepository.create(userId)
      → return { accessToken, refreshToken, user }

POST /auth/logout
  → AuthController.logout()
    → AuthService.logout(dto)
      → RefreshTokenRepository.deleteByToken(refreshToken)
      // Always 200 — no error if token was already gone (idempotent)

POST /auth/refresh
  → AuthController.refresh()
    → AuthService.refresh(dto)
      → RefreshTokenRepository.findByToken(refreshToken)
        // 401 if not found or expiresAt < now
      → RefreshTokenRepository.deleteByToken(refreshToken)  // rotate: delete old
      → generateAccessToken(userId)
      → RefreshTokenRepository.create(userId)               // rotate: issue new
      → return { accessToken, refreshToken }
```

### 3b. File layout

```
apps/backend/src/
  controllers/
    auth.controller.ts       # parse → validate (Zod) → call service → respond
  services/
    auth.service.ts          # business logic, throws domain errors
  repositories/
    user.repository.ts       # Prisma queries on `users`
    refresh-token.repository.ts  # Prisma queries on `refresh_tokens`
  routes/
    auth.routes.ts           # express Router, rate-limiter middleware
  middleware/
    auth.middleware.ts       # verifyAccessToken — used by all protected routes
  errors/
    domain-errors.ts         # EmailConflictError, InvalidCredentialsError, InvalidRefreshTokenError

packages/shared/src/
  schemas/
    auth.ts                  # Zod schemas + inferred DTO types
  constants/
    auth.ts                  # TOKEN_EXPIRY_ACCESS, TOKEN_EXPIRY_REFRESH, BCRYPT_ROUNDS
```

### 3c. Zod schemas (packages/shared)

```typescript
// packages/shared/src/schemas/auth.ts
import { z } from 'zod'

const passwordSchema = z
  .string()
  .min(8)
  .regex(
    /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+$/,
    'Password must contain at least one uppercase letter, one digit, and one special character'
  )

export const RegisterRequestSchema = z.object({
  name:     z.string().min(1),
  email:    z.string().email(),
  password: passwordSchema,
})

export const LoginRequestSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(1),
})

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
})

// DTOs
export type RegisterRequestDTO  = z.infer<typeof RegisterRequestSchema>
export type LoginRequestDTO     = z.infer<typeof LoginRequestSchema>
export type LogoutRequestDTO    = z.infer<typeof LogoutRequestSchema>
export type RefreshRequestDTO   = z.infer<typeof RefreshRequestSchema>
```

### 3d. Constants (packages/shared)

```typescript
// packages/shared/src/constants/auth.ts
export const TOKEN_EXPIRY_ACCESS   = '15m'
export const TOKEN_EXPIRY_REFRESH  = '7d'
export const REFRESH_TOKEN_TTL_MS  = 7 * 24 * 60 * 60 * 1000
export const BCRYPT_ROUNDS         = 12
```

### 3e. Token generation

- **Access token**: `jwt.sign({ sub: userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' })`
- **Refresh token**: `crypto.randomBytes(32).toString('hex')` — stored as plain string; no JWT for refresh tokens (revocation must be instant via DB lookup)

### 3f. Rate limiting

Applied via `express-rate-limit` on the `/auth/*` router:
- Window: 15 minutes
- Max: 20 requests per IP
- Applies to: register, login, forgot-password, reset-password, refresh

Logout is excluded (idempotent, no brute-force vector).

### 3g. Error mapping (service → HTTP)

| Domain error class | HTTP | code |
|--------------------|------|------|
| `EmailConflictError` | 409 | `EMAIL_CONFLICT` |
| `InvalidCredentialsError` | 401 | `INVALID_CREDENTIALS` |
| `InvalidRefreshTokenError` | 401 | `INVALID_REFRESH_TOKEN` |
| `ZodError` (caught in controller) | 400 | `VALIDATION_ERROR` |

### 3h. Logout idempotency decision

`POST /auth/logout` always returns `200` even if the refresh token row is not found. Rationale: the desired post-condition (token is gone) is already satisfied; surfacing an error would break clients retrying after a network failure.

---

## 4. DB notes

- `refresh_tokens.expiresAt` = `now() + 7 days` set at INSERT time (application layer, not DB default)
- Index on `refresh_tokens.token` (unique, for O(1) lookup on every request that bears a refresh token)
- Index on `refresh_tokens.userId` (for `DELETE WHERE userId = ?` on account deletion — future scope)
- No additional migration changes to `users` table beyond what the Prisma schema already defines

---

## 5. Out of scope for this ticket

- `POST /auth/forgot-password` / `POST /auth/reset-password` → AB-1003
- `GET /auth/me` (profile endpoint) — not in FRS; defer
- OAuth — explicitly out of scope per FRS

---

## 6. Open questions (resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Include `/auth/refresh`? | **Yes** — rotation on use requires a dedicated endpoint |
| 2 | Password complexity beyond minLength:8? | **Yes** — ≥1 uppercase, ≥1 digit, ≥1 special char |
| 3 | Logout behaviour when token already gone? | **Idempotent 200** — desired state already achieved |
