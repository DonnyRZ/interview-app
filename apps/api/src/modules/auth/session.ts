import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../../db/client.js";
import { authSessions, oauthStates, users } from "../../db/schema/index.js";
import { env } from "../../env.js";

export const SESSION_COOKIE = "orviko_session";
export const OAUTH_BROWSER_COOKIE = "orviko_oauth_browser";
const STATE_MAX_AGE_SECONDS = 10 * 60;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type AuthSession = {
  sessionId: string;
  userId: string;
  email: string;
  expiresAt: Date;
};

export type OAuthState = {
  plan: string;
  flow: "web" | "web-app";
};

function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(value: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("hex");
}

function cookieOptions(maxAgeSeconds: number, path = "/") {
  const secure = env.NODE_ENV === "production";
  return [
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function readCookie(request: FastifyRequest, name: string) {
  const header = request.headers.cookie;
  if (!header) return undefined;
  return header.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function appendSetCookie(reply: FastifyReply, cookie: string) {
  const existing = reply.getHeader("Set-Cookie");
  if (!existing) {
    reply.header("Set-Cookie", cookie);
    return;
  }
  reply.header("Set-Cookie", Array.isArray(existing) ? [...existing, cookie] : [String(existing), cookie]);
}

export async function createOAuthState(
  reply: FastifyReply,
  plan: string,
  flow: "web" | "web-app" = "web"
) {
  const state = createOpaqueToken();
  const browserBinding = createOpaqueToken();
  const expiresAt = new Date(Date.now() + STATE_MAX_AGE_SECONDS * 1000);

  await db.insert(oauthStates).values({
    stateHash: hashToken(state),
    browserBindingHash: hashToken(browserBinding),
    plan,
    flow,
    expiresAt
  });

  appendSetCookie(
    reply,
    `${OAUTH_BROWSER_COOKIE}=${browserBinding}; ${cookieOptions(STATE_MAX_AGE_SECONDS, "/auth/google")}`
  );
  return state;
}

export async function consumeOAuthState(
  request: FastifyRequest,
  reply: FastifyReply,
  state: string | undefined
): Promise<OAuthState | null> {
  const browserBinding = readCookie(request, OAUTH_BROWSER_COOKIE);
  clearOAuthBrowserCookie(reply);
  if (!state || !browserBinding) {
    return null;
  }

  const now = new Date();
  const [consumed] = await db.update(oauthStates)
    .set({ consumedAt: now })
    .where(and(
      eq(oauthStates.stateHash, hashToken(state)),
      eq(oauthStates.browserBindingHash, hashToken(browserBinding)),
      isNull(oauthStates.consumedAt),
      gt(oauthStates.expiresAt, now)
    ))
    .returning({
      plan: oauthStates.plan,
      flow: oauthStates.flow
    });

  if (!consumed || (consumed.flow !== "web" && consumed.flow !== "web-app")) {
    return null;
  }

  return {
    plan: consumed.plan,
    flow: consumed.flow
  };
}

export async function setSessionCookie(
  reply: FastifyReply,
  input: { userId: string }
) {
  const { token } = await createSessionForUser(input.userId);
  appendSetCookie(reply, `${SESSION_COOKIE}=${token}; ${cookieOptions(SESSION_MAX_AGE_SECONDS)}`);
}

export async function createSessionForUser(userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await db.insert(authSessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt
  });
  return { token, expiresAt };
}

export function clearSessionCookie(reply: FastifyReply) {
  appendSetCookie(reply, `${SESSION_COOKIE}=; ${cookieOptions(0)}`);
}

export function clearOAuthBrowserCookie(reply: FastifyReply) {
  appendSetCookie(reply, `${OAUTH_BROWSER_COOKIE}=; ${cookieOptions(0, "/auth/google")}`);
}

export async function getSession(request: FastifyRequest): Promise<AuthSession | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const now = new Date();
  const [session] = await db.select({
    sessionId: authSessions.id,
    userId: authSessions.userId,
    email: users.email,
    expiresAt: authSessions.expiresAt
  })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(
      eq(authSessions.tokenHash, hashToken(token)),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, now)
    ))
    .limit(1);

  return session || null;
}

export async function revokeCurrentSession(request: FastifyRequest) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) {
    return false;
  }

  const revoked = await db.update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(authSessions.tokenHash, hashToken(token)),
      isNull(authSessions.revokedAt)
    ))
    .returning({ id: authSessions.id });

  return revoked.length > 0;
}

export async function revokeAllSessionsForUser(userId: string) {
  const revoked = await db.update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(authSessions.userId, userId),
      isNull(authSessions.revokedAt)
    ))
    .returning({ id: authSessions.id });
  return revoked.length;
}

export async function deleteExpiredAuthArtifacts(now = new Date()) {
  const deletedSessions = await db.delete(authSessions)
    .where(lt(authSessions.expiresAt, now))
    .returning({ id: authSessions.id });
  const deletedStates = await db.delete(oauthStates)
    .where(lt(oauthStates.expiresAt, now))
    .returning({ id: oauthStates.id });
  return {
    sessions: deletedSessions.length,
    states: deletedStates.length
  };
}
