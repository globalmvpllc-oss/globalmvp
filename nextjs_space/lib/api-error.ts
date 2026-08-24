import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * Centralised API error handling.
 *
 * Two goals:
 *  1. Map known error classes to correct HTTP status codes — a unique-constraint
 *     violation is a client conflict (409), not a server failure (500).
 *  2. Never leak internals to the client: no stack traces, no Prisma messages,
 *     no connection strings.
 *
 * Prisma errors are detected structurally (via `code` + `clientVersion`) rather
 * than with `instanceof Prisma.PrismaClientKnownRequestError`. Behaviour is
 * identical at runtime, but it keeps this module independent of the generated
 * client, so it type-checks even before `prisma generate` has run.
 */

interface PrismaLikeError {
  code: string;
  clientVersion: string;
  meta?: Record<string, unknown>;
}

function isPrismaKnownError(error: unknown): error is PrismaLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { clientVersion?: unknown }).clientVersion === 'string'
  );
}

/** Strips anything resembling a database URL, bearer token or password. */
export function redactSecrets(input: string): string {
  return input
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
    .replace(/(password=)[^\s&"']+/gi, '$1[REDACTED]');
}

/** Logs an error server-side without ever emitting secrets. */
export function logApiError(context: string, error: unknown): void {
  let detail: string;

  if (isPrismaKnownError(error)) {
    // Prisma initialisation errors can embed the full DATABASE_URL in `message`.
    // Only the code is ever safe to log.
    detail = `PrismaError code=${error.code}`;
  } else if (error instanceof ZodError) {
    detail = `ZodError issues=${error.issues.length}`;
  } else if (error instanceof Error) {
    detail = `${error.name}: ${redactSecrets(error.message)}`;
  } else {
    detail = 'Unknown error';
  }

  console.error(`[${context}] ${detail}`);
}

export interface ApiErrorOptions {
  /** Message returned for P2002 (unique constraint violation). */
  conflictMessage?: string;
  /** Message returned for P2025 (record not found). */
  notFoundMessage?: string;
  /** Message returned for anything unmapped. */
  fallbackMessage?: string;
}

/**
 * Converts an unknown thrown value into a safe NextResponse.
 * Always logs (redacted) before returning.
 */
export function handleApiError(
  context: string,
  error: unknown,
  options: ApiErrorOptions = {}
): NextResponse {
  logApiError(context, error);

  const {
    conflictMessage = 'A record with these values already exists',
    notFoundMessage = 'Not found',
    fallbackMessage = 'Failed',
  } = options;

  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }

  if (isPrismaKnownError(error)) {
    switch (error.code) {
      case 'P2002': // Unique constraint failed
        return NextResponse.json({ error: conflictMessage }, { status: 409 });
      case 'P2025': // Record required but not found
        return NextResponse.json({ error: notFoundMessage }, { status: 404 });
      case 'P2003': // Foreign key constraint failed
        return NextResponse.json({ error: 'Related record does not exist' }, { status: 400 });
      case 'P2028': // Transaction API error
      case 'P2034': // Write conflict / deadlock — serializable transaction lost the race
        return NextResponse.json(
          { error: 'This record was modified concurrently. Please try again.' },
          { status: 409 }
        );
      default:
        return NextResponse.json({ error: fallbackMessage }, { status: 500 });
    }
  }

  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

/** True when the error is a serialization failure the caller may want to surface as 409. */
export function isWriteConflict(error: unknown): boolean {
  return isPrismaKnownError(error) && (error.code === 'P2034' || error.code === 'P2028');
}
