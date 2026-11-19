// src/components/ui/Pager.tsx
// Previous and Next controls under a table paged by usePaged. Every table that
// can hold more than TABLE_PAGE_SIZE rows renders this below it. Hidden when
// everything fits on one page.

import type { PageState } from '../../hooks/usePaged';

export function Pager({ p }: { p: PageState }) {
  if (p.pages <= 1) return null;
  return (
    <div className="pl-pager">
      <span className="pl-caption">Showing {p.first} to {p.last} of {p.total}</span>
      <span className="pl-inline">
        <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" disabled={p.page <= 1} onClick={() => p.setPage(p.page - 1)}>Previous</button>
        <span className="pl-caption">Page {p.page} of {p.pages}</span>
        <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" disabled={p.page >= p.pages} onClick={() => p.setPage(p.page + 1)}>Next</button>
      </span>
    </div>
  );
}
