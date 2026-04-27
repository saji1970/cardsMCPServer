import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger";

const DEFAULT_DIR = path.join(process.cwd(), "data", "build-jobs");

function jobsDir(): string {
  return process.env.BUILD_JOBS_DIR?.trim() || DEFAULT_DIR;
}

function ensureDir(): void {
  fs.mkdirSync(jobsDir(), { recursive: true });
}

function jobPath(id: string): string {
  return path.join(jobsDir(), `${id}.json`);
}

export type BuildJobStatus = "pending" | "running" | "completed" | "failed" | "paused";

export interface BuildJob {
  id: string;
  name: string;
  kind: string;
  status: BuildJobStatus;
  /** 0-based index of the next step to run (checkpoint). */
  stepIndex: number;
  totalSteps: number;
  /** Arbitrary per-job state; persisted each tick. */
  checkpoint: Record<string, unknown>;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

function readJobFile(id: string): BuildJob | undefined {
  const p = jobPath(id);
  if (!fs.existsSync(p)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as BuildJob;
  } catch (e) {
    logger.error("build-job: corrupt file", { id, error: (e as Error).message });
    return undefined;
  }
}

function writeJobFile(job: BuildJob): void {
  ensureDir();
  const p = jobPath(job.id);
  const tmp = `${p}.${process.pid}.tmp`;
  const body = JSON.stringify(job, null, 2);
  fs.writeFileSync(tmp, body, "utf8");
  fs.renameSync(tmp, p);
}

/**
 * Durable build/checkpoint jobs: each tick advances one step; state is on disk so
 * restarts resume from the last `stepIndex`.
 */
export const buildJobStore = {
  jobsDir,

  create(input: { name: string; kind: string; totalSteps: number; checkpoint?: Record<string, unknown> }): BuildJob {
    ensureDir();
    const id = `job_${randomUUID().replace(/-/g, "")}`;
    const now = new Date().toISOString();
    const job: BuildJob = {
      id,
      name: input.name,
      kind: input.kind,
      status: "pending",
      stepIndex: 0,
      totalSteps: Math.max(1, Math.floor(input.totalSteps)),
      checkpoint: input.checkpoint ?? {},
      createdAt: now,
      updatedAt: now,
    };
    writeJobFile(job);
    return job;
  },

  get(id: string): BuildJob | undefined {
    return readJobFile(id);
  },

  list(): BuildJob[] {
    ensureDir();
    const dir = jobsDir();
    if (!fs.existsSync(dir)) return [];
    const out: BuildJob[] = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const id = f.replace(/\.json$/, "");
      const j = readJobFile(id);
      if (j) out.push(j);
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  /**
   * Process one step: increments stepIndex, merges checkpoint, marks completed at end.
   */
  tick(
    id: string,
    input?: { mergeCheckpoint?: Record<string, unknown>; onStep?: (job: BuildJob) => void },
  ): BuildJob {
    const job = readJobFile(id);
    if (!job) throw new Error(`Job ${id} not found`);
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(job.lastError ? `Job ${id} is failed: ${job.lastError}` : `Job ${id} is failed`);
    }

    const now = new Date().toISOString();
    job.status = "running";
    if (input?.onStep) {
      try {
        input.onStep(job);
      } catch (e) {
        job.status = "failed";
        job.lastError = (e as Error).message;
        job.updatedAt = now;
        writeJobFile(job);
        throw e;
      }
    }
    if (input?.mergeCheckpoint) {
      job.checkpoint = { ...job.checkpoint, ...input.mergeCheckpoint };
    }
    job.stepIndex++;
    if (job.stepIndex >= job.totalSteps) {
      job.status = "completed";
      job.stepIndex = job.totalSteps;
    } else {
      job.status = "paused";
    }
    job.updatedAt = new Date().toISOString();
    job.lastError = undefined;
    writeJobFile(job);
    return readJobFile(id) ?? job;
  },

  reset(id: string, opts?: { totalSteps?: number; clearCheckpoint?: boolean }): BuildJob {
    const job = readJobFile(id);
    if (!job) throw new Error(`Job ${id} not found`);
    job.status = "pending";
    job.stepIndex = 0;
    if (typeof opts?.totalSteps === "number") job.totalSteps = Math.max(1, Math.floor(opts.totalSteps));
    if (opts?.clearCheckpoint) job.checkpoint = {};
    job.lastError = undefined;
    job.updatedAt = new Date().toISOString();
    writeJobFile(job);
    return readJobFile(id) ?? job;
  },
};
