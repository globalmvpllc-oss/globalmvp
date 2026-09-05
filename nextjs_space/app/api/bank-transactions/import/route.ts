export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserCompany } from '@/lib/auth-helpers';
import { bankImportSchema, validateBody } from '@/lib/validation';
import { handleApiError } from '@/lib/api-error';
import { parseCalendarDate } from '@/lib/calendar-date';
import { CURRENCIES } from '@/lib/currencies';
import {
  MAX_IMPORT_ROWS,
  assignExternalIds,
  importFromCsv,
  normalizeRow,
  type ImportRowError,
} from '@/lib/banking/import';
import type { NormalizedBankTransaction } from '@/lib/banking/types';
import { autoMatchTransactions } from '@/lib/banking/auto-match';

/**
 * Importing a statement.
 *
 * Idempotent by construction: every row carries an `externalId` — the file's own
 * if it has one, otherwise a fingerprint from lib/banking/import.ts — and
 * `@@unique([bankAccountId, externalId])` makes a re-import of the same file
 * update nothing rather than double every line. `skipDuplicates` on the bulk
 * insert is what turns that constraint from an error into a no-op.
 *
 * Rows that cannot be read do not fail the import. A statement with one
 * malformed line should still bring in the other four hundred, and the rejected
 * lines are returned with their line numbers so the user can see exactly what
 * was left out.
 */

const ALLOWED_CURRENCIES = CURRENCIES.map((c) => c.code);

export async function POST(request: Request) {
  try {
    const { error: authError, companyId } = await requireUserCompany();
    if (authError) return authError;

    const body = await request.json();
    const { data, error } = validateBody(bankImportSchema, body);
    if (error) return NextResponse.json(error, { status: 400 });

    const account = await prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, companyId },
      select: { id: true, currency: true },
    });
    if (!account) {
      return NextResponse.json(
        { error: 'Bank account not found or not owned by your company' },
        { status: 404 }
      );
    }

    const options = {
      defaultCurrency: account.currency,
      allowedCurrencies: ALLOWED_CURRENCIES,
    };

    let rows: NormalizedBankTransaction[];
    let errors: ImportRowError[];

    if (data.csv) {
      ({ rows, errors } = importFromCsv(data.csv, options));
    } else {
      // The structured path: already-split rows, as a provider connector would
      // produce. Same normaliser, so both get identical validation.
      const parsed: NormalizedBankTransaction[] = [];
      errors = [];
      (data.rows ?? []).slice(0, MAX_IMPORT_ROWS).forEach((raw, index) => {
        const result = normalizeRow(raw as Record<string, unknown>, options);
        if (result.row === null) errors.push({ line: index + 1, message: result.error });
        else parsed.push(result.row);
      });
      rows = assignExternalIds(parsed);
    }

    // A line in another currency could never be reconciled against anything in
    // this account, so it is reported rather than stored where it would sit
    // unmatched forever with no explanation.
    const usable: NormalizedBankTransaction[] = [];
    rows.forEach((row, index) => {
      if (row.currency !== account.currency) {
        errors.push({
          line: index + 2,
          message: `Row is in ${row.currency}; this account is in ${account.currency}`,
        });
        return;
      }
      usable.push(row);
    });

    if (usable.length === 0) {
      return NextResponse.json(
        { imported: 0, duplicates: 0, errors, message: 'No usable rows found' },
        // Not an error: an empty statement is a legitimate answer, and the row
        // errors explain what happened.
        { status: 200 }
      );
    }

    const created = await prisma.bankTransaction.createMany({
      data: usable.map((row) => ({
        companyId,
        bankAccountId: account.id,
        // Non-null: importFromCsv only emits rows whose date already parsed.
        date: parseCalendarDate(row.date) as Date,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        direction: row.direction,
        balance: row.balance ?? null,
        reference: row.reference ?? null,
        externalId: row.externalId ?? null,
        status: 'UNMATCHED',
      })),
      // Rows already present are skipped on the unique index rather than
      // aborting the whole insert. This is what makes a re-import safe.
      skipDuplicates: true,
    });

    const duplicates = usable.length - created.count;

    const balanceUpdate =
      data.closingBalance === undefined
        ? {}
        : { lastBalance: data.closingBalance, lastBalanceAt: new Date() };

    await prisma.bankAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), ...balanceUpdate },
    });

    // Auto-matching is opt-in and runs after the insert, so a failure there
    // cannot lose the imported lines — they are already stored and can be
    // matched by hand.
    const autoMatched = data.autoMatch
      ? await autoMatchTransactions({ companyId, bankAccountId: account.id })
      : { matched: 0, considered: 0 };

    return NextResponse.json({
      imported: created.count,
      duplicates,
      errors,
      autoMatched: autoMatched.matched,
      considered: autoMatched.considered,
    });
  } catch (error) {
    return handleApiError('bank-transactions/import:POST', error, {
      conflictMessage: 'Some of these transactions have already been imported',
      fallbackMessage: 'Failed to import transactions',
    });
  }
}
