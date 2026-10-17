import type { Language } from "./translations";

/** Converts legacy comma-separated values and new arrays into unique individual labels. */
export function splitFoodLabels(value: string | string[] | null | undefined): string[] {
  const values = Array.isArray(value) ? value : (value ?? "").split(",");
  return [...new Set(values.map((label) => label.trim()).filter(Boolean))];
}

/** Applies stored translations by index while falling back to each canonical English label. */
export function localizedFoodLabels(base: string[] | null | undefined, my: string[] | null | undefined, th: string[] | null | undefined, language: Language): string[] {
  const labels = base ?? [];
  const localized = language === "my" ? my : language === "th" ? th : undefined;
  if (!localized?.length) return labels;
  return labels.map((label, index) => localized[index]?.trim() || label);
}
