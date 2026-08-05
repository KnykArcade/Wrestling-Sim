import { emptyShowEvaluationUniverse } from "./model";
import type { ShowEvaluationUniverse } from "./types";

export const SHOW_EVALUATION_STORAGE_KEY = "wrestling-sim:show-evaluation:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseShowEvaluationUniverse(value: unknown): ShowEvaluationUniverse {
  if (!isRecord(value)) return emptyShowEvaluationUniverse();
  return {
    angleEvaluations: Array.isArray(value.angleEvaluations) ? value.angleEvaluations as ShowEvaluationUniverse["angleEvaluations"] : [],
    workerImpacts: Array.isArray(value.workerImpacts) ? value.workerImpacts as ShowEvaluationUniverse["workerImpacts"] : [],
    showReports: Array.isArray(value.showReports) ? value.showReports as ShowEvaluationUniverse["showReports"] : [],
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
