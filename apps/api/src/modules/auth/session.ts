import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../env.js";

export const SESSION_COOKIE = "orviko_session";
const STATE_MAX_AGE_SECONDS = 10 * 60;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type SessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

type OAuthStatePayload = {
  plan: string;
  flow?: "web" | "web-app";
  nonce: string;
  exp: number;
};

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function encodeSignedPayload(payload: unknown) {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function decodeSignedPayload<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature || !safeEqual(signature, sign(body))) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function cookieOptions(maxAgeSeconds: number) {
  const secure = env.NODE_ENV === "production";
  return [
    "Path=/",
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

export function createOAuthState(plan: string, flow: "web" | "web-app" = "web") {
  return encodeSignedPayload({
    plan,
    flow,
    nonce: randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + STATE_MAX_AGE_SECONDS
  } satisfies OAuthStatePayload);
}

export function parseOAuthState(state: string | undefined) {
  const payload = decodeSignedPayload<OAuthStatePayload>(state);
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

export function createSessionToken(input: { userId: string; email: string }) {
  return encodeSignedPayload({
    userId: input.userId,
    email: input.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  } satisfies SessionPayload);
}

export function setSessionCookie(reply: FastifyReply, input: { userId: string; email: string }) {
  const token = createSessionToken(input);
  reply.header("Set-Cookie", `${SESSION_COOKIE}=${token}; ${cookieOptions(SESSION_MAX_AGE_SECONDS)}`);
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.header("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function getSession(request: FastifyRequest) {
  const payload = decodeSignedPayload<SessionPayload>(readCookie(request, SESSION_COOKIE));
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}
