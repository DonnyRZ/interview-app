import { z } from "zod";
import { env } from "../../env.js";

export const planSlugSchema = z.enum(["mini", "starter", "pro"]);
export type PlanSlug = z.infer<typeof planSlugSchema>;

export type PlanCatalogItem = {
  name: string;
  grossAmount: number;
  currency: "IDR";
  billingPeriodDays: number;
  providerProductId: string;
  checkoutUrl: string;
  sessionLimit: string;
  liveSessionLimit: number | null;
};

export const planCatalog: Record<PlanSlug, PlanCatalogItem> = {
  mini: {
    name: "Mini",
    grossAmount: 29_000,
    currency: "IDR",
    billingPeriodDays: 30,
    providerProductId: env.LYNK_MINI_PRODUCT_ID || "",
    checkoutUrl: env.LYNK_MINI_URL || "",
    sessionLimit: "3 kali sesi live",
    liveSessionLimit: 3
  },
  starter: {
    name: "Starter",
    grossAmount: 98_000,
    currency: "IDR",
    billingPeriodDays: 30,
    providerProductId: env.LYNK_STARTER_PRODUCT_ID || "",
    checkoutUrl: env.LYNK_STARTER_URL || "",
    sessionLimit: "12 kali sesi live",
    liveSessionLimit: 12
  },
  pro: {
    name: "Pro",
    grossAmount: 359_000,
    currency: "IDR",
    billingPeriodDays: 30,
    providerProductId: env.LYNK_PRO_PRODUCT_ID || "",
    checkoutUrl: env.LYNK_PRO_URL || "",
    sessionLimit: "Fair-use 60 kali sesi live",
    liveSessionLimit: 60
  }
};

export function requireCheckoutReadyPlan(plan: PlanSlug) {
  const item = planCatalog[plan];
  if (!item.checkoutUrl || !item.providerProductId) {
    throw new Error(`Konfigurasi checkout paket ${item.name} belum lengkap.`);
  }
  return item;
}

export function getPlanOrNull(plan: string | undefined) {
  const parsed = planSlugSchema.safeParse(plan);
  return parsed.success ? planCatalog[parsed.data] : null;
}
