import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSession } from "../auth/session.js";
import { createMidtransPaymentForUser, getPaymentForUser, handleMidtransNotification } from "./payment.service.js";
import { planSlugSchema } from "./plan-catalog.js";

const createPaymentBodySchema = z.object({
  plan: planSlugSchema
});

const paymentParamsSchema = z.object({
  paymentId: z.string().uuid()
});

function mapPayment(payment: {
  id: string;
  orderId: string;
  plan: string;
  grossAmount: number;
  currency: string;
  status: string;
  userId: string;
  snapToken?: string;
  snapRedirectUrl?: string;
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
    snapToken: payment.snapToken,
    redirectUrl: payment.snapRedirectUrl,
    updatedAt: payment.updatedAt.toISOString()
  };
}

export async function registerPaymentRoutes(app: FastifyInstance) {
  app.post("/midtrans/create", async (request, reply) => {
    const session = getSession(request);
    if (!session) {
      return reply.code(401).send({ message: "Login diperlukan." });
    }

    const body = createPaymentBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Paket yang dipilih tidak valid." });
    }

    try {
      const payment = await createMidtransPaymentForUser({
        userId: session.userId,
        plan: body.data.plan
      });
      return reply.code(201).send(mapPayment(payment));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membuat transaksi Midtrans.";
      return reply.code(400).send({ message });
    }
  });

  app.post("/midtrans/notification", async (request, reply) => {
    try {
      const payment = await handleMidtransNotification(request.body as Record<string, string>);
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: payment.status
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memproses notifikasi Midtrans.";
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
