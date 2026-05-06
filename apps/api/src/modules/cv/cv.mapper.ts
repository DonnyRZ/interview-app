import type { Cv } from "@interview-app/shared";
import type { candidateCvs } from "../../db/schema/index.js";

type CandidateCvRow = typeof candidateCvs.$inferSelect;

export function mapCv(row: CandidateCvRow): Cv {
  return {
    id: row.id,
    fileName: row.fileName,
    fileMimeType: row.fileMimeType,
    summaryJson: row.summaryJson,
    readyContext: row.readyContext,
    processingStatus: row.processingStatus as "uploaded" | "processing" | "ready" | "failed",
    processingError: row.processingError,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString()
  };
}
