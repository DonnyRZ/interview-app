import { z } from "zod";

export const planSlugSchema = z.enum(["mini", "starter", "pro"]);
export type PlanSlug = z.infer<typeof planSlugSchema>;

export const planCatalog: Record<PlanSlug, { name: string; grossAmount: number; sessionLimit: string; liveSessionLimit: number | null }> = {
  mini: {
    name: "Mini",
    grossAmount: 29_000,
    sessionLimit: "3 kali sesi live",
    liveSessionLimit: 3
  },
  starter: {
    name: "Starter",
    grossAmount: 98_000,
    sessionLimit: "12 kali sesi live",
    liveSessionLimit: 12
  },
  pro: {
    name: "Pro",
    grossAmount: 359_000,
    sessionLimit: "Sesi live tak terbatas",
    liveSessionLimit: null
  }
};

export function getPlanOrNull(plan: string | undefined) {
  const parsed = planSlugSchema.safeParse(plan);
  return parsed.success ? planCatalog[parsed.data] : null;
}
