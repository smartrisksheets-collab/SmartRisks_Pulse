// src/utils/scoring.ts

import type { RiskLevel } from '../types/risk';

export interface ScorePreview {
  severity:     number;
  residual:     number;
  overallRating: number;
  level:        RiskLevel;
}

export function computeScore(
  likelihood:          number,
  impactScore:         number,
  controlEffectiveness: number | null | undefined,
): ScorePreview {
  const ce       = (controlEffectiveness ?? 0) / 5;
  const severity = likelihood * impactScore;
  const residual = Math.round(severity * (1 - ce) * 100) / 100;

  let level: string;
  if (severity >= 17)      level = 'Critical';
  else if (severity >= 10) level = 'High';
  else if (severity >= 5)  level = 'Medium';
  else                     level = 'Low';

  return { severity, residual, overallRating: residual, level };
}

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