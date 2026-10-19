import type { ReactNode } from 'react';

/** Renders **bold** spans as <strong> elements. No HTML strings, so nothing is injected. */
export function withBold(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}