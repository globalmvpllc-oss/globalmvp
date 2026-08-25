import { Building2, Cloud, KeyRound, Lock } from 'lucide-react';
import { Section, SectionHeading } from '@/components/marketing/section';

/**
 * Every claim here maps to something implemented in the application:
 * hashed credentials, session-derived company scoping on every query,
 * TLS-only hosting, and cloud access with no local install.
 * No compliance certifications are claimed, because none have been obtained.
 */
const POINTS = [
  {
    icon: KeyRound,
    title: 'Secure authentication',
    body: 'Passwords are hashed, never stored as text, and sessions are signed.',
  },
  {
    icon: Building2,
    title: 'Company-level separation',
    body: 'Every record is scoped to your business. Requests can only reach your own data.',
  },
  {
    icon: Lock,
    title: 'Encrypted in transit',
    body: 'The application is served over HTTPS and connects to its database over TLS.',
  },
  {
    icon: Cloud,
    title: 'Access from anywhere',
    body: 'Runs in the browser on any modern device. Nothing to install or keep updated.',
  },
];

export function SecuritySection() {
  return (
    <Section className="border-b border-border bg-muted/30" aria-labelledby="security-heading">
      <SectionHeading
        id="security-heading"
        eyebrow="Trust"
        title="Your business data stays yours"
        description="We describe only what the product actually does. No certifications are claimed that have not been earned."
      />

      <ul className="mt-14 grid gap-6 sm:grid-cols-2">
        {POINTS.map((point) => (
          <li key={point.title} className="flex gap-4 rounded-xl border border-border bg-card p-6">
            <point.icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">{point.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
