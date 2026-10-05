import { ERROR_CODES, type ErrorCode } from '@sparshtomar/olive-shared';

/**
 * Errors the API expects and knows how to explain. Anything else is a 500.
 * `code` is part of the API contract — the app maps it to copy and a recovery action.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly statusCode: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(ERROR_CODES.NOT_FOUND, `${what} not found`, 404);

export const unknownUser = () =>
  new AppError(ERROR_CODES.UNKNOWN_USER, 'This device is not linked to an Olive profile', 401);

export const validation = (message: string, details?: unknown) =>
  new AppError(ERROR_CODES.VALIDATION, message, 400, details);

export const unsupportedFile = (message: string) => new AppError(ERROR_CODES.UNSUPPORTED_FILE, message, 415);

export const fileTooLarge = (maxMb: number) =>
  new AppError(ERROR_CODES.FILE_TOO_LARGE, `Files up to ${maxMb} MB are supported`, 413);

export const notFood = (message: string) => new AppError(ERROR_CODES.NOT_FOOD, message, 422);

export const notAReport = (message: string) => new AppError(ERROR_CODES.NOT_A_REPORT, message, 422);

/** Every model in the fallback chain is rate-limited or down. Retrying later will work. */
export const aiBusy = () =>
  new AppError(ERROR_CODES.AI_BUSY, 'Olive is getting a lot of requests right now. Try again in a minute.', 503);

/** The model answered but the answer was unusable. */
export const aiFailed = (message = "Olive couldn't make sense of that one") =>
  new AppError(ERROR_CODES.AI_FAILED, message, 502);
