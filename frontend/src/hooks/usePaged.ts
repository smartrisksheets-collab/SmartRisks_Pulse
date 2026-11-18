// src/hooks/usePaged.ts
// Client-side paging of rows a payload already holds. The page is clamped when
// the row count shrinks, so a refresh never shows an empty page.

import { useState } from 'react';
import { ANALYTICS_PAGE_SIZE } from '../utils/constants';

export interface PageState {
  page: number;
  pages: number;
  total: number;
  first: number;
  last: number;
  setPage: (n: number) => void;
}

export function usePaged<T>(rows: T[], size: number = ANALYTICS_PAGE_SIZE): PageState & { rows: T[] } {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  return {
    rows: rows.slice(start, start + size),
    page: current,
    pages,
    total: rows.length,
    first: start + 1,
    last: Math.min(start + size, rows.length),
    setPage,
  };
}
