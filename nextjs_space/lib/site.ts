/**
 * Canonical site configuration for marketing pages and SEO.
 *
 * The base URL is taken from the existing NEXTAUTH_URL environment variable,
 * which already holds the deployment's canonical origin. No production domain
 * is hardcoded here.
 */
export const siteConfig = {
  name: 'CorpControl',
  tagline: 'Run your business finances without the complexity',
  description:
    'CorpControl keeps invoices, customers, income, expenses and payments in one simple workspace, so small businesses always know where their money stands.',
} as const;

/**
 * The legal entity behind the CorpControl brand, and the contact channels it
 * publishes.
 *
 * Every page that names the operator — the legal pages, /contact, and anything
 * an advertising review reads — must take the values from here rather than
 * repeat them, so a change of address or number is one edit.
 *
 * Only details that are actually held are recorded. No tax number, no
 * registration number and no bank detail belongs in this file or in any page
 * that reads it.
 */
export const companyInfo = {
  /** Trading name shown to users. */
  brand: 'CorpControl',
  /** Registered legal entity that operates the service. */
  legalName: 'AVC TRADE LLC',
  entityType: 'LLC',
  address: {
    street: '30 N Gould St',
    suite: 'Ste 43070',
    city: 'Sheridan',
    state: 'WY',
    postalCode: '82801',
    country: 'United States',
    countryCode: 'US',
  },
  email: 'info@corpcontrol.net',
  /** Display form. `phoneHref` carries the E.164 form used by tel: links. */
  phone: '+1 (917) 722-8464',
  phoneHref: '+19177228464',
} as const;

/** One-line postal address, e.g. for inline prose and structured data. */
export const companyAddressLine = [
  companyInfo.address.street,
  companyInfo.address.suite,
  `${companyInfo.address.city}, ${companyInfo.address.state} ${companyInfo.address.postalCode}`,
  companyInfo.address.country,
].join(', ');

/** `mailto:` target for the published contact address. */
export const companyMailto = `mailto:${companyInfo.email}`;

/**
 * `mailto:` target carrying a pre-filled subject line.
 *
 * One published address handles every kind of enquiry, so the subject is what
 * sorts them once they arrive. The subject is encoded rather than interpolated
 * raw: a space or an ampersand in it would otherwise break the URL.
 */
export function companyMailtoWithSubject(subject: string): string {
  return `${companyMailto}?subject=${encodeURIComponent(subject)}`;
}

/** `tel:` target for the published phone number. */
export const companyTel = `tel:${companyInfo.phoneHref}`;

export function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}
