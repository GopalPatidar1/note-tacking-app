export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class EmailConflictError extends AppError {
  constructor() {
    super('Email already in use', 409, 'EMAIL_CONFLICT')
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super('Invalid email or password', 401, 'INVALID_CREDENTIALS')
  }
}

export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super('Refresh token is invalid or has expired', 401, 'INVALID_REFRESH_TOKEN')
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class ShareLinkInvalidError extends AppError {
  constructor(message = 'Share link not found or has expired') {
    super(message, 404, 'SHARE_LINK_INVALID')
  }
}
