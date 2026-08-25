/**
 * Keyboard-only escape hatch past the header navigation.
 *
 * Hidden until it receives focus, at which point it pins itself to the top
 * left of the viewport. Points at the <main id="main"> element that every
 * public page already renders.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      Skip to content
    </a>
  );
}
