export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { signupSchema, validateBody } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data, error } = validateBody(signupSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 });
    }
    const hashedPassword = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: { email: data.email, hashedPassword, name: data.name ?? '' },
    });
    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
