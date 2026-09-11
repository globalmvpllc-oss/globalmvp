/**
 * The two globals the Google tag installs on `window`.
 *
 * Declared rather than imported from a package: the only code that touches
 * them is the consent banner, which pushes Consent Mode commands, and typing
 * the arguments any more precisely than this would mean restating Google's
 * command surface for no gain.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export {};
