'use client';

import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

/**
 * Error boundary for the authenticated application.
 *
 * Without one, a server component that throws is replaced by Next.js's own
 * "Application error: a server-side exception has occurred" — a blank page with
 * a digest and no way forward. That is what a missing database table produced
 * on the billing page.
 *
 * This keeps the user inside the application: the navigation is still there,
 * they can retry, and only the failing section is replaced.
 *
 * Deliberately says nothing about the cause. `error.message` from a server
 * component can carry database detail, so only the digest is shown — enough to
 * match against the server logs, useless to anyone else.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The full error is already in the server logs; this records that the
    // boundary caught it, without echoing the message into the console.
    console.error('[app] route error', { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-10 text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
          <h2 className="mb-1 font-medium">Something went wrong on our server</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            This page could not be loaded. Your data has not been changed.
          </p>
          <Button onClick={reset}>Try again</Button>
          {error.digest ? (
            <p className="mt-4 font-mono text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
