import type { NormalizedBankTransaction } from './types';

/**
 * The seam a real bank connector plugs into.
 *
 * V1.1 ships one provider — "manual" — and deliberately does not require a bank
 * API. Everything above this file (the models, the import pipeline, the matcher,
 * the reconciliation screens) is written against `NormalizedBankTransaction`
 * rather than against any provider's payload shape, so adding Plaid, Wise or an
 * Open Banking connector later means:
 *
 *   1. a new module here that implements `BankProvider`,
 *   2. registering it in PROVIDERS below,
 *   3. whatever credential storage that provider needs.
 *
 * No schema change, no change to the matcher, no change to the UI. That is the
 * whole point of keeping this interface narrow: a provider's only job is to
 * hand back normalised lines.
 */
export interface BankProviderContext {
  /** The account being synced, as stored. */
  account: {
    id: string;
    provider: string;
    providerAccountId: string | null;
    currency: string;
    lastSyncedAt: Date | null;
  };
  /** Inclusive lower bound for the pull, when the caller wants one. */
  since?: Date;
}

export interface BankProvider {
  /** Registry key, stored in BankAccount.provider. */
  readonly id: string;
  /** Shown in the account form. */
  readonly label: string;
  /**
   * Whether this provider can pull transactions by itself.
   *
   * False for "manual", and the API uses it to answer "sync" requests with a
   * clear 400 instead of pretending a sync happened. A UI that offered a Sync
   * button which silently did nothing would be worse than no button.
   */
  readonly canSync: boolean;
  /** Whether accounts of this provider are created by the user by hand. */
  readonly manualEntry: boolean;
  fetchTransactions(context: BankProviderContext): Promise<NormalizedBankTransaction[]>;
}

/**
 * Manual accounts: statements arrive by CSV import or are typed in.
 *
 * `fetchTransactions` returns nothing rather than throwing, so a caller that
 * loops over accounts does not have to special-case this provider — but
 * `canSync` is false, which is what callers actually branch on.
 */
export const manualProvider: BankProvider = {
  id: 'manual',
  label: 'Manual / CSV import',
  canSync: false,
  manualEntry: true,
  async fetchTransactions() {
    return [];
  },
};

const PROVIDERS: Record<string, BankProvider> = {
  [manualProvider.id]: manualProvider,
};

/** Every registered provider, for the account form's picker. */
export function listProviders(): BankProvider[] {
  return Object.values(PROVIDERS);
}

/** Looks up a provider, or null when the key is not registered. */
export function getProvider(id: unknown): BankProvider | null {
  return typeof id === 'string' ? PROVIDERS[id] ?? null : null;
}

/** True when `id` names a provider this build knows about. */
export function isKnownProvider(id: unknown): boolean {
  return getProvider(id) !== null;
}

/** The provider used when none is given. */
export const DEFAULT_PROVIDER_ID = manualProvider.id;
