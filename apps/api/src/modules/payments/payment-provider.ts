export const paymentEventTypes = ["paid", "failed", "expired", "refunded", "chargeback"] as const;

export type PaymentEventType = (typeof paymentEventTypes)[number];

/** Provider-neutral event produced only after the provider webhook has been authenticated. */
export type VerifiedPaymentProviderEvent = {
  provider: string;
  providerEventId: string;
  providerPaymentId: string;
  providerOrderId: string;
  providerProductId?: string;
  customerEmail?: string;
  eventType: PaymentEventType;
  amount: number;
  currency: string;
  sanitizedPayload: Record<string, unknown>;
};

export function assertPaymentProviderId(provider: string) {
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(provider)) {
    throw new Error("Payment provider id tidak valid.");
  }
}
