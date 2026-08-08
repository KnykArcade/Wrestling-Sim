import type { MatchAimId, MatchApproachId, MatchWorkerApproachPlan } from "./types";

export const MATCH_STIPULATIONS = ["Standard", "Steel Cage", "Ladder", "Hardcore", "No DQ / Weapons", "Submission Only", "Iron Man", "Custom"] as const;

const STIPULATION_REQUIREMENTS: Record<string, MatchApproachId> = {
  Hardcore: "hardcore-daredevil",
  "No DQ / Weapons": "hardcore-daredevil",
  "Submission Only": "submission-specialist",
  "Iron Man": "pace-controller",
};

const AIM_REQUIREMENTS: Partial<Record<MatchAimId, MatchApproachId>> = {
  "comedy-entertainment": "showman",
  "crowd-work-showcase": "showman",
  "epic-main-event-slow-burn": "big-match-performer",
  "hardcore-war": "hardcore-daredevil",
  "high-spots-spectacle": "aerial-showstopper",
  "monster-fight-hoss-battle": "power-dominance",
  sprint: "high-tempo-hybrid",
  "strong-style-duel": "strong-style-specialist",
  "technical-showcase": "chain-technician",
  "wild-brawl": "heavy-striker-brawler",
};

export interface RequiredApproachRule {
  approachId: MatchApproachId;
  source: "Stipulation" | "Match Aim";
  sourceName: string;
}

export function requiredApproachForMatch(stipulation: string, aimId: MatchAimId): RequiredApproachRule | null {
  const stipulationApproach = STIPULATION_REQUIREMENTS[stipulation];
  if (stipulationApproach) return { approachId: stipulationApproach, source: "Stipulation", sourceName: stipulation };
  const aimApproach = AIM_REQUIREMENTS[aimId];
  return aimApproach ? { approachId: aimApproach, source: "Match Aim", sourceName: aimId } : null;
}

export function enforceRequiredApproachPlan(plan: MatchWorkerApproachPlan, requiredApproachId: MatchApproachId | "", limit: number): MatchWorkerApproachPlan {
  const selected = requiredApproachId
    ? [requiredApproachId, ...plan.selectedApproachIds.filter((id) => id !== requiredApproachId)].slice(0, Math.max(1, limit))
    : plan.selectedApproachIds.slice(0, Math.max(1, limit));
  return {
    ...plan,
    selectedApproachIds: selected,
    lockedApproachIds: plan.lockedApproachIds.filter((id) => selected.includes(id)),
    requiredApproachId,
  };
}
