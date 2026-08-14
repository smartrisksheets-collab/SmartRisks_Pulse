// src/utils/brand.ts

export function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function applyBrandColors(primary: string | undefined, accent: string | undefined): void {
  const p = primary ?? "#01b88e";
  const a = accent ?? "#1F2854";
  const root = document.documentElement;
  root.style.setProperty("--primary", p);
  root.style.setProperty("--primary-rgb", hexToRgb(p));
  root.style.setProperty("--accent", a);
}