import type { CreateApplicationRequest, UpdateApplicationRequest } from "@interview-app/shared";
import { desc, and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { applications } from "../../db/schema/index.js";

export type CreateApplicationInput = CreateApplicationRequest & {
  jobSummaryJson?: unknown;
  companyContext?: string;
};

export async function listApplications(userId: string) {
  return db.query.applications.findMany({
    where: eq(applications.userId, userId),
    orderBy: [desc(applications.createdAt)]
  });
}

export async function findApplicationById(userId: string, applicationId: string) {
  return db.query.applications.findFirst({
    where: and(eq(applications.userId, userId), eq(applications.id, applicationId))
  });
}

export async function createApplication(userId: string, cvId: string, input: CreateApplicationInput) {
  const [createdApplication] = await db.insert(applications).values({
    userId,
    cvId,
    companyName: input.companyName,
    roleTitle: input.roleTitle,
    jobDescription: input.jobDescription,
    jobSummaryJson: input.jobSummaryJson,
    companyContext: input.companyContext || buildDummyCompanyContext(input)
  }).returning();

  if (!createdApplication) {
    throw new Error("Failed to create application");
  }

  return createdApplication;
}

export async function updateApplication(userId: string, applicationId: string, input: UpdateApplicationRequest) {
  const [updatedApplication] = await db.update(applications)
    .set({
      ...input,
      companyContext: input.companyName || input.roleTitle || input.jobDescription
        ? buildDummyCompanyContext({
          companyName: input.companyName || "Existing company",
          roleTitle: input.roleTitle || "Existing role",
          jobDescription: input.jobDescription
        })
        : undefined,
      updatedAt: new Date()
    })
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
    .returning();

  return updatedApplication || null;
}

export async function deleteApplication(userId: string, applicationId: string) {
  const [deletedApplication] = await db.delete(applications)
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
    .returning({ id: applications.id });

  return deletedApplication || null;
}

function buildDummyCompanyContext(input: Pick<CreateApplicationRequest, "companyName" | "roleTitle" | "jobDescription">) {
  const jdPreview = input.jobDescription?.slice(0, 180) || "Belum ada job description.";
  return `Dummy context for ${input.roleTitle} at ${input.companyName}. JD preview: ${jdPreview}`;
}
