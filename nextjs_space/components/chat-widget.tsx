'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { CHAT_WIDGET_ELEMENT_IDS, showsChatWidget } from '@/lib/chat-widget';

const HIDDEN_ATTRIBUTE = 'data-chat-hidden';
const HIDE_RULE = CHAT_WIDGET_ELEMENT_IDS.map((id) => `html[${HIDDEN_ATTRIBUTE}] #${id}`).join(', ') + ' { display: none !important; }';

/**
 * The Webtochat bubble, on public pages only.
 *
 * The script is loaded only once someone is on a public page. Moving from a
 * public page into the app without a reload (the widget stays in <body>) sets
 * an attribute on <html> that hides the widget's elements, and moving back
 * shows them again — the widget's own open/closed state is left alone.
 */
export function ChatWidget({ src }: { src: string }) {
  const pathname = usePathname();
  const show = showsChatWidget(pathname);
  const [load, setLoad] = useState(show);

  useEffect(() => {
    if (show) setLoad(true);
    const root = document.documentElement;
    if (show) root.removeAttribute(HIDDEN_ATTRIBUTE);
    else root.setAttribute(HIDDEN_ATTRIBUTE, '');
  }, [show]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HIDE_RULE }} />
      {load && <Script src={src} strategy="afterInteractive" />}
    </>
  );
}
