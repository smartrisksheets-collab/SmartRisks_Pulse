// src/utils/brand.ts

import type { BrandPalette } from "../types/settings";

export const DEFAULT_PRIMARY = "#01b88e";
export const DEFAULT_ACCENT = "#1F2854";
// Primary sits behind white button text. The default teal scores 2.55, so it is the floor.
export const MIN_PRIMARY_CONTRAST = 2.5;
// Accent is used as title text on white cards, so it needs normal text contrast.
export const MIN_ACCENT_CONTRAST = 4.5;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

export function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function contrastWithWhite(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return 1.05 / (lum + 0.05);
}

// Colors the report preview and inline styles use, as CSS variables.
export const BRAND_ACCENT_TEXT = "var(--accent-text)";
export const BRAND_PRIMARY_TEXT = "var(--primary-text)";
export const BRAND_PRIMARY = "var(--primary)";
export const BRAND_ACCENT = "var(--accent)";

const PALETTE_VARS: Array<[keyof BrandPalette, string]> = [
  ["on_primary", "--on-primary"],
  ["on_accent", "--on-accent"],
  ["primary_text", "--brand-primary-text"],
  ["accent_text", "--brand-accent-text"],
  ["accent_deep", "--brand-accent-deep"],
];

// Sets the workspace theme from the palette the backend resolved. Missing or
// invalid values fall back to the SmartRisk defaults in index.css.
export function applyBrandColors(brand: Partial<BrandPalette> | null | undefined): void {
  const b = brand ?? {};
  const p = isHexColor(b.primary) ? b.primary : DEFAULT_PRIMARY;
  const a = isHexColor(b.accent) ? b.accent : DEFAULT_ACCENT;
  const root = document.documentElement;
  root.style.setProperty("--primary", p);
  root.style.setProperty("--primary-rgb", hexToRgb(p));
  root.style.setProperty("--accent", a);
  root.style.setProperty("--accent-rgb", hexToRgb(a));
  for (const [key, cssVar] of PALETTE_VARS) {
    const v = b[key];
    if (isHexColor(v)) root.style.setProperty(cssVar, v);
    else root.style.removeProperty(cssVar);
  }
  try { localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ ...b, primary: p, accent: a })); } catch { /* storage unavailable */ }
}

const BRAND_CACHE_KEY = "sr-brand";

export function applyCachedBrandColors(): void {
  try {
    const raw = localStorage.getItem(BRAND_CACHE_KEY);
    if (!raw) return;
    // Older caches stored { p, a } only.
    const saved = JSON.parse(raw) as Partial<BrandPalette> & { p?: string; a?: string };
    applyBrandColors({ ...saved, primary: saved.primary ?? saved.p, accent: saved.accent ?? saved.a });
  } catch { /* corrupt or unavailable, defaults stay */ }
}

export function clearCachedBrandColors(): void {
  try { localStorage.removeItem(BRAND_CACHE_KEY); } catch { /* storage unavailable */ }
}