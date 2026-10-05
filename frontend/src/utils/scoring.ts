// src/utils/scoring.ts
// Scores are computed only in the backend (services/risk.py _score).

// Index-based: 4=highest danger, 1=lowest. Works with any custom label.
export function levelIndexClass(index: number | null | undefined): string {
  switch (index) {
    case 5:  return 'level-extreme';
    case 4:  return 'level-critical';
    case 3:  return 'level-high';
    case 2:  return 'level-medium';
    case 1:  return 'level-low';
    default: return 'level-low';
  }
}

// Kept for non-risk badge use (e.g. incident severity strings)
export function levelClass(level: string | null | undefined): string {
  const l = (level ?? '').toLowerCase();
  if (l === 'critical' || l === 'very high') return 'level-critical';
  if (l === 'high')                          return 'level-high';
  if (l === 'medium')                        return 'level-medium';
  return 'level-low';
}

export function movementClass(movement: string | null | undefined): string {
  switch (movement) {
    case 'Increasing': return 'movement-increasing';
    case 'Improving':  return 'movement-improving';
    default:           return 'movement-stable';
  }
}

export function freshnessClass(freshness: string | null | undefined): string {
  switch (freshness) {
    case 'Fresh':       return 'freshness-fresh';
    case 'Aging':       return 'freshness-aging';
    case 'Stale':       return 'freshness-stale';
    case 'Unevidenced': return 'freshness-unevidenced';
    default:            return 'freshness-fresh';
  }
}