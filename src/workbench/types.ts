import type { MatchAimId, WrestlerSkill } from "../matchEngine/types";
import type { PlannedSegment, PlannedSegmentType } from "../planner/types";

export type WorkbenchMode = "quick-match" | "quick-angle" | "planned-show";
export type OutputTone = "sports" | "dramatic" | "road-agent";
export type OutputDetail = "concise" | "standard" | "detailed";
export type RatingSourceKind = "Imported from TEW" | "Mapped from TEW" | "Derived" | "Manual Override" | "Missing";

export interface WorkbenchDraftRevision {
  id: string;
  createdAt: string;
  label: string;
  tone: OutputTone;
  detail: OutputDetail;
  fullOutput: string;
  keyMoments: string;
  tewNotes: string;
}

export interface QuickSegmentRecord {
  id: string;
  type: PlannedSegmentType;
  segment: PlannedSegment;
  templateId: string;
  draftHistory: WorkbenchDraftRevision[];
  attachedShowIds: string[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface WorkbenchTemplate {
  id: string;
  name: string;
  type: PlannedSegmentType;
  summary: string;
  builtIn: boolean;
  durationMinutes: number;
  matchType: string;
  matchAimId: MatchAimId;
  angleLocation: string;
  angleContentType: string;
  purpose: string;
  notes: string;
}

export interface RatingFieldSource {
  field: string;
  source: RatingSourceKind;
  importedValue: number | null;
  overrideValue: number | null;
  note: string;
}

export interface WorkerRatingSourceRecord {
  workerKey: string;
  workerId: string;
  workerName: string;
  snapshotFile: string;
  identitySource: "TEW snapshot" | "Manual tracker worker";
  overall: RatingFieldSource;
  health: RatingFieldSource;
  popularity: RatingFieldSource;
  experience: RatingFieldSource;
  skills: Record<WrestlerSkill, RatingFieldSource>;
  updatedAt: string;
}

export interface WorkbenchSettings {
  advancedToolsVisible: boolean;
  defaultMode: WorkbenchMode;
  lastQuickSegmentId: string;
  lastPlannedShowId: string;
  lastPlannedSegmentId: string;
  compactApproachView: boolean;
}

export interface WorkbenchUniverse {
  quickSegments: QuickSegmentRecord[];
  templates: WorkbenchTemplate[];
  ratingSources: WorkerRatingSourceRecord[];
  recentSegmentIds: string[];
  settings: WorkbenchSettings;
}
