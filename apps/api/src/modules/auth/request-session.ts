import type { FastifyRequest } from "fastify";
import { getSession } from "./session.js";

export type RequestSession = {
  userId: string;
  email: string;
};

export function getRequestSession(request: FastifyRequest): RequestSession | null {
  return getSession(request);
}
