export type ClassValue = string | number | false | null | undefined;

export function clsx(...parts: ClassValue[]): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" ");
}
