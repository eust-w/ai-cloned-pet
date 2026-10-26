import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function providerNotConfigured(provider: string) {
  return new AppError(
    "PROVIDER_NOT_CONFIGURED",
    `${provider} is not configured. Add the required API key in the server environment.`,
    503,
    { provider }
  );
}

export function notFound(resource: string) {
  return new AppError("NOT_FOUND", `${resource} was not found.`, 404);
}

export function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues
      }
    });
  }

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return reply.status(500).send({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message
    }
  });
}
