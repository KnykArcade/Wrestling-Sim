import { AIM_APPROACH_HINTS } from "../matchEngine/profileCatalog";
import {
  approachSlotsForDuration,
  calculateMentalStateScore,
  classifyMentalState,
  createMatchEngineId,
  evaluatePace,
  evaluateStamina,
  getWrestlerStyle,
  mentalSwingProbability,
  profileStaminaCapacity,
} from "../matchEngine/model";
import { advisoryStarRating } from "../matchEngine/performance";
import type { MatchEngineProfile } from "../matchEngine/types";
import { IMPORTED_APPROACH_FORMULAS } from "../startingUniverse/formulas";
import type { ImportedApproachFormulaId, ImportedApproachFormulaSource, StartingUniverseWorkbookMetrics } from "../startingUniverse/types";
import {
  APPROACH_INTERACTIONS,
  FINISH_TYPES_BY_APPROACH,
  IMPORTANCE_MODIFIERS,
  RESOLUTION_APPROACHES,
  RESOLUTION_CALCULATION_VERSION,
  formulaForApproach,
  idealPaceForAim,
  resolutionApproach,
} from "./catalog";
import type {
  MatchResolutionApproachScore,
  MatchResolutionAttempt,
  MatchResolutionEngineResult,
  MatchResolutionFinalResult,
  MatchResolutionRecord,
  MatchResolutionSetup,
  MatchResolutionWorkerResult,
  MatchResolutionWorkerSettings,
  MatchResolutionWorkerSource,
  ResolveSinglesMatchInput,
  ResolutionApproachId,
} from "./types";

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function average(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let value = hashSeed(seed) || 1;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function matchResolutionSetupFingerprint(setup: MatchResolutionSetup, sources: MatchResolutionWorkerSource[]): string {
  const sourceState = sources.map((source) => ({
    workerKey: source.profile.workerKey,
    profileUpdatedAt: source.profile.updatedAt,
    profile: {
      overall: source.profile.overall,
      health: source.profile.health,
      popularity: source.profile.popularity,
      experience: source.profile.experience,
      fanReaction: source.profile.fanReaction,
      gimmick: source.profile.gimmick,
      styleId: source.profile.styleId,
      skills: source.profile.skills,
    },
    workbookMetrics: source.workbookMetrics,
  }));
  return hashSeed(stableStringify({ setup, sourceState, version: RESOLUTION_CALCULATION_VERSION })).toString(16).padStart(8, "0");
}

function crowdWorkEstimate(profile: MatchEngineProfile): number {
  return clamp(average([
    profile.skills.Charisma,
    profile.popularity,
    profile.fanReaction * 20,
    profile.gimmick * 20,
  ]));
}

function formulaInput(profile: MatchEngineProfile, source: ImportedApproachFormulaSource): number {
  if (source === "Experience") return profile.experience;
  if (source === "Crowd Work") return crowdWorkEstimate(profile);
  return profile.skills[source] ?? 0;
}

export function resolutionApproachRating(
  profile: MatchEngineProfile,
  workbookMetrics: StartingUniverseWorkbookMetrics | null,
  approachId: ResolutionApproachId,
): number {
  const imported = workbookMetrics?.approachRatings[approachId];
  if (typeof imported === "number" && Number.isFinite(imported)) return round(imported);
  const formula = formulaForApproach(approachId);
  return round(formula.terms.reduce((total, term) => total + formulaInput(profile, term.source) * term.weight, 0));
}

function paceSelectionScore(idealPace: number, approachPace: number): number {
  if (idealPace === 0) return 2;
  const difference = Math.abs(idealPace - approachPace * 2);
  if (difference === 0) return 8;
  if (difference === 1) return 5;
  if (difference === 2) return 2;
  if (difference === 3) return -2;
  return -6;
}

function aimFitScore(aimId: MatchResolutionSetup["aimId"], approachId: ResolutionApproachId): number {
  const formula = formulaForApproach(approachId);
  const currentId = formula.currentMatchEngineId;
  if (currentId && AIM_APPROACH_HINTS[aimId]?.includes(currentId)) return 7;
  const custom: Partial<Record<MatchResolutionSetup["aimId"], ResolutionApproachId[]>> = {
    "technical-showcase": ["counter-specialist", "chain-technician", "submission-specialist", "ring-general-pace-controller"],
    "competitive-tv-match": ["counter-specialist", "high-tempo-hybrid", "big-match-performer"],
    "epic-main-event-slow-burn": ["big-match-performer", "ring-general-pace-controller", "psychological-manipulator"],
    "storytelling-match": ["ring-general-pace-controller", "psychological-manipulator", "resilient-underdog"],
    "strong-style-duel": ["strong-style-specialist", "counter-specialist", "heavy-striker-brawler"],
    "underdog-drama": ["resilient-underdog", "psychological-manipulator", "counter-specialist"],
    "high-spots-spectacle": ["aerial-specialist", "high-tempo-hybrid", "counter-specialist"],
    "hardcore-war": ["hardcore-daredevil", "heavy-striker-brawler", "resilient-underdog"],
    "monster-fight-hoss-battle": ["power-dominance", "heavy-striker-brawler", "strong-style-specialist"],
    "wild-brawl": ["heavy-striker-brawler", "hardcore-daredevil", "dirty-rulebreaker"],
    "comedy-entertainment": ["showman", "dirty-rulebreaker", "opportunistic-schemer"],
    "crowd-work-showcase": ["showman", "psychological-manipulator", "big-match-performer"],
  };
  return custom[aimId]?.includes(approachId) ? 7 : 0;
}

function styleFitScore(profile: MatchEngineProfile, approachId: ResolutionApproachId): number {
  const currentId = formulaForApproach(approachId).currentMatchEngineId;
  return currentId && getWrestlerStyle(profile).approachBoosts.includes(currentId) ? 7 : 0;
}

function opponentProfileFit(approachId: ResolutionApproachId, opponent: MatchEngineProfile): number {
  if (approachId === "counter-specialist") return round(Math.max(opponent.skills.Aerial, opponent.skills.Athleticism, opponent.skills.Power) / 20, 2);
  if (approachId === "submission-specialist") return round((opponent.skills.Power + opponent.skills.Toughness) / 50, 2);
  if (approachId === "ring-general-pace-controller") return round((opponent.skills.Athleticism + opponent.skills.Stamina + opponent.skills.Flashiness) / 75, 2);
  if (approachId === "psychological-manipulator") return round((100 - opponent.skills.Consistency) / 20, 2);
  if (approachId === "opportunistic-schemer") return round((100 - opponent.skills.Basics) / 25, 2);
  if (approachId === "resilient-underdog") return opponent.overall >= 75 ? 3 : 1;
  return 0;
}

function scoreApproach(
  source: MatchResolutionWorkerSource,
  opponent: MatchResolutionWorkerSource,
  setup: MatchResolutionSetup,
  approachId: ResolutionApproachId,
): MatchResolutionApproachScore {
  const approach = resolutionApproach(approachId);
  const rating = resolutionApproachRating(source.profile, source.workbookMetrics, approachId);
  const aimFit = aimFitScore(setup.aimId, approachId);
  const styleFit = styleFitScore(source.profile, approachId);
  const opponentFit = opponentProfileFit(approachId, opponent.profile);
  const paceFit = paceSelectionScore(idealPaceForAim(setup.aimId), approach.pace);
  const staminaEfficiency = (4 - approach.staminaCost) * 1.5;
  const total = round(rating + aimFit + styleFit + opponentFit + paceFit + staminaEfficiency);
  return {
    approachId,
    approachName: approach.name,
    rating,
    aimFit,
    styleFit,
    opponentFit,
    paceFit,
    staminaEfficiency,
    total,
    reasons: [
      `${rating.toFixed(1)} ${source.workbookMetrics ? "workbook-derived" : "profile-derived"} rating`,
      aimFit ? `${setup.aimId} match-aim fit` : "No direct match-aim bonus",
      styleFit ? `${getWrestlerStyle(source.profile).name} style fit` : "No wrestler-style bonus",
      opponentFit ? `${opponentFit.toFixed(1)} opponent interaction fit` : "No opponent-specific bonus",
      `Pace ${approach.pace}; stamina cost ${approach.staminaCost}`,
      approach.paceSource === "Wrestling Sim Extension" ? "Counter Specialist pace and stamina are a documented Wrestling Sim extension because the workbook stores its rating formula but omits it from the pace table." : "Pace and stamina come from the workbook lookup table.",
    ],
  };
}

function combinations<T>(values: T[], count: number): T[][] {
  if (count === 0) return [[]];
  if (count < 0 || count > values.length) return [];
  const result: T[][] = [];
  for (let index = 0; index <= values.length - count; index += 1) {
    for (const tail of combinations(values.slice(index + 1), count - 1)) result.push([values[index], ...tail]);
  }
  return result;
}

function uniqueApproaches(values: ResolutionApproachId[]): ResolutionApproachId[] {
  return Array.from(new Set(values)).filter((id) => IMPORTED_APPROACH_FORMULAS.some((formula) => formula.id === id));
}

function selectedApproaches(
  worker: MatchResolutionWorkerSettings,
  source: MatchResolutionWorkerSource,
  opponent: MatchResolutionWorkerSource,
  setup: MatchResolutionSetup,
): { ids: ResolutionApproachId[]; scores: MatchResolutionApproachScore[] } {
  const slots = approachSlotsForDuration(setup.durationMinutes);
  const locked = uniqueApproaches(worker.lockedApproachIds).slice(0, slots);
  const manual = uniqueApproaches(worker.manualApproachIds).filter((id) => !locked.includes(id));
  const fixed = uniqueApproaches([...locked, ...(worker.approachMode === "Manual" ? manual : [])]).slice(0, slots);
  const candidates = RESOLUTION_APPROACHES.map((approach) => approach.id).filter((id) => !fixed.includes(id));
  const candidateSets = combinations(candidates, Math.max(0, slots - fixed.length)).map((values) => [...fixed, ...values]);
  let bestIds = fixed;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestScores: MatchResolutionApproachScore[] = fixed.map((id) => scoreApproach(source, opponent, setup, id));
  for (const ids of candidateSets.length ? candidateSets : [fixed]) {
    const scores = ids.map((id) => scoreApproach(source, opponent, setup, id));
    const staminaUsed = ids.reduce((total, id) => total + resolutionApproach(id).staminaCost, 0);
    const staminaAvailable = source.workbookMetrics?.staminaCapacity ?? profileStaminaCapacity(source.profile);
    const stamina = evaluateStamina(staminaUsed, staminaAvailable);
    const actualPace = ids.length ? round(average(ids.map((id) => resolutionApproach(id).pace)) * 2) : 0;
    const pace = evaluatePace(idealPaceForAim(setup.aimId), actualPace);
    const diversity = new Set(ids.map((id) => resolutionApproach(id).pace)).size >= 2 && ids.length >= 3 ? 3 : 0;
    const total = scores.reduce((sum, item) => sum + item.total, 0) + stamina.modifier * 4 + pace.modifier * 1.4 + diversity;
    if (total > bestScore || (total === bestScore && staminaUsed < bestIds.reduce((sum, id) => sum + resolutionApproach(id).staminaCost, 0))) {
      bestScore = total;
      bestIds = ids;
      bestScores = scores;
    }
  }
  return { ids: bestIds, scores: bestScores };
}

function pairInteraction(own: ResolutionApproachId[], opponent: ResolutionApproachId[]): number {
  if (!own.length || !opponent.length) return 0;
  return round(average(own.flatMap((ownId) => opponent.map((opponentId) => APPROACH_INTERACTIONS[ownId]?.[opponentId] ?? 0))), 2);
}

function presentationScore(profile: MatchEngineProfile): number {
  return clamp(
    profile.overall * 0.24 +
    profile.popularity * 0.18 +
    profile.experience * 0.1 +
    profile.skills.Charisma * 0.14 +
    profile.skills.Psychology * 0.14 +
    profile.skills.Selling * 0.1 +
    profile.fanReaction * 20 * 0.06 +
    profile.gimmick * 20 * 0.04,
  );
}

function mentalState(profile: MatchEngineProfile, pressure: number, random: () => number) {
  const luck = round(random() * 10 - 5);
  const swingChance = mentalSwingProbability(profile.overall) + pressure * 0.005;
  const swing = random() < swingChance ? (random() < 0.5 ? -10 : 10) : 0;
  const score = calculateMentalStateScore({
    health: profile.health,
    popularity: profile.popularity,
    experience: profile.experience,
    fanReaction: profile.fanReaction,
    gimmick: profile.gimmick,
    overall: profile.overall,
    luck,
    swing,
  });
  const state = classifyMentalState(score);
  return { luck, swing, score: round(score), state };
}

function botchRisk(profile: MatchEngineProfile, metrics: StartingUniverseWorkbookMetrics | null): number {
  if (metrics) return round(metrics.botchRisk);
  return round(clamp(100 - average([
    profile.experience,
    profile.health,
    profile.skills.Safety,
    profile.skills.Basics,
    profile.skills.Consistency,
  ])));
}

function incidentForWorker(risk: number, random: () => number): { label: string; penalty: number } {
  const chance = clamp(risk * 0.22, 0, 18) / 100;
  if (random() >= chance) return { label: "", penalty: 0 };
  const severity = random();
  if (severity > 0.9) return { label: "A major execution mistake disrupted the closing stretch.", penalty: -10 };
  if (severity > 0.55) return { label: "A visible botch forced the wrestlers to recover the sequence.", penalty: -6 };
  return { label: "A minor timing mistake briefly interrupted the flow.", penalty: -3 };
}

function workerResult(
  source: MatchResolutionWorkerSource,
  opponent: MatchResolutionWorkerSource,
  settings: MatchResolutionWorkerSettings,
  setup: MatchResolutionSetup,
  approaches: { ids: ResolutionApproachId[]; scores: MatchResolutionApproachScore[] },
  opponentApproaches: ResolutionApproachId[],
  random: () => number,
): MatchResolutionWorkerResult {
  const profile = source.profile;
  const importance = IMPORTANCE_MODIFIERS[setup.importance];
  const mental = mentalState(profile, importance.pressure, random);
  const consistencyRange = ((100 - profile.skills.Consistency) / 100) * setup.volatility * 1.5;
  const consistencyVariance = round((random() * 2 - 1) * consistencyRange);
  const staminaUsed = approaches.ids.reduce((total, id) => total + resolutionApproach(id).staminaCost, 0);
  const staminaAvailable = source.workbookMetrics?.staminaCapacity ?? profileStaminaCapacity(profile);
  const stamina = evaluateStamina(staminaUsed, staminaAvailable);
  const actualPace = approaches.ids.length ? round(average(approaches.ids.map((id) => resolutionApproach(id).pace)) * 2) : 0;
  const pace = evaluatePace(idealPaceForAim(setup.aimId), actualPace);
  const interactionModifier = pairInteraction(approaches.ids, opponentApproaches);
  const risk = botchRisk(profile, source.workbookMetrics);
  const incident = incidentForWorker(risk, random);
  const averageApproachRating = approaches.scores.length ? average(approaches.scores.map((score) => score.rating)) : profile.overall * 0.6;
  const averageAimFit = average(approaches.scores.map((score) => score.aimFit + score.styleFit + score.opponentFit));
  const approachExecution = clamp(
    averageApproachRating +
    mental.state.modifier +
    stamina.modifier +
    pace.modifier * 0.25 +
    consistencyVariance +
    setup.chemistry * 0.3 +
    averageAimFit * 0.18 +
    incident.penalty,
  );
  const presentation = presentationScore(profile);
  const performanceScore = clamp(approachExecution * 0.72 + presentation * 0.28 + importance.performance);
  const storyNeedModifier = settings.storyNeed * 0.4;
  const momentumModifier = settings.momentum * 0.35;
  const bookingModifier = settings.bookingBias * 0.4;
  const volatilityNoise = round((random() * 2 - 1) * setup.volatility);
  const finishingEdge = average(approaches.ids.map((id) => {
    if (["dirty-rulebreaker", "opportunistic-schemer", "counter-specialist", "submission-specialist"].includes(id)) return 4;
    if (["power-dominance", "strong-style-specialist", "heavy-striker-brawler"].includes(id)) return 3;
    return 1;
  }));
  const competitiveScore = clamp(
    performanceScore * 0.55 +
    profile.skills.Psychology * 0.12 +
    profile.experience * 0.08 +
    average([profile.skills.Resilience, profile.skills.Toughness]) * 0.08 +
    finishingEdge * 0.07 +
    profile.health * 0.1 +
    interactionModifier +
    storyNeedModifier +
    momentumModifier +
    bookingModifier +
    volatilityNoise,
    0,
    120,
  );
  return {
    workerKey: profile.workerKey,
    workerId: profile.workerId,
    workerName: profile.workerName,
    selectedApproachIds: approaches.ids,
    selectedApproachNames: approaches.ids.map((id) => resolutionApproach(id).name),
    approachScores: approaches.scores,
    averageApproachRating: round(averageApproachRating),
    approachExecution: round(approachExecution),
    presentationScore: round(presentation),
    performanceScore: round(performanceScore),
    competitiveScore: round(competitiveScore),
    winProbability: 0,
    mentalStateId: mental.state.id,
    mentalStateName: mental.state.name,
    mentalStateScore: mental.score,
    mentalModifier: mental.state.modifier,
    luck: mental.luck,
    swing: mental.swing,
    consistencyVariance,
    actualPace,
    paceStatus: pace.status,
    paceModifier: pace.modifier,
    staminaUsed,
    staminaAvailable,
    staminaStatus: stamina.status,
    staminaModifier: stamina.modifier,
    interactionModifier,
    storyNeedModifier: round(storyNeedModifier),
    momentumModifier: round(momentumModifier),
    bookingModifier: round(bookingModifier),
    volatilityNoise,
    botchRisk: risk,
    incident: incident.label,
    decisiveComponents: [
      { label: "Approach execution", value: round(approachExecution * 0.55) },
      { label: "Psychology and experience", value: round(profile.skills.Psychology * 0.12 + profile.experience * 0.08) },
      { label: "Health and resilience", value: round(profile.health * 0.1 + average([profile.skills.Resilience, profile.skills.Toughness]) * 0.08) },
      { label: "Opponent interaction", value: interactionModifier },
      { label: "Story need", value: round(storyNeedModifier) },
      { label: "Momentum", value: round(momentumModifier) },
      { label: "Booker influence", value: round(bookingModifier) },
      { label: "Night variance", value: round(mental.state.modifier + consistencyVariance + volatilityNoise + mental.luck) },
    ],
  };
}

function applyProbabilities(results: MatchResolutionWorkerResult[], volatility: number): MatchResolutionWorkerResult[] {
  const temperature = 8 + volatility * 0.8;
  const minimum = Math.min(...results.map((result) => result.competitiveScore));
  const weights = results.map((result) => Math.exp((result.competitiveScore - minimum) / temperature));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return results.map((result, index) => ({ ...result, winProbability: round(weights[index] / total, 4) }));
}

function finishTypeForWinner(winner: MatchResolutionWorkerResult, random: () => number) {
  const primary = [...winner.approachScores].sort((left, right) => right.total - left.total)[0]?.approachId ?? winner.selectedApproachIds[0] ?? "big-match-performer";
  const choices = FINISH_TYPES_BY_APPROACH[primary] ?? ["Pinfall"];
  return choices[Math.floor(random() * choices.length)] as MatchResolutionEngineResult["finishType"];
}

function finishDescription(
  finishType: MatchResolutionEngineResult["finishType"],
  winner: MatchResolutionWorkerResult,
  loser: MatchResolutionWorkerResult,
): string {
  const approaches = new Set(winner.selectedApproachIds);
  if (finishType === "Submission") {
    if (approaches.has("counter-specialist")) return `${winner.workerName} countered the closing sequence into a decisive submission and forced ${loser.workerName} to tap out.`;
    return `${winner.workerName} completed sustained limb work and forced ${loser.workerName} to submit.`;
  }
  if (finishType === "Knockout") return `${winner.workerName} ended the match with a decisive strike that left ${loser.workerName} unable to answer.`;
  if (finishType === "Referee Stoppage") return `The referee stopped the match after ${winner.workerName} overwhelmed ${loser.workerName} and they could no longer defend themselves.`;
  if (finishType === "Count Out") return `${winner.workerName} exploited the ringside situation and beat ${loser.workerName} back into the ring before the count of ten.`;
  if (finishType === "Disqualification") return `${winner.workerName} won by disqualification after ${loser.workerName} crossed the line during the closing exchange.`;
  if (finishType === "No Contest") return `The match was thrown out when the closing chaos made a legitimate finish impossible.`;
  if (approaches.has("dirty-rulebreaker")) return `${winner.workerName} used an illegal shortcut outside the referee's view and stole the pinfall over ${loser.workerName}.`;
  if (approaches.has("opportunistic-schemer")) return `${winner.workerName} found one opening and trapped ${loser.workerName} in a sudden decisive pin.`;
  if (approaches.has("counter-specialist")) return `${winner.workerName} countered ${loser.workerName}'s signature sequence into the winning pinfall.`;
  if (approaches.has("aerial-specialist")) return `${winner.workerName} landed a decisive aerial attack and pinned ${loser.workerName}.`;
  if (approaches.has("power-dominance")) return `${winner.workerName} finished ${loser.workerName} with an overwhelming power move.`;
  if (approaches.has("resilient-underdog")) return `${winner.workerName} survived the opponent's best offense and completed the comeback with a pinfall.`;
  return `${winner.workerName} won by pinfall after controlling the decisive closing exchange.`;
}

function confidenceLabel(probability: number): MatchResolutionEngineResult["confidenceLabel"] {
  if (probability >= 0.68) return "High";
  if (probability >= 0.56) return "Moderate";
  return "Low";
}

function decisiveFactors(winner: MatchResolutionWorkerResult, loser: MatchResolutionWorkerResult): string[] {
  const loserComponents = new Map(loser.decisiveComponents.map((component) => [component.label, component.value]));
  const differences = winner.decisiveComponents.map((component) => ({
    label: component.label,
    difference: round(component.value - (loserComponents.get(component.label) ?? 0)),
  })).sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference));
  const factors = differences.slice(0, 4).map((item) => item.difference >= 0
    ? `${winner.workerName} held a ${Math.abs(item.difference).toFixed(1)}-point advantage in ${item.label.toLowerCase()}.`
    : `${winner.workerName} overcame a ${Math.abs(item.difference).toFixed(1)}-point disadvantage in ${item.label.toLowerCase()}.`);
  if (winner.performanceScore < loser.performanceScore) factors.unshift(`${loser.workerName} produced the stronger overall performance, but ${winner.workerName} won the competitive result.`);
  return factors.slice(0, 5);
}

