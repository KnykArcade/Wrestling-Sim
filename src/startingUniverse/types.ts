import type { MatchApproachId, WrestlerSkill } from "../matchEngine/types";

export type StartingUniverseImportFormat = "TEW SQLite" | "TEW ZIP CSV";
export type StartingUniverseStatus = "Imported" | "Review Required" | "Confirmed";
export type StartingUniverseMode = "Standalone Universe" | "TEW Companion";
export type StartingUniverseReviewTab = "source" | "company" | "roster" | "titles" | "teams" | "formulas" | "confirm";
export type StartingRosterClass = "Wrestler" | "Staff" | "Dual Role";
export type StartingReviewSeverity = "Blocking" | "Important" | "Information";

export type ImportedApproachFormulaId =
  | "aerial-specialist"
  | "big-match-performer"
  | "chain-technician"
  | "counter-specialist"
  | "dirty-rulebreaker"
  | "hardcore-daredevil"
  | "heavy-striker-brawler"
  | "high-tempo-hybrid"
  | "opportunistic-schemer"
  | "power-dominance"
  | "psychological-manipulator"
  | "resilient-underdog"
  | "ring-general-pace-controller"
  | "showman"
  | "strong-style-specialist"
  | "submission-specialist";

export type ImportedApproachFormulaSource = WrestlerSkill | "Experience" | "Crowd Work";

export interface ImportedApproachFormulaTerm {
  source: ImportedApproachFormulaSource;
  weight: number;
}

export interface ImportedApproachFormulaDefinition {
  id: ImportedApproachFormulaId;
  name: string;
  workbookName: string;
  currentMatchEngineId: MatchApproachId | null;
  terms: ImportedApproachFormulaTerm[];
  sourceNote: string;
}

export type ImportedApproachRatings = Record<ImportedApproachFormulaId, number>;

export interface StartingUniverseSource {
  format: StartingUniverseImportFormat;
  fileName: string;
  fileSize: number;
  fingerprint: string;
  importedAt: string;
  gameDate: string;
  gameStartDate: string;
  databaseTitle: string;
  databaseVersion: string;
  tableNames: string[];
  warnings: string[];
}

export interface StartingUniverseCompany {
  id: string;
  name: string;
  initials: string;
  profile: string;
  active: boolean;
  userControlled: boolean;
  basedIn: string;
  size: string;
  prestige: number;
  ranking: number;
  momentum: number;
  money: number;
  ownerName: string;
  headBookerName: string;
  styleName: string;
  productBase: string;
}

export interface StartingUniverseWorkerFlags {
  wrestler: boolean;
  occasionalWrestler: boolean;
  referee: boolean;
  announcer: boolean;
  colourCommentator: boolean;
  manager: boolean;
  onScreenPersonality: boolean;
  roadAgent: boolean;
}

export interface StartingUniverseWorker {
  id: string;
  name: string;
  active: boolean;
  basedIn: string;
  status: string;
  style: string;
  bodyType: string;
  nationality: string;
  race: string;
  height: string;
  weight: number;
  debut: string;
  birthday: string;
  picture: string;
  profile: string;
  flags: StartingUniverseWorkerFlags;
  physical: {
    head: number;
    body: number;
    arms: number;
    legs: number;
  };
  skills: Record<WrestlerSkill, number>;
  looks: number;
  starQuality: number;
  reputation: number;
  respect: number;
  experience: number;
  popularity: Record<string, number>;
}

export interface StartingUniverseContract {
  id: string;
  companyId: string;
  companyName: string;
  workerId: string;
  workerName: string;
  ringName: string;
  shortName: string;
  perception: string;
  babyface: boolean;
  gimmick: string;
  gimmickRating: number | null;
  rosterUsage: string;
  intendedRole: string;
  brand: string;
  momentum: number;
  exclusive: boolean;
  written: boolean;
  daysLeft: number;
  datesLeft: number;
  amount: number;
  downside: number;
  contractBegan: string;
  debuted: string;
  flags: StartingUniverseWorkerFlags;
}

export interface StartingUniverseWorkbookMetrics {
  bodyHealth: number;
  popularityRating: number;
  staminaRating: number;
  staminaCapacity: number;
  realInRingExperience: number;
  matchHealth: number;
  crowdWork: number;
  perceptionRating: number;
  gimmickStarRating: number;
  overallApproachRating15: number;
  overallRating: number;
  fanRating: number;
  botchRisk: number;
  approachRatings: ImportedApproachRatings;
}

export interface StartingUniverseRosterDecision {
  workerId: string;
  contractId: string;
  included: boolean;
  rosterClass: StartingRosterClass;
  primaryRole: string;
  addedFromWorld: boolean;
  note: string;
  workbookMetrics: StartingUniverseWorkbookMetrics;
}

