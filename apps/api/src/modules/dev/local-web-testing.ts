import type { FastifyRequest } from "fastify";
import { env } from "../../env.js";
import { getSession } from "../auth/session.js";
import { DEV_USER_EMAIL, DEV_USER_ID } from "./dev-user.js";
import { ensureDevUser } from "./dev-user.repository.js";

export type RequestSession = {
  userId: string;
  email: string;
  localWebTesting: boolean;
};

const LOCAL_WEB_TESTING_HEADER = "x-orviko-local-testing";
let ensureDevUserPromise: Promise<void> | null = null;

export function isLocalWebTestingRequest(request: FastifyRequest) {
  return env.NODE_ENV !== "production"
    && request.headers[LOCAL_WEB_TESTING_HEADER] === "web-app"
    && isLocalOrigin(request.headers.origin);
}

function isLocalOrigin(origin: string | undefined) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]");
  } catch {
    return false;
  }
}

export async function getRequestSession(request: FastifyRequest): Promise<RequestSession | null> {
  if (isLocalWebTestingRequest(request)) {
    ensureDevUserPromise ??= ensureDevUser().catch((error) => {
      ensureDevUserPromise = null;
      throw error;
    });
    await ensureDevUserPromise;
    return {
      userId: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      localWebTesting: true
    };
  }

  const session = getSession(request);
  return session ? { ...session, localWebTesting: false } : null;
}
