import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { showsChatWidget, CHAT_WIDGET_ELEMENT_IDS } from '@/lib/chat-widget';

const src = (file: string) => readFileSync(path.join(path.resolve(__dirname, '../..'), file), 'utf-8');

describe('the support bubble appears on public pages only', () => {
  it('shows on home, pricing, landing, contact, legal, sign-in and sign-up', () => {
    for (const p of ['/', '/pricing', '/finance', '/invoicing', '/expense-tracking', '/contact', '/privacy', '/terms', '/cookies', '/kvkk', '/refund', '/auth/login', '/auth/signup', '/pricing/']) {
      expect(showsChatWidget(p), p).toBe(true);
    }
  });

  it('never in the signed-in app or on any KolayStok screen', () => {
    for (const p of ['/dashboard', '/settings', '/settings/billing', '/reports', '/invoices/abc', '/customers', '/onboarding', '/admin', '/admin/companies/x', '/invite/tok', '/kolaystok', '/kolaystok/app', '/kolaystok/app/settings', '/kolaystok/abc123staff', '/pricingx', null, '']) {
      expect(showsChatWidget(p as any), String(p)).toBe(false);
    }
  });

  it('the root layout uses the gated component, not a bare script', () => {
    const layout = src('app/layout.tsx');
    expect(layout).toContain('<ChatWidget src=');
    expect(layout).not.toContain("from 'next/script'");
  });

  it('hides the widget elements when leaving a public page without a reload', () => {
    const component = src('components/chat-widget.tsx');
    expect(CHAT_WIDGET_ELEMENT_IDS).toEqual(['ai-chatbot-widget', 'ai-greet']);
    expect(component).toContain('data-chat-hidden');
    expect(component).toContain('display: none !important');
  });
});
