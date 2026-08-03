import { MATCH_AIMS } from "../matchEngine/catalog";
import { IMPORTED_APPROACH_FORMULAS } from "../startingUniverse/formulas";
import type { ImportedApproachFormulaId } from "../startingUniverse/types";
import type { MatchAimId } from "../matchEngine/types";
import type { ResolutionApproachDefinition, ResolutionApproachId } from "./types";

const META: Record<ResolutionApproachId, Omit<ResolutionApproachDefinition, "id" | "name" | "workbookName">> = {
  "aerial-specialist": { pace: 3, staminaCost: 3, paceSource: "Workbook", summary: "Dives, springboards, and high-risk aerial offense." },
  "big-match-performer": { pace: 2, staminaCost: 2, paceSource: "Workbook", summary: "Escalating drama, near falls, and major-match execution." },
  "chain-technician": { pace: 1, staminaCost: 1, paceSource: "Workbook", summary: "Fluid transitions, mat control, and technical exchanges." },
  "counter-specialist": { pace: 1, staminaCost: 1, paceSource: "Wrestling Sim Extension", summary: "Anticipates offense and turns an opponent's strengths against them." },
  "dirty-rulebreaker": { pace: 1, staminaCost: 1, paceSource: "Workbook", summary: "Shortcuts, cheating, and intelligent rule bending." },
  "hardcore-daredevil": { pace: 3, staminaCost: 3, paceSource: "Workbook", summary: "Weapons, stunt bumps, and dangerous chaos." },
  "heavy-striker-brawler": { pace: 2, staminaCost: 2, paceSource: "Workbook", summary: "Heavy strikes, fists, and rough fighting." },
  "high-tempo-hybrid": { pace: 3, staminaCost: 3, paceSource: "Workbook", summary: "Fast sequences and relentless workrate." },
  "opportunistic-schemer": { pace: 1, staminaCost: 1, paceSource: "Workbook", summary: "Waits for openings and steals decisive moments." },
  "power-dominance": { pace: 2, staminaCost: 3, paceSource: "Workbook", summary: "Strength, control, and overwhelming offense." },
  "psychological-manipulator": { pace: 1, staminaCost: 1, paceSource: "Workbook", summary: "Mind games, taunts, and emotional disruption." },
  "resilient-underdog": { pace: 2, staminaCost: 2, paceSource: "Workbook", summary: "Damage selling, survival, and fiery comebacks." },
  "ring-general-pace-controller": { pace: 1, staminaCost: 1, paceSource: "Workbook", summary: "Controls structure, tempo, and the direction of the match." },
  "showman": { pace: 1, staminaCost: 2, paceSource: "Workbook", summary: "Crowd interaction, personality, and presentation." },
  "strong-style-specialist": { pace: 2, staminaCost: 2, paceSource: "Workbook", summary: "Stiff strikes, fighting spirit, and high intensity." },
  "submission-specialist": { pace: 1, staminaCost: 2, paceSource: "Workbook", summary: "Limb targeting, holds, and submission control." },
};

export const RESOLUTION_APPROACHES: ResolutionApproachDefinition[] = IMPORTED_APPROACH_FORMULAS.map((formula) => ({
  id: formula.id,
  name: formula.name,
  workbookName: formula.workbookName,
  ...META[formula.id],
}));

export const RESOLUTION_CALCULATION_VERSION = "wrestling-sim-singles-v1";

export const IMPORTANCE_MODIFIERS = {
  Television: { performance: 0, pressure: 0, durationVariance: 0.08 },
  Feature: { performance: 1.5, pressure: 1, durationVariance: 0.07 },
  "Main Event": { performance: 2.5, pressure: 2, durationVariance: 0.06 },
  Championship: { performance: 3, pressure: 3, durationVariance: 0.05 },
  Tournament: { performance: 2, pressure: 2, durationVariance: 0.05 },
} as const;

export const FINISH_TYPES_BY_APPROACH: Partial<Record<ResolutionApproachId, string[]>> = {
  "aerial-specialist": ["Pinfall", "Pinfall", "Knockout"],
  "big-match-performer": ["Pinfall", "Submission", "Referee Stoppage"],
  "chain-technician": ["Submission", "Pinfall", "Submission"],
  "counter-specialist": ["Pinfall", "Submission", "Pinfall"],
  "dirty-rulebreaker": ["Pinfall", "Disqualification", "Count Out"],
  "hardcore-daredevil": ["Pinfall", "Knockout", "Referee Stoppage"],
  "heavy-striker-brawler": ["Pinfall", "Knockout", "Referee Stoppage"],
  "high-tempo-hybrid": ["Pinfall", "Pinfall", "Submission"],
  "opportunistic-schemer": ["Pinfall", "Count Out", "Disqualification"],
  "power-dominance": ["Pinfall", "Knockout", "Referee Stoppage"],
  "psychological-manipulator": ["Pinfall", "Submission", "Disqualification"],
  "resilient-underdog": ["Pinfall", "Submission", "Pinfall"],
  "ring-general-pace-controller": ["Pinfall", "Submission", "Referee Stoppage"],
  "showman": ["Pinfall", "Count Out", "Pinfall"],
  "strong-style-specialist": ["Knockout", "Pinfall", "Referee Stoppage"],
  "submission-specialist": ["Submission", "Submission", "Pinfall"],
};

export function resolutionApproach(id: ResolutionApproachId): ResolutionApproachDefinition {
  return RESOLUTION_APPROACHES.find((approach) => approach.id === id) ?? RESOLUTION_APPROACHES[0];
}

export function idealPaceForAim(aimId: MatchAimId): number {
  return MATCH_AIMS.find((aim) => aim.id === aimId)?.idealPace ?? 0;
}

export function formulaForApproach(id: ImportedApproachFormulaId) {
  return IMPORTED_APPROACH_FORMULAS.find((formula) => formula.id === id) ?? IMPORTED_APPROACH_FORMULAS[0];
}

export const APPROACH_INTERACTIONS: Partial<Record<ResolutionApproachId, Partial<Record<ResolutionApproachId, number>>>> = {
  "counter-specialist": {
    "aerial-specialist": 6,
    "high-tempo-hybrid": 5,
    "power-dominance": 4,
    "dirty-rulebreaker": 3,
    "opportunistic-schemer": 3,
    "ring-general-pace-controller": -2,
  },
  "ring-general-pace-controller": {
    "high-tempo-hybrid": 4,
    "hardcore-daredevil": 4,
    "showman": 3,
    "counter-specialist": 2,
  },
  "submission-specialist": {
    "power-dominance": 4,
    "heavy-striker-brawler": 3,
    "strong-style-specialist": 3,
  },
  "dirty-rulebreaker": {
    "resilient-underdog": 4,
    "showman": 2,
  },
  "opportunistic-schemer": {
    "aerial-specialist": 3,
    "high-tempo-hybrid": 3,
    "big-match-performer": 2,
  },
  "psychological-manipulator": {
    "resilient-underdog": 3,
    "big-match-performer": 3,
    "strong-style-specialist": 2,
  },
  "power-dominance": {
    "aerial-specialist": 3,
    "showman": 3,
    "chain-technician": 2,
  },
  "resilient-underdog": {
    "power-dominance": 3,
    "heavy-striker-brawler": 3,
    "dirty-rulebreaker": 2,
  },
};
