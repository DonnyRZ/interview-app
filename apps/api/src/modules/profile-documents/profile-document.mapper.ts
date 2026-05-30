import type { ProfileDocument } from "@interview-app/shared";
import type { profileDocuments } from "../../db/schema/index.js";

type ProfileDocumentRow = typeof profileDocuments.$inferSelect;

export function mapProfileDocument(row: ProfileDocumentRow): ProfileDocument {
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
