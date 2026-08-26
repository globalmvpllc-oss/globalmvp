export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { signupSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { checkRateLimit, clientKey, SIGNUP_RULE } from '@/lib/rate-limit';

const DUPLICATE_MESSAGE = 'An account with this email already exists';

export async function POST(request: Request) {
  try {
    // Checked before any parsing or hashing, so a blocked caller costs nothing.
    const limit = checkRateLimit(clientKey(request, 'signup'), SIGNUP_RULE);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-up attempts. Please wait a few minutes and try again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    // signupSchema trims + lowercases the email, so "Test@Example.COM" and
    // "test@example.com" can no longer become two separate accounts.
    const { data, error } = validateBody(signupSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const hashedPassword = await bcrypt.hash(data.password, 12);

    // No pre-flight existence check: it was a TOCTOU window between the read and
    // the insert. The unique index on User.email is authoritative, and a
    // violation is translated to 409 rather than a generic 500.
    const user = await prisma.user.create({
      data: { email: data.email, hashedPassword, name: data.name ?? '' },
      select: { id: true, email: true },
    });

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (error) {
    return handleApiError('signup:POST', error, {
      conflictMessage: DUPLICATE_MESSAGE,
      fallbackMessage: 'Failed to create account',
    });
  }
}
