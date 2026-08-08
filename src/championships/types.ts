import type { PlannedSegmentType } from "../planner/types";

export type ChampionshipDivision = "Singles" | "Tag Team" | "Trios" | "Other";
export type ChampionshipClassification = "Primary" | "Secondary" | "Specialty" | "Tournament" | "Custom";
export type ChampionshipStatus = "Active" | "Inactive" | "Vacant";
export type ChampionshipReignStatus = "Active" | "Ended" | "Vacated";
export type RankingEligibility = "Eligible" | "Ineligible" | "Unavailable";
export type ChampionshipMatchPurpose = "" | "Defense" | "Vacant Title" | "Tournament Final" | "Unification" | "Other";
export type TitleResultDecision = "" | "Retained" | "Changed Hands" | "Vacated" | "No Contest" | "Unresolved";

export interface ChampionshipCompetitor {
  id: string;
  name: string;
}

export interface ChampionshipReign {
  id: string;
  champions: ChampionshipCompetitor[];
  previousChampions: ChampionshipCompetitor[];
  startDate: string;
  endDate: string;
  startShowId: string;
  startSegmentId: string;
  endShowId: string;
  endSegmentId: string;
  successfulDefenses: number;
  status: ChampionshipReignStatus;
  vacancyReason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContenderRanking {
  id: string;
  rank: number;
  competitors: ChampionshipCompetitor[];
  eligibility: RankingEligibility;
  record: string;
  recentForm: string;
  lastChampionshipOpportunity: string;
  reason: string;
  movement: number;
  locked: boolean;
  updatedAt: string;
  calculatedRank?: number;
  calculatedPoints?: number;
  tied?: boolean;
  overrideReason?: string;
}

export interface ChampionshipResultEvent {
  id: string;
  sourceResultId: string;
  showId: string;
  segmentId: string;
  showDate: string;
  runningOrderPosition: number;
  decision: Exclude<TitleResultDecision, "" | "Unresolved">;
  winners: ChampionshipCompetitor[];
  previousChampions: ChampionshipCompetitor[];
  activityOnly: boolean;
  confirmedAt: string;
}

export interface ChampionshipActivityBaseline {
  status: ChampionshipStatus;
  currentChampions: ChampionshipCompetitor[];
  previousChampions: ChampionshipCompetitor[];
  dateWon: string;
  defenses: number;
  reigns: ChampionshipReign[];
}

export interface ChampionshipProgram {
  championNames: string[];
  leadingChallengerNames: string[];
  additionalContenderNames: string[];
  linkedStorylineId: string;
  linkedRelationshipIds: string[];
  linkedBookingIdeaIds: string[];
  targetPayoffShowId: string;
  summary: string;
}

export interface Championship {
  id: string;
  name: string;
  company: string;
  brand: string;
  division: ChampionshipDivision;
  classification: ChampionshipClassification;
  status: ChampionshipStatus;
  linkedTewTitleId: string;
  linkedTewTitleName: string;
  currentChampions: ChampionshipCompetitor[];
  previousChampions: ChampionshipCompetitor[];
  dateWon: string;
  defenses: number;
  linkedStorylineId: string;
  currentProgram: ChampionshipProgram;
  privateNotes: string;
  inactivityWarningDays: number;
  reigns: ChampionshipReign[];
  rankings: ContenderRanking[];
  legacyNames: string[];
  resultEvents: ChampionshipResultEvent[];
  activityBaseline?: ChampionshipActivityBaseline;
  lastTitleActivityDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChampionshipUniverse {
  championships: Championship[];
}

export interface CompetitiveRecord {
  workerName: string;
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
  unresolved: number;
  matchCount: number;
  singlesMatches: number;
  teamMatches: number;
  championshipMatches: number;
  titleDefenses: number;
  currentStreak: string;
  lastFive: string[];
  opponents: Record<string, { wins: number; losses: number }>;
}

export interface TitleResultSuggestion {
  id: string;
  championshipId: string;
  showId: string;
  segmentId: string;
  showName: string;
  showDate: string;
  segmentTitle: string;
  segmentType: PlannedSegmentType;
  championEntering: string;
  challenger: string;
  actualWinner: string;
  suggestedDecision: TitleResultDecision;
  reason: string;
}

export interface ChampionshipTimelineEntry {
  id: string;
  date: string;
  type: "Title Win" | "Defense" | "Vacancy" | "Planned Match" | "Storyline" | "Booking Idea" | "Ranking";
  title: string;
  detail: string;
  showId: string;
  segmentId: string;
  storylineId: string;
  bookingIdeaId: string;
}

export interface ChampionshipWarning {
  id: string;
  category: "Lineage" | "Champion" | "Match" | "Activity" | "Contender" | "Vacancy" | "Storyline";
  message: string;
  championshipId: string;
  showId: string;
  segmentId: string;
}
