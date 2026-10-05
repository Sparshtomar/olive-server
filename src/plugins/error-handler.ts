import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ERROR_CODES, type ApiErrorBody } from '@sparshtomar/olive-shared';
import { AppError } from '../lib/errors';

/** Every error leaves the API in one shape: `{ error: { code, message, details? } }`. */
export const registerErrorHandler = (app: FastifyInstance) => {
  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) request.log.warn({ code: err.code }, err.message);
      return reply.status(err.statusCode).send(body(err.code, err.message, err.details));
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      const first = err.validation[0];
      const message = first
        ? `${first.instancePath.replace(/^\//, '') || 'request'}: ${first.message}`
        : 'Invalid request';
      return reply.status(400).send(body(ERROR_CODES.VALIDATION, message, err.validation));
    }

    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send(body(ERROR_CODES.FILE_TOO_LARGE, 'That file is too large'));
    }

    if (err.statusCode === 429) {
      return reply.status(429).send(body(ERROR_CODES.RATE_LIMITED, 'Slow down a little — try again in a minute'));
    }

    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send(body(ERROR_CODES.VALIDATION, err.message));
    }

    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send(body(ERROR_CODES.INTERNAL, 'Something went wrong on our side'));
  });

  app.setNotFoundHandler((_request, reply) => reply.status(404).send(body(ERROR_CODES.NOT_FOUND, 'Route not found')));
};

const body = (code: ApiErrorBody['error']['code'], message: string, details?: unknown): ApiErrorBody => ({
  error: { code, message, ...(details === undefined ? {} : { details }) },
});
