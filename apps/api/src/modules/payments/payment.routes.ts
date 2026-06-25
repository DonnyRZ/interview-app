import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSession } from "../auth/session.js";
import { verifyLynkWebhookSecret } from "./lynk.client.js";
import {
  createLynkCheckoutForUser,
  getPaymentForUser,
  handleLynkWebhook
} from "./payment.service.js";
import { planSlugSchema } from "./plan-catalog.js";
import { safeClientError } from "../security/safe-error.js";

const createPaymentBodySchema = z.object({
  plan: planSlugSchema
});

const paymentParamsSchema = z.object({
  paymentId: z.string().regex(/^pay_[A-Za-z0-9_-]{20,}$/)
});

function mapPayment(payment: {
  id: string;
  publicId: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  checkoutUrl?: string;
  expiresAt: Date;
  updatedAt: Date;
}) {
  return {
    paymentId: payment.publicId,
    plan: payment.plan,
    grossAmount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    redirectUrl: payment.checkoutUrl,
    expiresAt: payment.expiresAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString()
  };
}

function summarizePayloadShape(value: unknown, prefix = "", output: string[] = []) {
  if (output.length >= 80 || !value || typeof value !== "object") {
    return output;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (output.length >= 80) {
      break;
    }

    const path = prefix ? `${prefix}.${key}` : key;
    const type = Array.isArray(nestedValue) ? "array" : typeof nestedValue;
    output.push(`${path}:${type}`);

    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      summarizePayloadShape(nestedValue, path, output);
    }
  }

  return output;
}

function mapLynkWebhookLog(result: Awaited<ReturnType<typeof handleLynkWebhook>>, payload: unknown) {
  return {
    processed: result.processed,
    reason: result.reason,
    payloadShape: summarizePayloadShape(payload),
    duplicate: "duplicate" in result ? result.duplicate : false,
    eventType: "eventType" in result ? result.eventType : null
  };
}

export async function registerPaymentRoutes(app: FastifyInstance) {
  app.post("/lynk/create", async (request, reply) => {
    const session = await getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const body = createPaymentBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Paket yang dipilih tidak valid." });
    }

    try {
      const payment = await createLynkCheckoutForUser({
        userId: session.userId,
        plan: body.data.plan
      });
      return reply.code(201).send(mapPayment(payment));
    } catch (error) {
      const message = safeClientError(error, "Gagal membuat checkout Lynk.");
      return reply.code(400).send({ message });
    }
  });

  app.post("/lynk/webhook", async (request, reply) => {
    if (!verifyLynkWebhookSecret(request.headers["x-orviko-lynk-webhook-secret"])) {
      return reply.code(401).send({ message: "Webhook Lynk tidak valid." });
    }

    try {
      const result = await handleLynkWebhook(request.body as Record<string, unknown>);
      request.log.info(mapLynkWebhookLog(result, request.body), "Lynk webhook result");
      return { ok: true, processed: result.processed };
    } catch (error) {
      request.log.error({ error }, "Lynk webhook processing failed");
      return reply.code(400).send({ message: "Webhook tidak dapat diproses." });
    }
  });

  app.get("/:paymentId", async (request, reply) => {
    const session = await getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const params = paymentParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Payment id tidak valid." });
    }

    const payment = await getPaymentForUser(session.userId, params.data.paymentId);
    if (!payment) {
      return reply.code(404).send({ message: "Payment tidak ditemukan." });
    }

    return mapPayment(payment);
  });
}
