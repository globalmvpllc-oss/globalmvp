/**
 * Canonical site configuration for marketing pages and SEO.
 *
 * The base URL is taken from the existing NEXTAUTH_URL environment variable,
 * which already holds the deployment's canonical origin. No production domain
 * is hardcoded here.
 */
export const siteConfig = {
  name: 'FinanceFlow',
  tagline: 'Run your business finances without the complexity',
  description:
    'FinanceFlow keeps invoices, customers, income, expenses and payments in one simple workspace, so small businesses always know where their money stands.',
} as const;

export function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}
