/** Errors whose message is safe to show to end users. Anything else is logged and replaced. */
export class AppError extends Error {
  constructor(message: string, public code: string = "BAD_REQUEST", public status = 400) {
    super(message);
    this.name = "AppError";
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, "FORBIDDEN", 403);
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, "NOT_FOUND", 404);
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export function publicMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  console.error(err);
  return "Something went wrong. Please try again or contact support.";
}
