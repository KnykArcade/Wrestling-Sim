import type { WrestlerSkill } from "../matchEngine/types";
import type {
  ImportedApproachFormulaDefinition,
  ImportedApproachFormulaId,
  ImportedApproachFormulaSource,
  ImportedApproachRatings,
  StartingUniverseContract,
  StartingUniverseWorker,
  StartingUniverseWorkbookMetrics,
} from "./types";

export const APPROACH_FORMULA_CATALOG_VERSION = "match-system-2026-01-31-all-16";

export const IMPORTED_APPROACH_FORMULAS: ImportedApproachFormulaDefinition[] = [
  {
    id: "aerial-specialist",
    name: "Aerial Specialist",
    workbookName: "Aerial Specialist",
    currentMatchEngineId: "aerial-showstopper",
    terms: [
      { source: "Aerial", weight: 0.4 },
      { source: "Athleticism", weight: 0.3 },
      { source: "Flashiness", weight: 0.2 },
      { source: "Basics", weight: 0.1 },
    ],
    sourceNote: "Workers Database column AL.",
  },
  {
    id: "big-match-performer",
    name: "Big Match Performer",
    workbookName: "Big Match Performer",
    currentMatchEngineId: "big-match-performer",
    terms: [
      { source: "Psychology", weight: 0.4 },
      { source: "Consistency", weight: 0.3 },
      { source: "Charisma", weight: 0.2 },
      { source: "Stamina", weight: 0.1 },
    ],
    sourceNote: "Workers Database column AM.",
  },
  {
    id: "chain-technician",
    name: "Chain Technician",
    workbookName: "Chain Technician",
    currentMatchEngineId: "chain-technician",
    terms: [
      { source: "Technical", weight: 0.3 },
      { source: "Basics", weight: 0.3 },
      { source: "Consistency", weight: 0.2 },
      { source: "Psychology", weight: 0.2 },
    ],
    sourceNote: "Workers Database column AN.",
  },
  {
    id: "counter-specialist",
    name: "Counter Specialist",
    workbookName: "Counter Specialist",
    currentMatchEngineId: null,
    terms: [
      { source: "Basics", weight: 0.35 },
      { source: "Psychology", weight: 0.25 },
      { source: "Consistency", weight: 0.25 },
      { source: "Technical", weight: 0.15 },
    ],
    sourceNote: "Workers Database column AO. Retained as a distinct formula for the standalone outcome engine.",
  },
  {
    id: "dirty-rulebreaker",
    name: "Dirty Rulebreaker",
    workbookName: "Dirty Rulebreaker",
    currentMatchEngineId: "dirty-rulebreaker",
    terms: [
      { source: "Psychology", weight: 0.4 },
      { source: "Menace", weight: 0.25 },
      { source: "Charisma", weight: 0.2 },
      { source: "Consistency", weight: 0.15 },
    ],
    sourceNote: "Workers Database column AP.",
  },
  {
    id: "hardcore-daredevil",
    name: "Hardcore Daredevil",
    workbookName: "Hardcore Daredevil",
    currentMatchEngineId: "hardcore-daredevil",
    terms: [
      { source: "Hardcore", weight: 0.4 },
      { source: "Toughness", weight: 0.25 },
      { source: "Resilience", weight: 0.2 },
      { source: "Safety", weight: 0.15 },
    ],
    sourceNote: "Workers Database column AQ.",
  },
  {
    id: "heavy-striker-brawler",
    name: "Heavy Striker / Brawler",
    workbookName: "Heavy Striker/Brawler",
    currentMatchEngineId: "heavy-striker-brawler",
    terms: [
      { source: "Brawling", weight: 0.4 },
      { source: "Toughness", weight: 0.25 },
      { source: "Resilience", weight: 0.2 },
      { source: "Menace", weight: 0.15 },
    ],
    sourceNote: "Workers Database column AR.",
  },
  {
    id: "high-tempo-hybrid",
    name: "High Tempo Hybrid",
    workbookName: "High Tempo Hybrid",
    currentMatchEngineId: "high-tempo-hybrid",
    terms: [
      { source: "Athleticism", weight: 0.35 },
      { source: "Stamina", weight: 0.3 },
      { source: "Consistency", weight: 0.2 },
      { source: "Basics", weight: 0.15 },
    ],
    sourceNote: "Workers Database column AS.",
  },
  {
    id: "opportunistic-schemer",
    name: "Opportunistic Schemer",
    workbookName: "Opportunistic Schemer",
    currentMatchEngineId: "opportunistic-schemer",
    terms: [
      { source: "Psychology", weight: 0.4 },
      { source: "Basics", weight: 0.2 },
      { source: "Charisma", weight: 0.2 },
      { source: "Consistency", weight: 0.2 },
    ],
    sourceNote: "Workers Database column AT.",
  },
  {
    id: "power-dominance",
    name: "Power Dominance",
    workbookName: "Power Dominance",
    currentMatchEngineId: "power-dominance",
    terms: [
      { source: "Power", weight: 0.5 },
      { source: "Toughness", weight: 0.2 },
      { source: "Menace", weight: 0.15 },
      { source: "Stamina", weight: 0.15 },
    ],
    sourceNote: "Workers Database column AU.",
  },
  {
    id: "psychological-manipulator",
    name: "Psychological Manipulator",
    workbookName: "Psychological Manipulator",
    currentMatchEngineId: "psychological-manipulator",
    terms: [
      { source: "Psychology", weight: 0.45 },
      { source: "Charisma", weight: 0.25 },
      { source: "Menace", weight: 0.2 },
      { source: "Brawling", weight: 0.1 },
    ],
    sourceNote: "Workers Database column AV.",
  },
  {
    id: "resilient-underdog",
    name: "Resilient Underdog",
    workbookName: "Resilient Underdog",
    currentMatchEngineId: "resilient-underdog",
    terms: [
      { source: "Selling", weight: 0.4 },
      { source: "Resilience", weight: 0.3 },
      { source: "Toughness", weight: 0.2 },
      { source: "Athleticism", weight: 0.1 },
    ],
    sourceNote: "Workers Database column AW.",
  },
  {
    id: "ring-general-pace-controller",
    name: "Pace Controller",
    workbookName: "Ring General",
    currentMatchEngineId: "pace-controller",
    terms: [
      { source: "Psychology", weight: 1 / 6 },
      { source: "Experience", weight: 1 / 6 },
      { source: "Technical", weight: 1 / 6 },
      { source: "Basics", weight: 1 / 6 },
      { source: "Crowd Work", weight: 1 / 6 },
      { source: "Consistency", weight: 1 / 6 },
    ],
    sourceNote: "Workers Database column AX. The workbook name Ring General is preserved and exposed as Pace Controller in the companion.",
  },
  {
    id: "showman",
    name: "Showman",
    workbookName: "Showman",
    currentMatchEngineId: "showman",
    terms: [
      { source: "Charisma", weight: 0.45 },
      { source: "Flashiness", weight: 0.25 },
      { source: "Basics", weight: 0.15 },
      { source: "Selling", weight: 0.15 },
    ],
    sourceNote: "Workers Database column AY.",
  },
  {
    id: "strong-style-specialist",
    name: "Strong Style Specialist",
    workbookName: "Strong Style Specialist",
    currentMatchEngineId: "strong-style-specialist",
    terms: [
      { source: "Puroresu", weight: 0.4 },
      { source: "Toughness", weight: 0.3 },
      { source: "Resilience", weight: 0.2 },
      { source: "Consistency", weight: 0.1 },
    ],
    sourceNote: "Workers Database column AZ.",
  },
  {
    id: "submission-specialist",
    name: "Submission Specialist",
    workbookName: "Submission Specialist",
    currentMatchEngineId: "submission-specialist",
    terms: [
      { source: "Technical", weight: 0.4 },
      { source: "Psychology", weight: 0.3 },
      { source: "Basics", weight: 0.15 },
      { source: "Toughness", weight: 0.15 },
    ],
    sourceNote: "Workers Database column BA.",
  },
];