function actualDuration(setup: MatchResolutionSetup, winner: MatchResolutionWorkerResult, random: () => number): number {
  const variance = IMPORTANCE_MODIFIERS[setup.importance].durationVariance;
  const paceAdjustment = (winner.actualPace - idealPaceForAim(setup.aimId)) * 0.01;
  return round(Math.max(1, setup.durationMinutes * (1 + (random() * 2 - 1) * variance + paceAdjustment)), 2);
}

function matchScore(results: MatchResolutionWorkerResult[], setup: MatchResolutionSetup): number {
  const performanceAverage = average(results.map((result) => result.performanceScore));
  const structure = average(results.map((result) => clamp(72 + result.paceModifier * 1.2 + result.staminaModifier * 2)));
  const closeness = clamp(100 - Math.abs(results[0].performanceScore - results[1].performanceScore) * 2);
  const incidentPenalty = results.reduce((total, result) => total + (result.incident ? 3 : 0), 0);
  return round(clamp(performanceAverage * 0.8 + structure * 0.12 + closeness * 0.08 + setup.chemistry * 0.5 - incidentPenalty));
}

export function resolveSinglesMatch(input: ResolveSinglesMatchInput): MatchResolutionAttempt {
  if (input.workers.length !== 2) throw new Error("The Phase 6B1 singles engine requires exactly two wrestler profiles.");
  if (input.setup.workers.length !== 2) throw new Error("The match setup must contain exactly two wrestler settings.");
  const seed = input.seed || createMatchEngineId();
  const random = seededRandom(seed);
  const firstApproaches = selectedApproaches(input.setup.workers[0], input.workers[0], input.workers[1], input.setup);
  const secondApproaches = selectedApproaches(input.setup.workers[1], input.workers[1], input.workers[0], input.setup);
  const first = workerResult(input.workers[0], input.workers[1], input.setup.workers[0], input.setup, firstApproaches, secondApproaches.ids, random);
  const second = workerResult(input.workers[1], input.workers[0], input.setup.workers[1], input.setup, secondApproaches, firstApproaches.ids, random);
  const workerResults = applyProbabilities([first, second], input.setup.volatility);
  const roll = round(random(), 6);
  const winner = roll <= workerResults[0].winProbability ? workerResults[0] : workerResults[1];
  const loser = winner.workerKey === workerResults[0].workerKey ? workerResults[1] : workerResults[0];
  const finishType = finishTypeForWinner(winner, random);
  const score = matchScore(workerResults, input.setup);
  const duration = actualDuration(input.setup, winner, random);
  const performanceLeader = [...workerResults].sort((left, right) => right.performanceScore - left.performanceScore)[0];
  const result: MatchResolutionEngineResult = {
    winnerKey: winner.workerKey,
    winnerName: winner.workerName,
    loserKey: loser.workerKey,
    loserName: loser.workerName,
    finishType,
    finishDescription: finishDescription(finishType, winner, loser),
    actualDurationMinutes: duration,
    matchScore: score,
    starRating: advisoryStarRating(score),
    performanceLeaderKey: performanceLeader.workerKey,
    performanceLeaderName: performanceLeader.workerName,
    winnerProbability: winner.winProbability,
    resultRoll: roll,
    confidenceLabel: confidenceLabel(Math.max(...workerResults.map((item) => item.winProbability))),
    upset: winner.winProbability < 0.5,
    decisiveFactors: decisiveFactors(winner, loser),
    matchFacts: [
      `${winner.workerName} selected ${winner.selectedApproachNames.join(", ")}.`,
      `${loser.workerName} selected ${loser.selectedApproachNames.join(", ")}.`,
      `${winner.workerName}: ${winner.mentalStateName}; ${winner.staminaStatus}; ${winner.paceStatus}.`,
      `${loser.workerName}: ${loser.mentalStateName}; ${loser.staminaStatus}; ${loser.paceStatus}.`,
      performanceLeader.workerKey === winner.workerKey
        ? `${winner.workerName} won and delivered the strongest performance.`
        : `${performanceLeader.workerName} delivered the strongest performance despite losing the match.`,
      ...workerResults.flatMap((item) => item.incident ? [`${item.workerName}: ${item.incident}`] : []),
    ],
  };
  return {
    id: createMatchEngineId(),
    number: 1,
    seed,
    setupFingerprint: matchResolutionSetupFingerprint(input.setup, input.workers),
    setupChangeReason: input.setupChangeReason ?? "",
    calculationVersion: RESOLUTION_CALCULATION_VERSION,
    generatedAt: new Date().toISOString(),
    status: "Calculated",
    workerResults,
    engineResult: result,
    finalResult: null,
  };
}

