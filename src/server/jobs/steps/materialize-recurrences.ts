import "server-only";
import { materializeRecurrences as materialize } from "@/server/domain/recurrences";
import type { JobStep } from "../runner";

/** Keeps every active recurrence materialised 60 days ahead (doc 03 §10.1). */
export const materializeRecurrences: JobStep = {
  name: "materializeRecurrences",
  async run({ signal, startedAt }) {
    const report = await materialize({ now: startedAt.getTime(), signal });
    return { status: "ok", details: report };
  },
};