const WORKBOOK_US_POPULARITY_FIELDS = [
  "Great_Lakes",
  "Mid_Atlantic",
  "Mid_South",
  "Mid_West",
  "New_England",
  "North_West",
  "South_East",
  "South_West",
  "Tri_State",
  "Puerto_Rico",
  "Hawaii",
] as const;

const WORKBOOK_APPROACH_AVERAGE_15: ImportedApproachFormulaId[] = [
  "aerial-specialist",
  "big-match-performer",
  "chain-technician",
  "counter-specialist",
  "dirty-rulebreaker",
  "hardcore-daredevil",
  "heavy-striker-brawler",
  "high-tempo-hybrid",
  "opportunistic-schemer",
  "power-dominance",
  "psychological-manipulator",
  "resilient-underdog",
  "showman",
  "strong-style-specialist",
  "submission-specialist",
];

function finite(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function perceptionRating(value: string): number {
  const normalized = value.trim().toLowerCase().replace(/[^a-z]+/g, "");
  if (normalized === "majorstar") return 5;
  if (normalized === "star") return 4;
  if (normalized === "wellknown") return 3;
  if (normalized === "recognisable" || normalized === "recognizable") return 2;
  if (normalized === "unimportant") return 1;
  return 0;
}

export function gimmickStarRating(value: number | null): number {
  const rating = finite(value, 0);
  if (rating <= 0) return 0;
  if (rating >= 85) return 5;
  if (rating >= 76) return 4;
  if (rating >= 60) return 3;
  if (rating >= 50) return 2;
  return 1;
}

export function staminaCapacityFromWorkbookRating(value: number): number {
  if (value >= 75) return 9;
  if (value >= 70) return 7;
  if (value >= 65) return 6;
  if (value >= 60) return 5;
  if (value >= 50) return 4;
  if (value >= 30) return 3;
  if (value >= 20) return 2;
  return 1;
}

function popularityRating(worker: StartingUniverseWorker, contract: StartingUniverseContract | null): number {
  const regionTotal = WORKBOOK_US_POPULARITY_FIELDS.reduce((total, field) => total + finite(worker.popularity[field]), 0);
  const gimmick = finite(contract?.gimmickRating, 0);
  return clamp(Math.round((
    regionTotal +
    worker.starQuality +
    worker.experience * 0.25 +
    gimmick * 0.25 +
    worker.looks * 0.1
  ) / 11.6));
}

export function calculateImportedApproachRatings(
  worker: StartingUniverseWorker,
  crowdWork: number,
): ImportedApproachRatings {
  const inputs: Partial<Record<ImportedApproachFormulaSource, number>> = {
    ...worker.skills,
    Experience: worker.experience,
    "Crowd Work": crowdWork,
  };
  return Object.fromEntries(IMPORTED_APPROACH_FORMULAS.map((formula) => [
    formula.id,
    round(formula.terms.reduce((total, term) => total + finite(inputs[term.source]) * term.weight, 0)),
  ])) as ImportedApproachRatings;
}

export function calculateWorkbookMetrics(
  worker: StartingUniverseWorker,
  contract: StartingUniverseContract | null,
): StartingUniverseWorkbookMetrics {
  const bodyHealth = round((worker.physical.head + worker.physical.body + worker.physical.arms + worker.physical.legs) / 4);
  const popularity = popularityRating(worker, contract);
  const crowdWork = Math.round((worker.looks + worker.starQuality + worker.skills.Charisma + popularity) / 4);
  const approachRatings = calculateImportedApproachRatings(worker, crowdWork);
  const overallApproachRating15 = round(WORKBOOK_APPROACH_AVERAGE_15.reduce((total, id) => total + approachRatings[id], 0) / WORKBOOK_APPROACH_AVERAGE_15.length);
  const staminaRating = round((
    worker.skills.Selling +
    worker.skills.Stamina +
    worker.skills.Resilience +
    worker.experience +
    worker.skills.Athleticism +
    worker.skills.Toughness
  ) / 6);
  const realInRingExperience = round((worker.reputation + worker.respect + worker.experience) / 3);
  const matchHealth = Math.round(bodyHealth * 0.8 + worker.skills.Resilience * 0.1 + worker.skills.Toughness * 0.1);
  const overallRating = round((overallApproachRating15 + bodyHealth + popularity + realInRingExperience + matchHealth) / 5);
  const perception = perceptionRating(contract?.perception ?? "");
  const gimmick = finite(contract?.gimmickRating, 0);
  const fanRating = round((overallRating + popularity + perception * 20 + gimmick) / 4);
  const botchRisk = round(clamp(100 - (
    realInRingExperience +
    matchHealth +
    worker.skills.Safety +
    worker.skills.Basics +
    worker.skills.Consistency
  ) / 5));
  return {
    bodyHealth,
    popularityRating: popularity,
    staminaRating,
    staminaCapacity: staminaCapacityFromWorkbookRating(staminaRating),
    realInRingExperience,
    matchHealth,
    crowdWork,
    perceptionRating: perception,
    gimmickStarRating: gimmickStarRating(contract?.gimmickRating ?? null),
    overallApproachRating15,
    overallRating,
    fanRating,
    botchRisk,
    approachRatings,
  };
}

export function formulaLabel(formula: ImportedApproachFormulaDefinition): string {
  return formula.terms.map((term) => `${term.source} × ${round(term.weight * 100, 2)}%`).join(" + ");
}

export function skillRecord(values: Partial<Record<WrestlerSkill, number>>): Record<WrestlerSkill, number> {
  const skills: WrestlerSkill[] = [
    "Aerial", "Athleticism", "Basics", "Brawling", "Charisma", "Consistency", "Flashiness", "Hardcore", "Menace", "Power", "Psychology", "Puroresu", "Resilience", "Safety", "Selling", "Stamina", "Technical", "Toughness",
  ];
  return Object.fromEntries(skills.map((skill) => [skill, clamp(finite(values[skill]))])) as Record<WrestlerSkill, number>;
}
