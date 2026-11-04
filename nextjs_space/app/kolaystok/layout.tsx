import type { Metadata, Viewport } from 'next';

/**
 * Every Avc KolayStok page — the sign-in screens included — carries the web
 * app manifest, so a phone can add "Avc KolayStok" to its home screen from
 * the staff link itself.
 */
export const metadata: Metadata = {
  title: 'Avc KolayStok',
  applicationName: 'Avc KolayStok',
  manifest: '/kolaystok.webmanifest',
  appleWebApp: { capable: true, title: 'Avc KolayStok', statusBarStyle: 'default' },
  icons: { icon: '/kolaystok-icon-192.png', apple: '/kolaystok-icon-192.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f766e' };

export default function KolayStokRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