export interface StartingUniverseTitle {
  id: string;
  companyId: string;
  companyName: string;
  importedName: string;
  style: string;
  level: string;
  prestige: number;
  function: string;
  active: boolean;
  holderIds: string[];
  holderNames: string[];
  defences: number;
  annualTitle: boolean;
  annualEvent: string;
  reignBegan: string;
  lastDefence: string;
  genderLimit: string;
  minimumWeight: number;
  maximumWeight: number;
}

export interface StartingUniverseTitleDecision {
  titleId: string;
  included: boolean;
  gameName: string;
  acknowledged: boolean;
  note: string;
}

export interface StartingUniverseTvShow {
  id: string;
  companyId: string;
  companyName: string;
  importedName: string;
  prestige: number;
  bShow: boolean;
  lengthMinutes: number;
  brand: string;
  showDay: string;
  currentlyOnAir: boolean;
  dormant: boolean;
  announcerNames: string[];
}

export interface StartingUniverseTvShowDecision {
  tvShowId: string;
  included: boolean;
  gameName: string;
  lengthMinutes: number;
  showDay: string;
  acknowledged: boolean;
}

export interface StartingUniverseTagTeamVariant {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  worker1Id: string;
  worker1Name: string;
  worker2Id: string;
  worker2Name: string;
  teamType: string;
  experience: number;
  finisher: string;
  active: boolean;
  formed: string;
}

export interface StartingUniverseTagTeamDecision {
  id: string;
  workerIds: [string, string];
  workerNames: string[];
  selectedVariantId: string;
  included: boolean;
  gameName: string;
  acknowledged: boolean;
  variantIds: string[];
  note: string;
}

export interface StartingUniverseStable {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  active: boolean;
  type: string;
  members: Array<{ workerId: string; workerName: string; role: string }>;
}

export interface StartingUniverseStableDecision {
  stableId: string;
  included: boolean;
  gameName: string;
  acknowledged: boolean;
}

export interface StartingUniverseRelationship {
  id: string;
  worker1Id: string;
  worker1Name: string;
  worker2Id: string;
  worker2Name: string;
  family: string;
  personal: string;
  romantic: string;
  mentorProtege: string;
}

export interface StartingUniverseAttribute {
  workerId: string;
  workerName: string;
  attribute: string;
  hidden: boolean;
}

export interface StartingUniverseReviewIssue {
  id: string;
  severity: StartingReviewSeverity;
  area: "Source" | "Company" | "Roster" | "Titles" | "Television" | "Tag Teams" | "Stables" | "Formulas";
  message: string;
  detail: string;
  relatedId: string;
}

export interface StartingUniverseReview {
  roster: StartingUniverseRosterDecision[];
  titles: StartingUniverseTitleDecision[];
  tvShows: StartingUniverseTvShowDecision[];
  tagTeams: StartingUniverseTagTeamDecision[];
  stables: StartingUniverseStableDecision[];
  issues: StartingUniverseReviewIssue[];
  rosterAcknowledged: boolean;
  titlesAcknowledged: boolean;
  teamsAcknowledged: boolean;
}

export interface StartingUniverseRecord {
  id: string;
  name: string;
  mode: StartingUniverseMode;
  status: StartingUniverseStatus;
  source: StartingUniverseSource;
  playableCompanyId: string;
  companies: StartingUniverseCompany[];
  workers: StartingUniverseWorker[];
  contracts: StartingUniverseContract[];
  titles: StartingUniverseTitle[];
  tvShows: StartingUniverseTvShow[];
  tagTeamVariants: StartingUniverseTagTeamVariant[];
  stables: StartingUniverseStable[];
  relationships: StartingUniverseRelationship[];
  attributes: StartingUniverseAttribute[];
  review: StartingUniverseReview;
  approachFormulaVersion: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
}

export interface StartingUniverseManifestRecord {
  id: string;
  name: string;
  status: StartingUniverseStatus;
  mode: StartingUniverseMode;
  playableCompanyId: string;
  playableCompanyName: string;
  sourceFormat: StartingUniverseImportFormat;
  sourceFileName: string;
  sourceFingerprint: string;
  gameDate: string;
  companyCount: number;
  workerCount: number;
  contractCount: number;
  rosterCount: number;
  titleCount: number;
  tagTeamCount: number;
  approachFormulaVersion: string;
  estimatedBytes: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
}

export interface StartingUniverseState {
  manifest: StartingUniverseManifestRecord[];
  activeUniverseId: string;
  selectedTab: StartingUniverseReviewTab;
  lastExportedAt: string;
  lastImportedAt: string;
}

export interface StartingUniversePackage {
  product: "Wrestling Sim Starting Universe";
  version: 1;
  exportedAt: string;
  state: StartingUniverseState;
  records: StartingUniverseRecord[];
}