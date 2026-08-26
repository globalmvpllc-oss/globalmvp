const path = require('path');

/**
 * Security headers applied to every response.
 * CSP is intentionally NOT set here — it needs its own task with runtime
 * verification, since a wrong policy silently breaks the app.
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    /**
     * Browser capabilities this application never uses, switched off for every
     * origin including our own — an empty allowlist means not even a
     * same-origin script can prompt for them.
     *
     * Checked against the codebase before adding: no getUserMedia,
     * mediaDevices, geolocation, PaymentRequest, navigator.usb or motion /
     * orientation sensor use anywhere under app/, lib/, components/ or hooks/.
     *
     * fullscreen is deliberately absent. Nothing uses it today either, but the
     * browser's own print preview and chart interactions may legitimately want
     * it, and disabling something we might later rely on buys nothing.
     */
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), ' +
      'accelerometer=(), gyroscope=(), magnetometer=()',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.filename = 'static/chunks/[name]-[contenthash:8].js';
      config.output.chunkFilename = 'static/chunks/[contenthash:16].js';
    }
    return config;
  },
};

module.exports = nextConfig;
