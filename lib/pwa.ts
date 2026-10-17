export const PWA_THEME_COLOR = "#4f46e5";
export const PWA_BACKGROUND_COLOR = "#f4f6fb";

export const PWA_ICON_VARIANTS = ["192", "512", "maskable-192", "maskable-512"] as const;
export type PwaIconVariant = (typeof PWA_ICON_VARIANTS)[number];

export function parsePwaIconVariant(value: string): { size: number; maskable: boolean } | null {
  if (!(PWA_ICON_VARIANTS as readonly string[]).includes(value)) return null;
  const maskable = value.startsWith("maskable-");
  const size = Number(value.replace("maskable-", ""));
  return { size, maskable };
}
