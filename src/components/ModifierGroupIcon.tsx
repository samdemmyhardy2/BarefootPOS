import { ChefHat, CircleDot, Coffee, Cookie, Flame, Salad, Sparkles, Utensils } from "lucide-react";

export const modifierGroupIcons = [
  { name: "Utensils", label: "Utensils", Icon: Utensils },
  { name: "Salad", label: "Salad", Icon: Salad },
  { name: "Coffee", label: "Coffee", Icon: Coffee },
  { name: "ChefHat", label: "Chef hat", Icon: ChefHat },
  { name: "Flame", label: "Flame", Icon: Flame },
  { name: "CircleDot", label: "Circle", Icon: CircleDot },
  { name: "Sparkles", label: "Sparkles", Icon: Sparkles },
  { name: "Cookie", label: "Cookie", Icon: Cookie },
] as const;

export type ModifierGroupIconName = (typeof modifierGroupIcons)[number]["name"];

export function ModifierGroupIcon({ name, size = 18 }: { name?: string | null; size?: number }) {
  const Icon = modifierGroupIcons.find((entry) => entry.name === name)?.Icon ?? Utensils;
  return <Icon size={size} aria-hidden="true" />;
}
