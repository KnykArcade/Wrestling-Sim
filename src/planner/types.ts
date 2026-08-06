import type { BridgeUniverse } from "../bridge/types";
import type { ChampionshipMatchPurpose, ChampionshipUniverse, TitleResultDecision } from "../championships/types";
import type { CompetitionUniverse } from "../competitions/types";
import type { CreativeControlData } from "../control/types";
import type { HandoffUniverse } from "../handoff/types";
import type { MatchApproachSetup, MatchEngineUniverse } from "../matchEngine/types";
import type { ShowOperationsUniverse } from "../operations/types";
import type { OutputLibraryUniverse } from "../outputLibrary/types";
import type { ProfileLibraryUniverse } from "../profileLibrary/types";
import type { PromotionScheduleUniverse } from "../schedule/types";
import type { ShowSessionUniverse } from "../showSession/types";
import type { SnapshotVaultUniverse } from "../snapshotVault/types";
import type { StartingUniverseState } from "../startingUniverse/types";
import type { TrackerStoryline } from "../storylines/types";
import type { TransferUniverse } from "../transfer/types";
import type { WorkbenchUniverse } from "../workbench/types";
import type { WorkerUniverse } from "../workers/types";
import type { WrapUpUniverse } from "../wrapUp/types";

export type PlannedSegmentType = "match" | "angle";
export type PlannedSegmentSection = "Pre-Show" | "Main Show" | "Post-Show";
export type PlannedShowStatus = "Draft" | "Ready" | "Completed" | "Reconciled";
export type PlannedReferenceSource = "tew" | "manual";
export type AnglePerformanceRole = "Speaking" | "Physical" | "Reaction" | "Presence";
export type SegmentWorkflowStatus = "Planned" | "Entered in TEW" | "Completed" | "Reconciled";
export type ReconciliationPlanOutcome = "Unresolved" | "Yes" | "Partially" | "No";

export interface PlannedWorkerReference {
  id: string;
  name: string;
  role: string;
  side: string;
  source: PlannedReferenceSource;
}

export interface PlannedStorylineReference {
  id: string;
  name: string;
  source: PlannedReferenceSource;
}

export interface ActualMatchSnapshot {
  id: string;
  description: string;
  rating: number | null;
  winner: string;
  matchTime: string;
  notes: string;
  placement: PlannedSegmentSection;
  workers: string[];
}

export interface SegmentReconciliation {
  linkedMatchId: string;
  actualMatch: ActualMatchSnapshot | null;
  happenedAsPlanned: boolean | null;
  happenedAsPlannedDetail: ReconciliationPlanOutcome;
  actualRating: number | null;
  finalNarrative: string;
  changes: string;
  actualConsequences: string;
  finalFollowUp: string;
  reconciledAt: string;
}

export interface ActualShowSnapshot {
  id: string;
  name: string;
  date: string;
  rating: number | null;
  attendance: number | null;
  venue: string;
  company: string;
  broadcast: string;
  sourceFile: string;
}

export interface ShowReconciliation {
  linkedShowId: string;
  actualShow: ActualShowSnapshot;
  linkedAt: string;
  completedAt: string;
  notes: string;
}

export interface PlannedSegment {
  id: string;
  type: PlannedSegmentType;
  section: PlannedSegmentSection;
  title: string;
  durationMinutes: number;
  notes: string;
  workers: PlannedWorkerReference[];
  storylines: PlannedStorylineReference[];
  purpose: string;
  consequences: string;
  followUp: string;
  privateNotes: string;

  matchType: string;
  championship: string;
  championshipId: string;
  championshipMatchPurpose: ChampionshipMatchPurpose;
  championEntering: string;
  challenger: string;
  expectedTitleChange: boolean | null;
  championshipStakes: string;
  titleResultDecision: TitleResultDecision;
  titleResultConfirmedAt: string;
  plannedWinner: string;
  plannedFinish: string;
  matchStory: string;
  keyMoments: string;
  interference: string;
  postMatch: string;
  matchApproachSetup: MatchApproachSetup;
  competitionId: string;
  competitionFixtureId: string;
  competitionRoundLabel: string;

  angleLocation: string;
  angleContentType: string;
  segmentOutput: string;
  audienceTakeaway: string;

  bookingIdeaId: string;
  workflowStatus: SegmentWorkflowStatus;
  reconciliation: SegmentReconciliation;
}

export interface PlannedShow {
  id: string;
  name: string;
  date: string;
  company: string;
  showType: string;
  venue: string;
  expectedMinutes: number;
  status: PlannedShowStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  segments: PlannedSegment[];
  reconciliation: ShowReconciliation | null;
}

export interface PlannerBackup {
  product: "TEW IX Story Tracker";
  version: 22;
  exportedAt: string;
  shows: PlannedShow[];
  storylines: TrackerStoryline[];
  workers: WorkerUniverse;
  control: CreativeControlData;
  championships: ChampionshipUniverse;
  handoff: HandoffUniverse;
  matchEngine: MatchEngineUniverse;
  competitions: CompetitionUniverse;
  bridge: BridgeUniverse;
  transfer: TransferUniverse;
  operations: ShowOperationsUniverse;
  workbench: WorkbenchUniverse;
  profileLibrary: ProfileLibraryUniverse;
  outputLibrary: OutputLibraryUniverse;
  showSession: ShowSessionUniverse;
  promotionSchedule: PromotionScheduleUniverse;
  wrapUp: WrapUpUniverse;
  snapshotVault: SnapshotVaultUniverse;
  startingUniverse: StartingUniverseState;
}

export interface PlannerBackupBundle {
  shows: PlannedShow[];
  storylines: TrackerStoryline[];
  workers: WorkerUniverse;
  control: CreativeControlData;
  championships: ChampionshipUniverse;
  handoff: HandoffUniverse;
  matchEngine: MatchEngineUniverse;
  competitions: CompetitionUniverse;
  bridge: BridgeUniverse;
  transfer: TransferUniverse;
  operations: ShowOperationsUniverse;
  workbench: WorkbenchUniverse;
  profileLibrary: ProfileLibraryUniverse;
  outputLibrary: OutputLibraryUniverse;
  showSession: ShowSessionUniverse;
  promotionSchedule: PromotionScheduleUniverse;
  wrapUp: WrapUpUniverse;
  snapshotVault: SnapshotVaultUniverse;
  startingUniverse: StartingUniverseState;
}
