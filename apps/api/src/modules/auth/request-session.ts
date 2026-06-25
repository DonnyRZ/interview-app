import type { FastifyRequest } from "fastify";
import { getSession } from "./session.js";

export type RequestSession = {
  userId: string;
  email: string;
};

export async function getRequestSession(request: FastifyRequest): Promise<RequestSession | null> {
  const session = await getSession(request);
  return session ? { userId: session.userId, email: session.email } : null;
}
