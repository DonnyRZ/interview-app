import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../env.js";
import { getRequestSession } from "../auth/request-session.js";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function registerRateLimitGuard(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/health")) {
      return;
    }

    const policy = getRateLimitPolicy(request);
    const now = Date.now();
    const windowMs = env.RATE_LIMIT_WINDOW_SECONDS * 1000;
    const retryAfterSeconds = await consumeRateLimit(`ip:${request.ip}:${policy.name}`, policy.maxRequests, windowMs, now);
    if (retryAfterSeconds > 0) {
      return sendRateLimit(reply, retryAfterSeconds);
    }

    const session = await getRequestSession(request).catch(() => null);
    if (session) {
      const userRetryAfterSeconds = await consumeRateLimit(
        `user:${session.userId}:${policy.name}`,
        policy.maxRequests,
        windowMs,
        now
      );
      if (userRetryAfterSeconds > 0) {
        return sendRateLimit(reply, userRetryAfterSeconds);
      }
    }
  });
}

function getRateLimitPolicy(request: FastifyRequest) {
  const path = request.url.split("?")[0] || "/";
  if (path.startsWith("/payments")) {
    return { name: "payment", maxRequests: env.PAYMENT_RATE_LIMIT_MAX_REQUESTS };
  }

  if (
    path.startsWith("/profile-documents/upload")
    || path.includes("/retry-processing")
    || path.startsWith("/meeting-contexts")
    || path.startsWith("/live-meetings/realtime/client-secret")
    || path.startsWith("/live-meetings/answer")
    || path.startsWith("/live-meetings/followup")
    || path.startsWith("/live-meetings/explain")
    || path.startsWith("/live-meetings/keyword-help")
    || path.startsWith("/live-meetings/runtime-keywords")
  ) {
    return { name: "ai", maxRequests: env.AI_RATE_LIMIT_MAX_REQUESTS };
  }

  return { name: "general", maxRequests: env.RATE_LIMIT_MAX_REQUESTS };
}

async function consumeRateLimit(key: string, maxRequests: number, windowMs: number, now: number) {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    cleanupExpiredBuckets(now);
    return 0;
  }

  existing.count += 1;
  if (existing.count <= maxRequests) {
    return 0;
  }

  return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
}

function sendRateLimit(reply: FastifyReply, retryAfterSeconds: number) {
  reply.header("Retry-After", String(retryAfterSeconds));
  return reply.code(429).send({
    message: "Terlalu banyak request. Coba lagi sebentar.",
    retryAfterSeconds
  });
}

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 10_000) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
