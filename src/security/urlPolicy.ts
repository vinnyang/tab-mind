const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

export function isSafeHref(raw: string): boolean {
  try {
    return SAFE_SCHEMES.has(new URL(raw, "https://invalid.example").protocol);
  } catch {
    return false;
  }
}

export function safeHref(raw: string): string {
  return isSafeHref(raw) ? raw : "#blocked";
}
