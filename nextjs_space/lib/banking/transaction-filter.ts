import { UNRECONCILED_WHERE } from './reconciliation';

/**
 * The bank-line filter the reconciliation screen uses, as a Prisma `where`.
 *
 * Shared by `GET /api/bank-transactions` and the reconciliation PDF so the
 * document lists exactly the lines the screen shows for the same choice.
 * Always scoped by the session's companyId.
 */
export function bankTransactionWhere(
  companyId: string,
  filter: { bankAccountId?: string | null; status?: string | null; search?: string | null }
): Record<string, unknown> {
  const where: Record<string, unknown> = { companyId };
  if (filter.bankAccountId) where.bankAccountId = filter.bankAccountId;

  // "unmatched" is asked as a query about links rather than about the status
  // column, so a row whose matched record was deleted comes back into the
  // queue instead of being hidden as MATCHED forever.
  const status = filter.status ?? undefined;
  if (status === 'UNMATCHED') Object.assign(where, UNRECONCILED_WHERE);
  else if (status === 'IGNORED') where.status = 'IGNORED';
  else if (status === 'MATCHED') {
    where.status = { not: 'IGNORED' };
    where.OR = [
      { matchedInvoiceId: { not: null } },
      { matchedPaymentId: { not: null } },
      { matchedIncomeId: { not: null } },
      { matchedExpenseId: { not: null } },
    ];
  }

  const search = filter.search?.trim() ?? '';
  if (search) {
    // `where.OR` is only set by the MATCHED branch above, which is mutually
    // exclusive with a search in practice; AND-ing keeps them composable
    // rather than one silently replacing the other.
    const searchClause = [
      { description: { contains: search, mode: 'insensitive' as const } },
      { reference: { contains: search, mode: 'insensitive' as const } },
    ];
    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchClause }];
      delete where.OR;
    } else {
      where.OR = searchClause;
    }
  }
  return where;
}
