import { db, type Tx } from "./db";
import { friendlyCode } from "./crypto";

/** Atomically increments a named counter (safe under concurrency). */
export async function nextSequence(key: string, tx: Tx | typeof db = db): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = "Counter".value + 1
    RETURNING value`;
  return Number(rows[0].value);
}

const pad = (n: number, w = 5) => String(n).padStart(w, "0");

/** e.g. BK-2026-00042, PO-2026-00007, INV-2026-00113 */
export async function makeReference(prefix: string, tx: Tx | typeof db = db, width = 5): Promise<string> {
  const year = new Date().getUTCFullYear();
  const n = await nextSequence(`${prefix}-${year}`, tx);
  return `${prefix}-${year}-${pad(n, width)}`;
}

export async function makeTailorCode(tx: Tx | typeof db = db): Promise<string> {
  const n = await nextSequence("TAILOR", tx);
  return `SW-T-${pad(n, 4)}`;
}

/** Non-sequential, unguessable certificate verification ID: SWA-2026-7KQ4-M2XD */
export function makeCertificateCode(): string {
  return `SWA-${new Date().getUTCFullYear()}-${friendlyCode(4)}-${friendlyCode(4)}`;
}
