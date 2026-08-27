import { describe, it, expect } from 'vitest';
import {
  MEMBER_ROLES,
  isMemberRole,
  blockRoleChange,
  blockRemoval,
  blockActiveChange,
} from '@/lib/admin/member-rules';

/**
 * The invariants the admin membership mutations must never break.
 *
 * A company must always keep an owner and at least one member, and an
 * administrator must not be able to lock themselves out. These are pinned here
 * so a change to a route cannot quietly drop a guard.
 */

describe('member roles', () => {
  it.each(['owner', 'admin', 'member'])('accepts %s', (role) => {
    expect(isMemberRole(role)).toBe(true);
  });

  it.each(['superuser', '', 'Owner', null, undefined, 42, {}])('rejects %s', (value) => {
    expect(isMemberRole(value)).toBe(false);
  });

  it('exposes exactly the assignable roles', () => {
    expect([...MEMBER_ROLES]).toEqual(['owner', 'admin', 'member']);
  });
});

describe('blockRoleChange', () => {
  it('allows promoting a member to owner', () => {
    expect(blockRoleChange({ currentRole: 'member', newRole: 'owner', ownerCount: 1 })).toBeNull();
  });

  it('allows demoting an owner while another owner remains', () => {
    expect(blockRoleChange({ currentRole: 'owner', newRole: 'member', ownerCount: 2 })).toBeNull();
  });

  it('refuses demoting the only owner', () => {
    const reason = blockRoleChange({ currentRole: 'owner', newRole: 'member', ownerCount: 1 });
    expect(reason).toContain('only owner');
  });

  it('is a no-op for an unchanged role even if last owner', () => {
    expect(blockRoleChange({ currentRole: 'owner', newRole: 'owner', ownerCount: 1 })).toBeNull();
  });

  it('rejects an unknown target role', () => {
    expect(blockRoleChange({ currentRole: 'member', newRole: 'root', ownerCount: 2 })).toContain('role');
  });
});

describe('blockRemoval', () => {
  it('allows removing a member when others remain', () => {
    expect(blockRemoval({ role: 'member', memberCount: 3, ownerCount: 1 })).toBeNull();
  });

  it('refuses removing the only member', () => {
    expect(blockRemoval({ role: 'owner', memberCount: 1, ownerCount: 1 })).toContain('only member');
  });

  it('refuses removing the only owner even when other members exist', () => {
    const reason = blockRemoval({ role: 'owner', memberCount: 3, ownerCount: 1 });
    expect(reason).toContain('only owner');
  });

  it('allows removing an owner when another owner remains', () => {
    expect(blockRemoval({ role: 'owner', memberCount: 3, ownerCount: 2 })).toBeNull();
  });
});

describe('blockActiveChange', () => {
  it('refuses an admin deactivating their own account', () => {
    const reason = blockActiveChange({ targetUserId: 'u1', adminUserId: 'u1', isActive: false });
    expect(reason).toContain('your own account');
  });

  it('allows an admin reactivating their own account', () => {
    expect(blockActiveChange({ targetUserId: 'u1', adminUserId: 'u1', isActive: true })).toBeNull();
  });

  it('allows deactivating a different user', () => {
    expect(blockActiveChange({ targetUserId: 'u2', adminUserId: 'u1', isActive: false })).toBeNull();
  });
});
