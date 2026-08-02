import type { MatchAimId, MatchApproachId } from "../matchEngine/types";
import type { PlannedReferenceSource, PlannedSegmentSection, PlannedSegmentType, SegmentWorkflowStatus } from "../planner/types";

export type OutputLineageStage =
  | "Plan"
  | "Generated Draft"
  | "Applied Output"
  | "Ready for TEW"
  | "Entered in TEW Version"
  | "Reconciled Actual Version";

export type OutputSourceKind = "Quick Segment" | "Planned Show";
export type OutputLibraryTab = "library" | "packets" | "templates";
export type OutputPackageKind = "Road-Agent Match Package" | "Angle Production Package";
export type PhraseSourceKind = "Canonical approach phrase library" | "Entered creative plan" | "Generic structural fallback";

export interface OutputParticipantSnapshot {
  id: string;
  name: string;
  role: string;
  side: string;
  source: PlannedReferenceSource;
}

export interface OutputStorylineSnapshot {
  id: string;
  name: string;
  source: PlannedReferenceSource;
}

export interface OutputApproachSnapshot {
  workerKey: string;
  workerName: string;
  approachIds: MatchApproachId[];
}

export interface OutputActualSnapshot {
  linkedMatchId: string;
  description: string;
  winner: string;
  matchTime: string;
  rating: number | null;
  notes: string;
  happenedAsPlanned: boolean | null;
  finalNarrative: string;
  changes: string;
  actualConsequences: string;
  finalFollowUp: string;
  reconciledAt: string;
}

export interface OutputSegmentSnapshot {
  segmentId: string;
  type: PlannedSegmentType;
  section: PlannedSegmentSection;
  title: string;
  durationMinutes: number;
  notes: string;
  workers: OutputParticipantSnapshot[];
  storylines: OutputStorylineSnapshot[];
  purpose: string;
  consequences: string;
  followUp: string;
  privateNotes: string;

  matchType: string;
  championship: string;
  championshipId: string;
  championshipStakes: string;
  plannedWinner: string;
  plannedFinish: string;
  matchStory: string;
  keyMoments: string;
  interference: string;
  postMatch: string;
  matchAimId: MatchAimId;
  approaches: OutputApproachSnapshot[];
  advisoryMatchScore: number | null;
  advisoryStarRating: number | null;
  advisorySummary: string;
  competitionId: string;
  competitionRoundLabel: string;

  angleLocation: string;
  angleContentType: string;
  segmentOutput: string;
  audienceTakeaway: string;

  workflowStatus: SegmentWorkflowStatus;
  actual: OutputActualSnapshot | null;
}

export interface PhraseSourceAttribution {
  id: string;
  label: string;
  source: PhraseSourceKind;
  approachId: MatchApproachId | "";
  note: string;
}

export interface OutputVersion {
  id: string;
  stage: OutputLineageStage;
  label: string;
  createdAt: string;
  snapshot: OutputSegmentSnapshot;
  sourceAttribution: PhraseSourceAttribution[];
}

export interface OutputPackageField {
  label: string;
  value: string;
}

export interface OutputProductionPackage {
  id: string;
  kind: OutputPackageKind;
  generatedAt: string;
  directTewFields: OutputPackageField[];
  tewNotes: OutputPackageField[];
  companionOnly: OutputPackageField[];
  warnings: string[];
  conciseText: string;
  fullText: string;
}

export type OutputComparisonStatus = "Same" | "Changed" | "Added" | "Removed" | "Pending";

export interface OutputComparisonRow {
  field: string;
  fromValue: string;
  toValue: string;
  status: OutputComparisonStatus;
}

export interface PlannedActualRow {
  field: string;
  plannedValue: string;
  actualValue: string;
  status: OutputComparisonStatus;
}

export interface PlannedVsActualReport {
  generatedAt: string;
  ready: boolean;
  summary: string;
  rows: PlannedActualRow[];
}

export interface OutputLibraryItem {
  id: string;
  sourceKind: OutputSourceKind;
  sourceQuickSegmentId: string;
  sourceShowId: string;
  sourceShowName: string;
  sourceSegmentId: string;
  type: PlannedSegmentType;
  title: string;
  participantNames: string[];
  storylineNames: string[];
  championship: string;
  competitionRoundLabel: string;
  matchAimId: MatchAimId;
  approachIds: MatchApproachId[];
  versions: OutputVersion[];
  currentVersionId: string;
  productionPackage: OutputProductionPackage;
  plannedVsActual: PlannedVsActualReport;
  createdAt: string;
  updatedAt: string;
}

export interface ReusableOutputStructure {
  id: string;
  name: string;
  type: PlannedSegmentType;
  summary: string;
  durationMinutes: number;
  matchType: string;
  matchAimId: MatchAimId;
  angleLocation: string;
  angleContentType: string;
  purpose: string;
  notes: string;
  requiredSections: string[];
  sourceItemId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShowProductionPacket {
  id: string;
  showId: string;
  showName: string;
  generatedAt: string;
  segmentCount: number;
  matchCount: number;
  angleCount: number;
  warnings: string[];
  segmentItemIds: string[];
  text: string;
  json: string;
}

export interface OutputLibrarySettings {
  activeTab: OutputLibraryTab;
  searchQuery: string;
  typeFilter: "All" | PlannedSegmentType;
  sourceFilter: "All" | OutputSourceKind;
  selectedItemId: string;
  selectedShowId: string;
  compareFromVersionId: string;
  compareToVersionId: string;
}

export interface OutputLibraryUniverse {
  items: OutputLibraryItem[];
  structures: ReusableOutputStructure[];
  showPackets: ShowProductionPacket[];
  settings: OutputLibrarySettings;
}
