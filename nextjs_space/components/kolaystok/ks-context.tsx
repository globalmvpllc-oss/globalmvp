'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** What the signed-in KolayStok user may do, decided on the server. */
export interface KsSession {
  name: string;
  kind: 'user' | 'staff';
  role: 'manager' | 'staff' | 'viewer';
  companyName: string;
  currency: string;
  permissions: {
    prices: boolean;
    move: boolean;
    count: boolean;
    products: boolean;
    suppliers: boolean;
    settings: boolean;
    orderEmail: boolean;
    export: boolean;
    reset: boolean;
  };
}

const Ctx = createContext<KsSession | null>(null);

export function KsProvider({ value, children }: { value: KsSession; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKs(): KsSession {
  const value = useContext(Ctx);
  if (!value) throw new Error('useKs outside KolayStok');
  return value;
}
