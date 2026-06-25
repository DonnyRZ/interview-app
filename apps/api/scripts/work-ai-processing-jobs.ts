import { hostname } from "node:os";
import { sql } from "../src/db/client.js";
import {
  claimNextAiProcessingJob,
  completeAiProcessingJob,
  failAiProcessingJob
} from "../src/modules/jobs/ai-processing-job.service.js";
import { processProfileDocumentJob } from "../src/modules/profile-documents/profile-document.service.js";

const workerId = `${hostname()}:${process.pid}`;
const pollIntervalMs = 1500;
let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

try {
  while (!stopping) {
    const job = await claimNextAiProcessingJob(workerId);
    if (!job) {
      await delay(pollIntervalMs);
      continue;
    }

    try {
      if (job.jobType !== "profile_document_preprocessing") {
        throw new Error(`Unsupported AI processing job type: ${job.jobType}`);
      }

      await processProfileDocumentJob(job.payload);
      await completeAiProcessingJob(job.id);
      console.info(JSON.stringify({ event: "ai_job_completed", jobId: job.id, jobType: job.jobType }));
    } catch (error) {
      await failAiProcessingJob(job, error);
      console.error(JSON.stringify({
        event: "ai_job_failed",
        jobId: job.id,
        jobType: job.jobType,
        attempts: job.attempts,
        message: error instanceof Error ? error.message : "Unknown error"
      }));
    }
  }
} finally {
  await sql.end();
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
