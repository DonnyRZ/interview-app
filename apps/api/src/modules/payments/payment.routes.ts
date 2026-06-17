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

const createPaymentBodySchema = z.object({
  plan: planSlugSchema
});

const paymentParamsSchema = z.object({
  paymentId: z.string().uuid()
});

const lynkWebhookQuerySchema = z.object({
  secret: z.string().optional()
});

function mapPayment(payment: {
  id: string;
  orderId: string;
  plan: string;
  grossAmount: number;
  currency: string;
  status: string;
  userId: string;
  lynkRedirectUrl?: string;
  updatedAt: Date;
}) {
  return {
    paymentId: payment.id,
    orderId: payment.orderId,
    plan: payment.plan,
    grossAmount: payment.grossAmount,
    currency: payment.currency,
    status: payment.status,
    userId: payment.userId,
    redirectUrl: payment.lynkRedirectUrl,
    updatedAt: payment.updatedAt.toISOString()
  };
}

function mapLynkWebhookLog(result: Awaited<ReturnType<typeof handleLynkWebhook>>) {
  const payment = "payment" in result ? result.payment : undefined;
  const subscription = "subscription" in result ? result.subscription : undefined;

  return {
    processed: result.processed,
    reason: result.reason,
    parsed: result.parsed,
    payment: payment
      ? {
        id: payment.id,
        plan: payment.plan,
        grossAmount: payment.grossAmount,
        status: payment.status,
        externalTransactionIdPresent: Boolean(payment.externalTransactionId)
      }
      : null,
    subscription
  };
}

export async function registerPaymentRoutes(app: FastifyInstance) {
  app.post("/lynk/create", async (request, reply) => {
    const session = getSession(request);
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
      const message = error instanceof Error ? error.message : "Gagal membuat checkout Lynk.";
      return reply.code(400).send({ message });
    }
  });

  app.post("/lynk/webhook", async (request, reply) => {
    const query = lynkWebhookQuerySchema.safeParse(request.query);
    if (!query.success || !verifyLynkWebhookSecret(request.headers["x-orviko-lynk-webhook-secret"], query.data.secret)) {
      return reply.code(401).send({ message: "Webhook Lynk tidak valid." });
    }

    try {
      const result = await handleLynkWebhook(request.body as Record<string, unknown>);
      request.log.info(mapLynkWebhookLog(result), "Lynk webhook result");
      return {
        ok: true,
        ...result
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memproses webhook Lynk.";
      return reply.code(400).send({ message });
    }
  });

  app.get("/:paymentId", async (request, reply) => {
    const session = getSession(request);
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
