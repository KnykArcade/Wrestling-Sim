import { emptyShowEvaluationUniverse } from "./model";
import type { ShowEvaluationUniverse } from "./types";

export const SHOW_EVALUATION_STORAGE_KEY = "wrestling-sim:show-evaluation:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseShowEvaluationUniverse(value: unknown): ShowEvaluationUniverse {
  if (!isRecord(value)) return emptyShowEvaluationUniverse();
  const angleEvaluations = Array.isArray(value.angleEvaluations)
    ? value.angleEvaluations.map((item) => isRecord(item) ? { ...item, idempotencyKey: typeof item.idempotencyKey === "string" ? item.idempotencyKey : `${String(item.showId ?? "legacy")}:${String(item.segmentId ?? item.id ?? "angle")}:angle-consequences`, calculationVersion: typeof item.calculationVersion === "string" ? item.calculationVersion : "legacy-unversioned" } : item) as ShowEvaluationUniverse["angleEvaluations"]
    : [];
  const showReports = Array.isArray(value.showReports)
    ? value.showReports.map((item) => isRecord(item) ? { ...item, calculationVersion: typeof item.calculationVersion === "string" ? item.calculationVersion : "legacy-unversioned" } : item) as ShowEvaluationUniverse["showReports"]
    : [];
  return {
    angleEvaluations,
    workerImpacts: Array.isArray(value.workerImpacts) ? value.workerImpacts as ShowEvaluationUniverse["workerImpacts"] : [],
    showReports,
    promotionPopularity: typeof value.promotionPopularity === "number" && Number.isFinite(value.promotionPopularity) ? Math.max(0, Math.min(100, value.promotionPopularity)) : 50,
  };
}

export function loadShowEvaluationUniverse(storage: Pick<Storage, "getItem">): ShowEvaluationUniverse {
  const raw = storage.getItem(SHOW_EVALUATION_STORAGE_KEY);
  if (!raw) return emptyShowEvaluationUniverse();
  try { return parseShowEvaluationUniverse(JSON.parse(raw) as unknown); } catch { return emptyShowEvaluationUniverse(); }
}

export function saveShowEvaluationUniverse(storage: Pick<Storage, "setItem">, universe: ShowEvaluationUniverse): void {
  storage.setItem(SHOW_EVALUATION_STORAGE_KEY, JSON.stringify(universe));
}
