// Typed application errors. Services return `Result` (utils/result.ts); only
// boundaries (routes, consumers) throw/catch an AppError. Each class carries a
// stable machine-readable `code` (a DomainCode in errorRegistry) + HTTP status.

export class AppError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details: Record<string, string[]> | undefined

  constructor(message: string, code: string, statusCode: number, details?: Record<string, string[]>) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', 422, details)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404)
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, code, 409)
  }
}

export class AuthError extends AppError {
  constructor(message = 'Not authenticated') {
    super(message, 'UNAUTHORIZED', 401)
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403)
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
