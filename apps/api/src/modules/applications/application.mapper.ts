import type { Application } from "@interview-app/shared";
import type { applications } from "../../db/schema/index.js";

type ApplicationRow = typeof applications.$inferSelect;

export function mapApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    cvId: row.cvId,
    companyName: row.companyName,
    roleTitle: row.roleTitle,
    jobDescription: row.jobDescription,
    jobSummaryJson: row.jobSummaryJson,
    companyContext: row.companyContext,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
