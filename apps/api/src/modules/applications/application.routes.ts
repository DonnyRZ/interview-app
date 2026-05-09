import {
  applicationListResponseSchema,
  applicationResponseSchema,
  createApplicationRequestSchema,
  deleteApplicationResponseSchema,
  updateApplicationRequestSchema
} from "@interview-app/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mapApplication } from "./application.mapper.js";
import {
  createApplicationForDevUser,
  deleteApplicationForDevUser,
  getApplicationForDevUser,
  getApplicationsForDevUser,
  updateApplicationForDevUser
} from "./application.service.js";

const applicationParamsSchema = z.object({
  id: z.string().uuid()
});

export async function registerApplicationRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const applications = await getApplicationsForDevUser();
    return applicationListResponseSchema.parse({
      applications: applications.map(mapApplication)
    });
  });

  app.post("/", async (request, reply) => {
    const body = createApplicationRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid application payload" });
    }

    try {
      const application = await createApplicationForDevUser(body.data);
      return reply.code(201).send(applicationResponseSchema.parse({
        application: mapApplication(application)
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create application";
      return reply.code(400).send({ message });
    }
  });

  app.get("/:id", async (request, reply) => {
    const params = applicationParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid application id" });
    }

    const application = await getApplicationForDevUser(params.data.id);
    if (!application) {
      return reply.code(404).send({ message: "Application not found" });
    }

    return applicationResponseSchema.parse({
      application: mapApplication(application)
    });
  });

  app.patch("/:id", async (request, reply) => {
    const params = applicationParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid application id" });
    }

    const body = updateApplicationRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ message: "Invalid application payload" });
    }

    const application = await updateApplicationForDevUser(params.data.id, body.data);
    if (!application) {
      return reply.code(404).send({ message: "Application not found" });
    }

    return applicationResponseSchema.parse({
      application: mapApplication(application)
    });
  });

  app.delete("/:id", async (request, reply) => {
    const params = applicationParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ message: "Invalid application id" });
    }

    const deletedApplication = await deleteApplicationForDevUser(params.data.id);
    if (!deletedApplication) {
      return reply.code(404).send({ message: "Application not found" });
    }

    return deleteApplicationResponseSchema.parse({
      ok: true,
      deletedApplicationId: deletedApplication.id
    });
  });
}