export function createMatchResolutionRecord(setup: MatchResolutionSetup, attempt: MatchResolutionAttempt): MatchResolutionRecord {
  const timestamp = new Date().toISOString();
  return {
    id: createMatchEngineId(),
    showId: setup.showId,
    showName: setup.showName,
    segmentId: setup.segmentId,
    segmentTitle: setup.segmentTitle,
    setup,
    attempts: [attempt],
    activeAttemptId: attempt.id,
    status: "Calculated",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function appendResolutionAttempt(record: MatchResolutionRecord, attempt: MatchResolutionAttempt): MatchResolutionRecord {
  const timestamp = new Date().toISOString();
  const attempts = record.attempts.map((item) => item.id === record.activeAttemptId && item.status === "Calculated" ? { ...item, status: "Superseded" as const } : item);
  const numbered = { ...attempt, number: attempts.length + 1 };
  return {
    ...record,
    setup: { ...record.setup },
    attempts: [...attempts, numbered],
    activeAttemptId: numbered.id,
    status: "Calculated",
    updatedAt: timestamp,
  };
}

function finalFromEngine(attempt: MatchResolutionAttempt): MatchResolutionFinalResult {
  const result = attempt.engineResult;
  return {
    winnerKey: result.winnerKey,
    winnerName: result.winnerName,
    loserKey: result.loserKey,
    loserName: result.loserName,
    finishType: result.finishType,
    finishDescription: result.finishDescription,
    actualDurationMinutes: result.actualDurationMinutes,
    matchScore: result.matchScore,
    starRating: result.starRating,
    acceptedEngineResult: true,
    overrideReason: "",
    finalizedAt: new Date().toISOString(),
  };
}

export function acceptEngineResult(record: MatchResolutionRecord): MatchResolutionRecord {
  const attempt = record.attempts.find((item) => item.id === record.activeAttemptId);
  if (!attempt) throw new Error("The active match calculation could not be found.");
  if (attempt.status !== "Calculated") throw new Error("This official calculation has already been finalized.");
  const finalResult = finalFromEngine(attempt);
  return {
    ...record,
    attempts: record.attempts.map((item) => item.id === attempt.id ? { ...item, status: "Accepted", finalResult } : item),
    status: "Accepted",
    updatedAt: finalResult.finalizedAt,
  };
}

export function overrideEngineResult(
  record: MatchResolutionRecord,
  winnerKey: string,
  finishType: MatchResolutionFinalResult["finishType"],
  finishDescriptionValue: string,
  reason: string,
): MatchResolutionRecord {
  const attempt = record.attempts.find((item) => item.id === record.activeAttemptId);
  if (!attempt) throw new Error("The active match calculation could not be found.");
  if (attempt.status !== "Calculated") throw new Error("This official calculation has already been finalized.");
  const winner = attempt.workerResults.find((item) => item.workerKey === winnerKey);
  const loser = attempt.workerResults.find((item) => item.workerKey !== winnerKey);
  if (!winner || !loser) throw new Error("Choose one of the calculated match participants as the override winner.");
  if (!reason.trim()) throw new Error("Record why the engine result was overridden.");
  const finalResult: MatchResolutionFinalResult = {
    winnerKey: winner.workerKey,
    winnerName: winner.workerName,
    loserKey: loser.workerKey,
    loserName: loser.workerName,
    finishType,
    finishDescription: finishDescriptionValue.trim() || `${winner.workerName} defeated ${loser.workerName} by ${finishType.toLowerCase()}.`,
    actualDurationMinutes: attempt.engineResult.actualDurationMinutes,
    matchScore: attempt.engineResult.matchScore,
    starRating: attempt.engineResult.starRating,
    acceptedEngineResult: false,
    overrideReason: reason.trim(),
    finalizedAt: new Date().toISOString(),
  };
  return {
    ...record,
    attempts: record.attempts.map((item) => item.id === attempt.id ? { ...item, status: "Overridden", finalResult } : item),
    status: "Overridden",
    updatedAt: finalResult.finalizedAt,
  };
}

export function activeResolutionAttempt(record: MatchResolutionRecord | null): MatchResolutionAttempt | null {
  return record?.attempts.find((attempt) => attempt.id === record.activeAttemptId) ?? null;
}

export function resolutionCanRecalculate(
  record: MatchResolutionRecord | null,
  setup: MatchResolutionSetup,
  sources: MatchResolutionWorkerSource[],
): boolean {
  if (!record) return true;
  const attempt = activeResolutionAttempt(record);
  return Boolean(attempt && attempt.setupFingerprint !== matchResolutionSetupFingerprint(setup, sources));
}
