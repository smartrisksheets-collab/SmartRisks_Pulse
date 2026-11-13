// Where each Home item opens. Paths only; the backend decides what is listed.
import type { HomeAction, HomeSetup } from '../../types/home';

export const riskPath = (id: string) => `/risks?risk=${encodeURIComponent(id)}`;
export const incidentPath = (id: string) => `/incidents?incident=${encodeURIComponent(id)}`;

export function actionLink(a: HomeAction): { to: string; label: string } {
  const ref = a.refs[0] ?? '';
  switch (a.target_kind) {
    case 'risk': return { to: riskPath(ref), label: `Open ${ref}` };
    case 'incident': return { to: incidentPath(ref), label: `Open ${ref}` };
    case 'risks': return { to: '/risks', label: `Review ${a.refs.length} risks` };
    case 'incidents': return { to: '/incidents', label: `Review ${a.refs.length} incidents` };
    case 'category': return { to: `/risks?new=1&category=${encodeURIComponent(ref)}`, label: 'Add a risk' };
    default: return { to: '/analytics#correlation', label: 'See the detail' };
  }
}

export function initialsOf(text: string | null | undefined): string {
  const parts = String(text ?? '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2);
  return s.toUpperCase();
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(d: Date): DayPart {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

// Share of first-time setup steps done, for the hero progress bar.
export function setupProgress(setup: HomeSetup, hasRisk: boolean, hasIncident: boolean): number {
  const flags = [true, ...(hasRisk ? [setup.appetite, setup.risks] : []), ...(hasIncident ? [setup.incidents] : []), setup.team];
  return Math.round((flags.filter(Boolean).length / flags.length) * 100);
}

// The 60-second tour steps, in page order.
export interface TourStep { id: string; title: string; text: string }

export const TOUR_STEPS: TourStep[] = [
  { id: 'sec-verdict', title: 'Start with the verdict', text: 'One sentence tells you whether the organisation is inside its risk appetite, and what is holding the score down.' },
  { id: 'sec-kpis', title: 'Four numbers that matter', text: 'Health score, risks outside appetite, open incidents and open actions. Click any tile to see the list behind it.' },
  { id: 'sec-actions', title: 'What to do next', text: 'Pulse turns the figures above into specific actions. The first one is highlighted; do that first.' },
  { id: 'sec-where', title: 'Where the risk sits', text: 'Top risks beside open incidents. The grey tags show where the two logs do not line up yet.' },
  { id: 'sec-brief', title: 'The executive brief', text: 'A plain-English summary for the board, with how much confidence the score carries. That is the 60 seconds.' },
];
