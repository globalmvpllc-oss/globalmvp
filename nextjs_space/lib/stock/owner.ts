import { NextResponse } from 'next/server';

/**
 * Adding people, making someone a manager, changing a PIN and removing a
 * person belong to the account owner (signed in with email and password).
 * A PIN manager cannot do them, so one PIN manager cannot take over another.
 */
export function isAccountOwner(actor: { kind: 'user' | 'staff' }): boolean {
  return actor.kind === 'user';
}

export function ownerOnly() {
  return NextResponse.json({ error: 'Only the account owner can do this.', code: 'OWNER_ONLY' }, { status: 403 });
}
