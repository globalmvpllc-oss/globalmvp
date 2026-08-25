'use client';

import { useEffect, useState } from 'react';

/**
 * Loads the signed-in user's company for display purposes.
 *
 * Several pages need the company name only to personalise headings and empty
 * states, and duplicating the fetch in each of them invites drift. The endpoint
 * is already scoped to the session's company, so there is nothing to pass in.
 *
 * Returns null while loading or if the request fails; callers fall back to
 * neutral wording rather than showing a placeholder.
 */
export function useCompany() {
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/company')
      .then((r: any) => (r.ok ? r.json() : null))
      .then((d: any) => { if (active) setCompany(d); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return company;
}
