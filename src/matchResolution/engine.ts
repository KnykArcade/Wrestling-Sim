import {
  approachLimitForSetup,
  calculateMatchLoad,
  calculateApproachPlanScore,
  calculateMentalStateBase,
  calculateMentalStateScore,
  classifyMentalState,
  createMatchEngineId,
  evaluatePace,
  evaluateStamina,
  mentalSwingProbability,
  profileStaminaCapacity,
  scoreApproachCandidate,
} from "../matchEngine/model";
import { MATCH_APPROACHES } from "../matchEngine/catalog";
import {
  CALCULATION_FORMULAS,
  calculateStarRating,
  calculateSuitabilityBreakdown,
  createCalculationStage,
  createCalculationTerm,
  roundCalculation,
} from "../calculations/foundation";
import { calculateLiveMatchAudience } from "../crowd/model";
import type { MatchAnticipation } from "../crowd/types";
import type { MatchEngineProfile } from "../matchEngine/types";
import { IMPORTED_APPROACH_FORMULAS, matchEngineIdForImportedApproachId } from "../startingUniverse/formulas";
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
  MatchResolutionTeamResult,
  MatchResolutionWorkerResult,
  MatchResolutionWorkerSettings,
  MatchResolutionWorkerSource,
  MatchResolutionOutcomeLedger,
  ResolveSinglesMatchInput,
  ResolveMatchInput,
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
  opponents: MatchResolutionWorkerSource[],
  setup: MatchResolutionSetup,
  approachId: ResolutionApproachId,
): MatchResolutionApproachScore {
  const approach = resolutionApproach(approachId);
  const rating = resolutionApproachRating(source.profile, source.workbookMetrics, approachId);
  const opponentFit = average(opponents.map((opponent) => opponentProfileFit(approachId, opponent.profile)));
  const canonicalId = matchEngineIdForImportedApproachId(approachId);
  const canonical = MATCH_APPROACHES.find((item) => item.id === canonicalId)!;
  const candidate = scoreApproachCandidate(source.profile, setup.aimId, canonical, { ratingOverride: rating, opponentCompatibility: opponentFit });
  const suitability = calculateSuitabilityBreakdown(rating, {
    style: candidate.styleBonus,
    aim: candidate.aimCompatibility,
    pace: candidate.paceBonus,
    stamina: candidate.staminaEfficiency,
    opponent: candidate.opponentCompatibility,
  });
  const formula = CALCULATION_FORMULAS.approachSuitability;
  return {
    approachId,
    approachName: approach.name,
    rating,
    aimFit: candidate.aimCompatibility,
    styleFit: candidate.styleBonus,
    opponentFit,
    paceFit: candidate.paceBonus,
    staminaEfficiency: candidate.staminaEfficiency,
    total: candidate.total,
    calculation: createCalculationStage(formula, [
      createCalculationTerm("raw-rating", "Raw approach rating", rating, formula.abilityWeight, "The wrestler's ability in this approach."),
      createCalculationTerm("match-suitability", "Normalized match suitability", suitability.contextualScore, formula.suitabilityWeight, `Style ${candidate.styleBonus >= 0 ? "+" : ""}${candidate.styleBonus}; aim ${candidate.aimCompatibility >= 0 ? "+" : ""}${candidate.aimCompatibility}; pace ${candidate.paceBonus >= 0 ? "+" : ""}${candidate.paceBonus}; stamina +${candidate.staminaEfficiency}; opponent ${candidate.opponentCompatibility >= 0 ? "+" : ""}${candidate.opponentCompatibility}.`),
    ], {
      notes: [
        `Context total ${suitability.contextualTotal} is normalized with (context + ${formula.contextualOffset}) / ${formula.contextualRange} x 100 before its 25% weight.`,
        "This recommendation score helps select an approach. The official performance calculation later uses the raw approach rating and recalculates match fit separately.",
      ],
    }),
    reasons: [
      ...candidate.reasons,
      `${rating.toFixed(1)} ${source.workbookMetrics ? "workbook-derived" : "profile-derived"} rating source`,
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

function normalizedApproachPace(ids: ResolutionApproachId[]): number {
  return ids.length ? Math.round(average(ids.map((id) => resolutionApproach(id).pace))) : 0;
}

function enduranceMatchLoad(ids: ResolutionApproachId[], durationMinutes: number): number {
  const pace = normalizedApproachPace(ids);
  return calculateMatchLoad(durationMinutes, ids.map((id) => resolutionApproach(id).staminaCost), pace);
}

function selectedApproaches(
  worker: MatchResolutionWorkerSettings,
  source: MatchResolutionWorkerSource,
  opponents: MatchResolutionWorkerSource[],
  setup: MatchResolutionSetup,
): { ids: ResolutionApproachId[]; scores: MatchResolutionApproachScore[]; plan: ReturnType<typeof createCalculationStage> } {
  const planFormula = CALCULATION_FORMULAS.approachPlan;
  const slots = approachLimitForSetup(setup.durationMinutes, setup.approachLimit);
  const required = worker.requiredApproachId ? uniqueApproaches([worker.requiredApproachId]) : [];
  const locked = worker.approachMode === "AI" ? uniqueApproaches(worker.lockedApproachIds).filter((id) => !required.includes(id)).slice(0, slots) : [];
  const manual = uniqueApproaches(worker.manualApproachIds).filter((id) => !locked.includes(id));
  const fixed = uniqueApproaches([...required, ...locked, ...(worker.approachMode === "Manual" ? manual : [])]).slice(0, slots);
  const candidates = RESOLUTION_APPROACHES.map((approach) => approach.id).filter((id) => !fixed.includes(id));
  const candidateSets = combinations(candidates, Math.max(0, slots - fixed.length)).map((values) => [...fixed, ...values]);
  let bestIds = fixed;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestScores: MatchResolutionApproachScore[] = fixed.map((id) => scoreApproach(source, opponents, setup, id));
  for (const ids of candidateSets.length ? candidateSets : [fixed]) {
    const scores = ids.map((id) => scoreApproach(source, opponents, setup, id));
    const actualPace = normalizedApproachPace(ids);
    const staminaUsed = enduranceMatchLoad(ids, setup.durationMinutes);
    const staminaAvailable = profileStaminaCapacity(source.profile);
    const stamina = evaluateStamina(staminaUsed, staminaAvailable);
    const pace = evaluatePace(idealPaceForAim(setup.aimId), actualPace);
    const planScore = calculateApproachPlanScore({
      recommendationTotal: scores.reduce((sum, item) => sum + item.total, 0),
      paceModifier: pace.modifier,
      staminaModifier: stamina.modifier,
      selectedPaces: ids.map((id) => resolutionApproach(id).pace),
      includesBigMatchPerformer: ids.includes("big-match-performer"),
      durationMinutes: setup.durationMinutes,
      staminaUsed,
      staminaAvailable,
    });
    const total = planScore.total;
    if (total > bestScore || (total === bestScore && staminaUsed < enduranceMatchLoad(bestIds, setup.durationMinutes))) {
      bestScore = total;
      bestIds = ids;
      bestScores = scores;
    }
  }
  const actualPace = normalizedApproachPace(bestIds);
  const staminaUsed = enduranceMatchLoad(bestIds, setup.durationMinutes);
  const staminaAvailable = profileStaminaCapacity(source.profile);
  const stamina = evaluateStamina(staminaUsed, staminaAvailable);
  const pace = evaluatePace(idealPaceForAim(setup.aimId), actualPace);
  const planScore = calculateApproachPlanScore({
    recommendationTotal: bestScores.reduce((sum, item) => sum + item.total, 0),
    paceModifier: pace.modifier,
    staminaModifier: stamina.modifier,
    selectedPaces: bestIds.map((id) => resolutionApproach(id).pace),
    includesBigMatchPerformer: bestIds.includes("big-match-performer"),
    durationMinutes: setup.durationMinutes,
    staminaUsed,
    staminaAvailable,
  });
  const terms = [
    ...bestScores.map((score) => createCalculationTerm(`recommendation-${score.approachId}`, `${score.approachName} recommendation`, score.total, 1, "Selection-only recommendation score.")),
    createCalculationTerm("stamina", "Endurance modifier", stamina.modifier, planFormula.staminaModifierWeight, `Match load ${staminaUsed}/${staminaAvailable} endurance: ${stamina.status}.`),
    createCalculationTerm("pace", "Pace modifier", pace.modifier, planFormula.paceModifierWeight, `Pace ${actualPace} against ideal ${idealPaceForAim(setup.aimId)}: ${pace.status}.`),
    createCalculationTerm("variety", "Pace-variety bonus", planScore.diversityBonus, 1, planScore.diversityBonus ? "Three or more approaches use at least two pace levels." : "No pace-variety bonus applied."),
    createCalculationTerm("long-match", "Big Match Performer long-match bonus", planScore.longMatchBonus, 1, planScore.longMatchBonus ? "Big Match Performer is used in a match lasting at least 16 minutes." : "No long-match bonus applied."),
    createCalculationTerm("over-budget", "Endurance over-load penalty", planScore.overBudgetPoints, -planFormula.staminaOverBudgetPenalty, planScore.overBudgetPenalty ? `${planScore.overBudgetPoints} match-load points above endurance.` : "The match load stays within endurance."),
  ];
  return {
    ids: bestIds,
    scores: bestScores,
    plan: createCalculationStage(planFormula, terms, {
      notes: [
        required.length ? `${resolutionApproach(required[0]).name} was required by the match stipulation or aim.` : worker.approachMode === "AI" ? "The AI selected the highest-scoring eligible combination after honoring locked approaches." : "Manual approaches were preserved; the AI filled any unused slots.",
        "This plan score selects approaches only and is not added directly to in-ring performance.",
      ],
    }),
  };
}

function pairInteraction(own: ResolutionApproachId[], opponent: ResolutionApproachId[]): number {
  if (!own.length || !opponent.length) return 0;
  return round(average(own.flatMap((ownId) => opponent.map((opponentId) => APPROACH_INTERACTIONS[ownId]?.[opponentId] ?? 0))), 2);
}

function presentationScore(profile: MatchEngineProfile) {
  const formula = CALCULATION_FORMULAS.presentation;
  const terms = [
    createCalculationTerm("overall", "Overall", profile.overall, formula.weights.overall),
    createCalculationTerm("popularity", "Popularity", profile.popularity, formula.weights.popularity),
    createCalculationTerm("experience", "Experience", profile.experience, formula.weights.experience),
    createCalculationTerm("charisma", "Charisma", profile.skills.Charisma, formula.weights.charisma),
    createCalculationTerm("psychology", "Psychology", profile.skills.Psychology, formula.weights.psychology),
    createCalculationTerm("selling", "Selling", profile.skills.Selling, formula.weights.selling),
    createCalculationTerm("fan-reaction", "Fan reaction (five-star value x 20)", profile.fanReaction * 20, formula.weights.fanReaction),
    createCalculationTerm("gimmick", "Gimmick (five-star value x 20)", profile.gimmick * 20, formula.weights.gimmick),
  ];
  const ledger = createCalculationStage(formula, terms);
  return { value: ledger.cappedSubtotal, ledger };
}

function mentalState(profile: MatchEngineProfile, pressure: number, random: () => number) {
  const baseFormula = CALCULATION_FORMULAS.mentalBase;
  const randomness = CALCULATION_FORMULAS.executionRandomness;
  const inputs = {
    health: profile.health,
    consistency: profile.skills.Consistency,
    experience: profile.experience,
    overall: profile.overall,
  };
  const base = calculateMentalStateBase(inputs);
  const luckRoll = random();
  const luck = round(luckRoll * (randomness.luckMaximum - randomness.luckMinimum) + randomness.luckMinimum);
  const swingChance = mentalSwingProbability(profile.skills.Consistency) + pressure * randomness.swingPressureWeight;
  const swingOccurrenceRoll = random();
  const swingDirectionRoll = swingOccurrenceRoll < swingChance ? random() : null;
  const swing = swingDirectionRoll === null ? 0 : swingDirectionRoll < 0.5 ? -randomness.swingMagnitude : randomness.swingMagnitude;
  const score = calculateMentalStateScore({
    ...inputs,
    luck,
    swing,
  });
  const state = classifyMentalState(score);
  const baseLedger = createCalculationStage(baseFormula, [
    createCalculationTerm("baseline", "Baseline", baseFormula.baseline),
    createCalculationTerm("health", "Health above/below 75", profile.health - baseFormula.healthReference, baseFormula.healthWeight),
    createCalculationTerm("consistency", "Consistency above/below 60", profile.skills.Consistency - baseFormula.consistencyReference, baseFormula.consistencyWeight),
    createCalculationTerm("experience", "Experience above/below 60", profile.experience - baseFormula.experienceReference, baseFormula.experienceWeight),
    createCalculationTerm("overall", "Overall above/below 60", profile.overall - baseFormula.overallReference, baseFormula.overallWeight),
  ]);
  const scoreFormula = CALCULATION_FORMULAS.mentalScore;
  const scoreLedger = createCalculationStage(scoreFormula, [
    createCalculationTerm("base", "Mental-state base", base),
    createCalculationTerm("luck", "Random luck", luck, 1, `Roll ${roundCalculation(luckRoll, 6)} mapped to ${randomness.luckMinimum} through +${randomness.luckMaximum}.`),
    createCalculationTerm("swing", "Rare swing", swing, 1, swingDirectionRoll === null ? `Occurrence roll ${roundCalculation(swingOccurrenceRoll, 6)} did not beat the ${roundCalculation(swingChance * 100, 3)}% chance.` : `Occurrence roll ${roundCalculation(swingOccurrenceRoll, 6)} triggered the swing; direction roll ${roundCalculation(swingDirectionRoll, 6)} selected ${swing > 0 ? "positive" : "negative"}.`),
  ], { notes: [
    `${state.name} maps the ${round(score)} mental score to a ${state.modifier >= 0 ? "+" : ""}${state.modifier} performance modifier.`,
    `Rare-swing chance includes consistency plus the ${pressure} pressure rating for ${roundCalculation(swingChance * 100, 3)}%.`,
  ] });
  return { base: round(base), luck, swing, score: round(score), state, baseLedger, scoreLedger };
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

function incidentForWorker(risk: number, random: () => number) {
  const formula = CALCULATION_FORMULAS.executionRandomness;
  const chance = clamp(risk * formula.botchChanceWeight, 0, formula.botchChanceMaximumPercent) / 100;
  const occurrenceRoll = random();
  if (occurrenceRoll >= chance) return { label: "", penalty: 0, chance, occurrenceRoll, severityRoll: null };
  const severityRoll = random();
  if (severityRoll > formula.majorIncidentThreshold) return { label: "A major execution mistake disrupted the closing stretch.", penalty: formula.majorIncidentPenalty, chance, occurrenceRoll, severityRoll };
  if (severityRoll > formula.visibleIncidentThreshold) return { label: "A visible botch forced the wrestlers to recover the sequence.", penalty: formula.visibleIncidentPenalty, chance, occurrenceRoll, severityRoll };
  return { label: "A minor timing mistake briefly interrupted the flow.", penalty: formula.minorIncidentPenalty, chance, occurrenceRoll, severityRoll };
}

function workerResult(
  source: MatchResolutionWorkerSource,
  settings: MatchResolutionWorkerSettings,
  setup: MatchResolutionSetup,
  approaches: { ids: ResolutionApproachId[]; scores: MatchResolutionApproachScore[]; plan: ReturnType<typeof createCalculationStage> },
  opponentApproaches: ResolutionApproachId[][],
  random: () => number,
): MatchResolutionWorkerResult {
  const profile = source.profile;
  const importance = IMPORTANCE_MODIFIERS[setup.importance];
  const mental = mentalState(profile, importance.pressure, random);
  const randomness = CALCULATION_FORMULAS.executionRandomness;
  const consistencyRange = ((100 - profile.skills.Consistency) / 100) * setup.volatility * randomness.consistencyRangeWeight;
  const consistencyRoll = random();
  const consistencyVariance = round((consistencyRoll * 2 - 1) * consistencyRange);
  const actualPace = normalizedApproachPace(approaches.ids);
  const staminaUsed = enduranceMatchLoad(approaches.ids, setup.durationMinutes);
  const staminaAvailable = profileStaminaCapacity(profile);
  const stamina = evaluateStamina(staminaUsed, staminaAvailable);
  const pace = evaluatePace(idealPaceForAim(setup.aimId), actualPace);
  const interactionModifier = average(opponentApproaches.map((ids) => pairInteraction(approaches.ids, ids)));
  const risk = botchRisk(profile, source.workbookMetrics);
  const incident = incidentForWorker(risk, random);
  const averageApproachRating = approaches.scores.length ? average(approaches.scores.map((score) => score.rating)) : profile.overall * 0.6;
  const averageAimFit = average(approaches.scores.map((score) => score.aimFit + score.styleFit + score.opponentFit));
  const executionFormula = CALCULATION_FORMULAS.approachExecution;
  const executionTerms = [
    createCalculationTerm("approach-rating", "Average raw approach rating", averageApproachRating),
    createCalculationTerm("mental", "Mental-state modifier", mental.state.modifier),
    createCalculationTerm("stamina", "Endurance modifier", stamina.modifier, 1, `Match load ${staminaUsed}/${staminaAvailable}: ${stamina.status}.`),
    createCalculationTerm("pace", "Pace modifier", pace.modifier, executionFormula.paceModifierWeight, `Actual ${actualPace}; ideal ${idealPaceForAim(setup.aimId)}: ${pace.status}.`),
    createCalculationTerm("consistency", "Random consistency variance", consistencyVariance, 1, `Roll ${roundCalculation(consistencyRoll, 6)} within the ${roundCalculation(-consistencyRange, 3)} to +${roundCalculation(consistencyRange, 3)} range created by consistency ${profile.skills.Consistency} and volatility ${setup.volatility}.`),
    createCalculationTerm("fit", "Average aim, style, and opponent fit", averageAimFit, executionFormula.fitWeight),
    createCalculationTerm("incident", "Execution-incident penalty", incident.penalty, 1, `${incident.label || "No incident occurred."} Botch risk ${risk} created a ${roundCalculation(incident.chance * 100, 3)}% incident chance; occurrence roll ${roundCalculation(incident.occurrenceRoll, 6)}${incident.severityRoll === null ? "." : `; severity roll ${roundCalculation(incident.severityRoll, 6)}.`}`),
  ];
  const approachExecution = clamp(
    averageApproachRating +
    mental.state.modifier +
    stamina.modifier +
    pace.modifier * executionFormula.paceModifierWeight +
    consistencyVariance +
    averageAimFit * executionFormula.fitWeight +
    incident.penalty,
  );
  const executionLedger = createCalculationStage(executionFormula, executionTerms);
  const presentation = presentationScore(profile);
  const performanceFormula = CALCULATION_FORMULAS.performance;
  const performanceMomentumModifier = (clamp(settings.momentum) - 50) * performanceFormula.momentumWeight;
  const performanceTerms = [
    createCalculationTerm("approach-execution", "Approach execution", approachExecution, performanceFormula.approachExecutionWeight),
    createCalculationTerm("presentation", "Presentation", presentation.value, performanceFormula.presentationWeight),
    createCalculationTerm("importance", `${setup.importance} importance bonus`, importance.performance),
    createCalculationTerm("momentum-form", "Momentum confidence above/below 50", clamp(settings.momentum) - 50, performanceFormula.momentumWeight, "Momentum contributes between -3 and +3 before the individual performance score is capped."),
  ];
  const performanceScore = clamp(
    approachExecution * performanceFormula.approachExecutionWeight +
    presentation.value * performanceFormula.presentationWeight +
    importance.performance +
    performanceMomentumModifier,
  );
  const performanceLedger = createCalculationStage(performanceFormula, performanceTerms);
  const competitiveFormula = CALCULATION_FORMULAS.competitive;
  const storyNeedModifier = settings.storyNeed * competitiveFormula.storyNeedWeight;
  const momentumModifier = (clamp(settings.momentum) - 50) * competitiveFormula.momentumWeight;
  const bookingModifier = settings.bookingBias * competitiveFormula.bookingWeight;
  const volatilityRoll = random();
  const volatilityNoise = round((volatilityRoll * 2 - 1) * setup.volatility);
  const finishingEdge = average(approaches.ids.map((id) => {
    if (["dirty-rulebreaker", "opportunistic-schemer", "counter-specialist", "submission-specialist"].includes(id)) return 4;
    if (["power-dominance", "strong-style-specialist", "heavy-striker-brawler"].includes(id)) return 3;
    return 1;
  }));
  const finishingRating = finishingEdge * 25;
  const performanceComponent = performanceScore * competitiveFormula.performanceWeight;
  const psychologyComponent = profile.skills.Psychology * competitiveFormula.psychologyWeight;
  const experienceComponent = profile.experience * competitiveFormula.experienceWeight;
  const psychologyExperienceComponent = psychologyComponent + experienceComponent;
  const resilienceRating = average([profile.skills.Resilience, profile.skills.Toughness]);
  const resilienceComponent = resilienceRating * competitiveFormula.resilienceWeight;
  const finishingComponent = finishingRating * competitiveFormula.finishingWeight;
  const healthComponent = profile.health * competitiveFormula.healthWeight;
  const competitiveTerms = [
    createCalculationTerm("performance", "Individual performance", performanceScore, competitiveFormula.performanceWeight),
    createCalculationTerm("psychology", "Psychology", profile.skills.Psychology, competitiveFormula.psychologyWeight),
    createCalculationTerm("experience", "Experience", profile.experience, competitiveFormula.experienceWeight),
    createCalculationTerm("resilience", "Average resilience and toughness", resilienceRating, competitiveFormula.resilienceWeight),
    createCalculationTerm("finishing", "Normalized finishing-style rating", finishingRating, competitiveFormula.finishingWeight),
    createCalculationTerm("health", "Health", profile.health, competitiveFormula.healthWeight),
    createCalculationTerm("interaction", "Opponent approach interaction", interactionModifier),
    createCalculationTerm("story-need", "Story need", settings.storyNeed, competitiveFormula.storyNeedWeight),
    createCalculationTerm("momentum", "Momentum above/below 50", clamp(settings.momentum) - 50, competitiveFormula.momentumWeight),
    createCalculationTerm("booker", "Booker influence", settings.bookingBias, competitiveFormula.bookingWeight),
    createCalculationTerm("volatility", "Random competitive volatility", volatilityNoise, 1, `Roll ${roundCalculation(volatilityRoll, 6)} mapped to -${setup.volatility} through +${setup.volatility}.`),
  ];
  const competitiveScore = clamp(
    performanceComponent +
    psychologyExperienceComponent +
    resilienceComponent +
    finishingComponent +
    healthComponent +
    interactionModifier +
    storyNeedModifier +
    momentumModifier +
    bookingModifier +
    volatilityNoise,
    0,
    120,
  );
  const competitiveLedger = createCalculationStage(competitiveFormula, competitiveTerms);
  return {
    workerKey: profile.workerKey,
    workerId: profile.workerId,
    workerName: profile.workerName,
    selectedApproachIds: approaches.ids,
    selectedApproachNames: approaches.ids.map((id) => resolutionApproach(id).name),
    approachScores: approaches.scores,
    averageApproachRating: round(averageApproachRating),
    approachExecution: round(approachExecution),
    presentationScore: round(presentation.value),
    performanceScore: round(performanceScore),
    competitiveScore: round(competitiveScore),
    winProbability: 0,
    mentalStateId: mental.state.id,
    mentalStateName: mental.state.name,
    mentalBase: mental.base,
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
      { label: "Performance", value: round(performanceComponent) },
      { label: "Psychology and experience", value: round(psychologyExperienceComponent) },
      { label: "Health and resilience", value: round(healthComponent + resilienceComponent) },
      { label: "Finishing ability", value: round(finishingComponent) },
      { label: "Opponent interaction", value: interactionModifier },
      { label: "Story need", value: round(storyNeedModifier) },
      { label: "Momentum", value: round(momentumModifier) },
      { label: "Booker influence", value: round(bookingModifier) },
      { label: "Competitive volatility", value: round(volatilityNoise) },
    ],
    calculationLedger: {
      approachPlan: approaches.plan,
      mentalBase: mental.baseLedger,
      mentalState: mental.scoreLedger,
      approachExecution: executionLedger,
      presentation: presentation.ledger,
      performance: performanceLedger,
      competitive: competitiveLedger,
    },
  };
}

function applyProbabilities(results: MatchResolutionWorkerResult[], volatility: number): MatchResolutionWorkerResult[] {
  const formula = CALCULATION_FORMULAS.outcomeProbability;
  const temperature = formula.temperatureBase + volatility * formula.volatilityWeight;
  const minimum = Math.min(...results.map((result) => result.competitiveScore));
  const weights = results.map((result) => Math.exp((result.competitiveScore - minimum) / temperature));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return results.map((result, index) => ({ ...result, winProbability: weights[index] / total }));
}

function inferredFormat(setup: MatchResolutionSetup): NonNullable<MatchResolutionSetup["format"]> {
  if (setup.format) return setup.format;
  const matchType = normalize(setup.matchType);
  if (matchType.includes("battle royal") || matchType.includes("royal rumble")) return "Battle Royal";
  if (setup.eliminationRules || matchType.includes("elimination") || matchType.includes("survivor series")) return "Elimination";
  const teamIds = new Set(setup.workers.map((worker) => worker.teamId).filter(Boolean));
  if (teamIds.size >= 2 && teamIds.size < setup.workers.length) return "Team";
  return setup.workers.length === 2 ? "Singles" : "Multi Person";
}

function workerTeamId(worker: MatchResolutionWorkerSettings): string {
  return worker.teamId?.trim() || worker.workerKey;
}

function workerTeamName(worker: MatchResolutionWorkerSettings): string {
  return worker.teamName?.trim() || worker.workerName;
}

function teamResultsFor(
  setup: MatchResolutionSetup,
  workerResults: MatchResolutionWorkerResult[],
): MatchResolutionTeamResult[] {
  const grouped = new Map<string, { name: string; members: MatchResolutionWorkerResult[] }>();
  setup.workers.forEach((worker) => {
    const result = workerResults.find((item) => item.workerKey === worker.workerKey);
    if (!result) return;
    const id = workerTeamId(worker);
    const current = grouped.get(id) ?? { name: workerTeamName(worker), members: [] };
    current.members.push(result);
    grouped.set(id, current);
  });
  const teams = [...grouped.entries()].map(([id, team]) => ({
    id,
    name: team.name,
    memberKeys: team.members.map((member) => member.workerKey),
    memberNames: team.members.map((member) => member.workerName),
    competitiveScore: round(average(team.members.map((member) => member.competitiveScore)) + Math.min(4, team.members.length - 1)),
    winProbability: 0,
  }));
  const minimum = Math.min(...teams.map((team) => team.competitiveScore));
  const probabilityFormula = CALCULATION_FORMULAS.outcomeProbability;
  const temperature = probabilityFormula.temperatureBase + setup.volatility * probabilityFormula.volatilityWeight;
  const weights = teams.map((team) => Math.exp((team.competitiveScore - minimum) / temperature));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  return teams.map((team, index) => ({ ...team, winProbability: weights[index] / total }));
}

function outcomeLedgerFor(
  setup: MatchResolutionSetup,
  workerResults: MatchResolutionWorkerResult[],
  teams: MatchResolutionTeamResult[],
  resultRoll: number,
  selectedKey: string,
  selectedLabel: string,
): MatchResolutionOutcomeLedger {
  const formula = CALCULATION_FORMULAS.outcomeProbability;
  const teamOutcome = teams.length > 0;
  const items = teamOutcome ? teams : workerResults.map((worker) => ({
    id: worker.workerKey,
    name: worker.workerName,
    memberKeys: [worker.workerKey],
    memberNames: [worker.workerName],
    competitiveScore: worker.competitiveScore,
    winProbability: worker.winProbability,
  }));
  const temperature = formula.temperatureBase + setup.volatility * formula.volatilityWeight;
  const fieldMinimum = Math.min(...items.map((item) => item.competitiveScore));
  const rawEntries = items.map((item) => {
    const memberScores = item.memberKeys.map((key) => workerResults.find((worker) => worker.workerKey === key)?.competitiveScore ?? 0);
    const teamSizeBonus = teamOutcome ? Math.min(4, Math.max(0, memberScores.length - 1)) : 0;
    const scoreAboveMinimum = item.competitiveScore - fieldMinimum;
    const exponentialWeight = Math.exp(scoreAboveMinimum / temperature);
    return { item, memberScores, teamSizeBonus, scoreAboveMinimum, exponentialWeight };
  });
  const totalExponentialWeight = rawEntries.reduce((total, entry) => total + entry.exponentialWeight, 0) || 1;
  return {
    formulaId: formula.id,
    label: formula.label,
    formula: formula.formula,
    volatility: setup.volatility,
    temperature: roundCalculation(temperature, 6),
    fieldMinimum: roundCalculation(fieldMinimum, 6),
    totalExponentialWeight: roundCalculation(totalExponentialWeight, 6),
    entries: rawEntries.map(({ item, memberScores, teamSizeBonus, scoreAboveMinimum, exponentialWeight }) => ({
      key: item.id,
      label: item.name,
      memberScores,
      teamSizeBonus,
      competitiveScore: item.competitiveScore,
      scoreAboveMinimum: roundCalculation(scoreAboveMinimum, 6),
      exponentialWeight: roundCalculation(exponentialWeight, 6),
      probability: roundCalculation(exponentialWeight / totalExponentialWeight, formula.roundingPlaces),
    })),
    resultRoll,
    selectedKey,
    selectedLabel,
    roundingPlaces: formula.roundingPlaces,
    notes: [
      `Temperature = ${formula.temperatureBase} + (volatility ${setup.volatility} x ${formula.volatilityWeight}) = ${roundCalculation(temperature, 2)}.`,
      teamOutcome ? "Each team's competitive score is the average of its members plus up to four points for team size." : "Each wrestler's competitive score is converted directly into a probability weight.",
      "The result roll is compared with cumulative probabilities in displayed order; it does not alter any score.",
    ],
  };
}

function selectByProbability<T extends { winProbability: number }>(items: T[], roll: number): T {
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.winProbability;
    if (roll <= cumulative) return item;
  }
  return items.at(-1)!;
}

function eliminationOrder(
  results: MatchResolutionWorkerResult[],
  winners: MatchResolutionWorkerResult[],
  setup: MatchResolutionSetup,
  random: () => number,
) {
  const winnerKeys = new Set(winners.map((winner) => winner.workerKey));
  const remaining = results.filter((item) => !winnerKeys.has(item.workerKey));
  const survivalScores = new Map(remaining.map((item) => [item.workerKey, item.competitiveScore + random() * (10 + setup.volatility)]));
  const ordered = [...remaining].sort((left, right) => (survivalScores.get(left.workerKey) ?? 0) - (survivalScores.get(right.workerKey) ?? 0));
  return ordered.map((eliminated, index) => {
    const survivors = [...ordered.slice(index + 1), ...winners];
    const eliminator = survivors[Math.floor(random() * survivors.length)] ?? winners[0];
    const eliminatedSettings = setup.workers.find((item) => item.workerKey === eliminated.workerKey);
    return {
      order: index + 1,
      eliminatedWorkerKey: eliminated.workerKey,
      eliminatedWorkerName: eliminated.workerName,
      eliminatedTeamId: eliminatedSettings ? workerTeamId(eliminatedSettings) : eliminated.workerKey,
      byWorkerKey: eliminator.workerKey,
      byWorkerName: eliminator.workerName,
      finishType: finishTypeForWinner(eliminator, random),
    };
  });
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

function actualDuration(setup: MatchResolutionSetup, results: MatchResolutionWorkerResult[], random: () => number): number {
  const variance = IMPORTANCE_MODIFIERS[setup.importance].durationVariance;
  const matchPace = average(results.map((result) => result.actualPace));
  const idealPace = idealPaceForAim(setup.aimId);
  const paceAdjustment = idealPace === 0 ? 0 : (matchPace - idealPace) * 0.01;
  return round(Math.max(1, setup.durationMinutes * (1 + (random() * 2 - 1) * variance + paceAdjustment)), 2);
}

function matchScore(results: MatchResolutionWorkerResult[], setup: MatchResolutionSetup) {
  const formula = CALCULATION_FORMULAS.matchQuality;
  const performanceAverage = average(results.map((result) => result.performanceScore));
  const structure = average(results.map((result) => clamp(formula.structureBaseline + result.paceModifier * formula.structurePaceWeight + result.staminaModifier * formula.structureStaminaWeight)));
  const meanPerformance = average(results.map((result) => result.performanceScore));
  const meanDeviation = average(results.map((result) => Math.abs(result.performanceScore - meanPerformance)));
  const ordered = [...results].sort((left, right) => right.performanceScore - left.performanceScore);
  const dominanceGap = ordered[0].performanceScore - average(ordered.slice(1).map((result) => result.performanceScore));
  const closeness = setup.aimId === "squash-dominant-showcase" || normalize(setup.matchType).includes("squash")
    ? clamp(60 + dominanceGap * 2)
    : clamp(100 - meanDeviation * 2);
  const terms = [
    createCalculationTerm("performance", "Average individual performance", performanceAverage, formula.performanceWeight),
    createCalculationTerm("structure", "Average pace/endurance structure", structure, formula.structureWeight, `Per wrestler: ${formula.structureBaseline} + pace modifier x ${formula.structurePaceWeight} + endurance modifier x ${formula.structureStaminaWeight}, capped 0-100.`),
    createCalculationTerm("closeness", setup.aimId === "squash-dominant-showcase" || normalize(setup.matchType).includes("squash") ? "Squash dominance" : "Competitive closeness", closeness, formula.closenessWeight),
    createCalculationTerm("chemistry", "Chemistry bonus", setup.chemistry, formula.chemistryWeight),
  ];
  const raw = performanceAverage * formula.performanceWeight + structure * formula.structureWeight + closeness * formula.closenessWeight + setup.chemistry * formula.chemistryWeight;
  const ledger = createCalculationStage(formula, terms, {
    rawSubtotal: raw,
    notes: [
      setup.aimId === "squash-dominant-showcase" || normalize(setup.matchType).includes("squash")
        ? `Squash closeness uses 60 + (performance dominance gap x 2) = ${round(closeness)}.`
        : `Regular-match closeness uses 100 - (mean performance deviation x 2) = ${round(closeness)}.`,
      "This is the raw in-ring performance rating. Live crowd response is calculated separately when the result is locked into the card.",
    ],
  });
  return { score: ledger.result, ledger };
}

export function resolveMatch(input: ResolveMatchInput): MatchResolutionAttempt {
  if (input.workers.length < 2) throw new Error("A match requires at least two wrestler profiles.");
  if (input.setup.workers.length !== input.workers.length) throw new Error("The match setup must contain settings for every wrestler profile.");
  const uniqueKeys = new Set(input.workers.map((source) => source.profile.workerKey));
  if (uniqueKeys.size !== input.workers.length) throw new Error("Every match participant must have a unique wrestler profile.");
  const format = inferredFormat(input.setup);
  const teamIds = new Set(input.setup.workers.map(workerTeamId));
  if (format === "Team" && teamIds.size < 2) throw new Error("A team match requires at least two distinct teams.");
  const teamOutcome = format === "Team" || (format === "Elimination" && teamIds.size >= 2 && teamIds.size < input.workers.length);

  const seed = input.seed || createMatchEngineId();
  const random = seededRandom(seed);
  const opponentIndexGroups = input.setup.workers.map((worker, index) => {
    const ownTeam = workerTeamId(worker);
    const opponents = input.setup.workers.flatMap((candidate, candidateIndex) => candidateIndex !== index && workerTeamId(candidate) !== ownTeam ? [candidateIndex] : []);
    return opponents.length ? opponents : input.setup.workers.flatMap((_, candidateIndex) => candidateIndex !== index ? [candidateIndex] : []);
  });
  const approaches = input.workers.map((source, index) => selectedApproaches(
    input.setup.workers[index],
    source,
    opponentIndexGroups[index].map((opponentIndex) => input.workers[opponentIndex]),
    input.setup,
  ));
  let workerResults = input.workers.map((source, index) => workerResult(
    source,
    input.setup.workers[index],
    input.setup,
    approaches[index],
    opponentIndexGroups[index].map((opponentIndex) => approaches[opponentIndex].ids),
    random,
  ));
  const roll = round(random(), 6);
  let teams: MatchResolutionTeamResult[] = [];
  let winningTeam: MatchResolutionTeamResult;
  if (teamOutcome) {
    teams = teamResultsFor(input.setup, workerResults);
    winningTeam = selectByProbability(teams, roll);
    const teamProbability = new Map(teams.flatMap((team) => team.memberKeys.map((key) => [key, team.winProbability] as const)));
    workerResults = workerResults.map((result) => ({ ...result, winProbability: teamProbability.get(result.workerKey) ?? 0 }));
  } else {
    workerResults = applyProbabilities(workerResults, input.setup.volatility);
    const winner = selectByProbability(workerResults, roll);
    const settings = input.setup.workers.find((item) => item.workerKey === winner.workerKey)!;
    winningTeam = {
      id: workerTeamId(settings),
      name: workerTeamName(settings),
      memberKeys: [winner.workerKey],
      memberNames: [winner.workerName],
      competitiveScore: winner.competitiveScore,
      winProbability: winner.winProbability,
    };
  }
  const winningMembers = workerResults.filter((item) => winningTeam.memberKeys.includes(item.workerKey));
  const losingMembers = workerResults.filter((item) => !winningTeam.memberKeys.includes(item.workerKey));
  const fallWinner = [...winningMembers].sort((left, right) => right.competitiveScore - left.competitiveScore)[0];
  const eliminations = format === "Elimination" || format === "Battle Royal"
    ? eliminationOrder(workerResults, winningMembers, input.setup, random)
    : [];
  const finalEliminatedKey = eliminations.at(-1)?.eliminatedWorkerKey;
  const fallLoser = losingMembers.find((item) => item.workerKey === finalEliminatedKey)
    ?? [...losingMembers].sort((left, right) => left.competitiveScore - right.competitiveScore)[0];
  const finishType = finishTypeForWinner(fallWinner, random);
  const score = matchScore(workerResults, input.setup);
  const duration = actualDuration(input.setup, workerResults, random);
  const performanceLeader = [...workerResults].sort((left, right) => right.performanceScore - left.performanceScore)[0];
  const winnerName = teamOutcome ? winningTeam.name : fallWinner.workerName;
  const loserName = teamOutcome
    ? teams.filter((team) => team.id !== winningTeam.id).map((team) => team.name).join(" & ")
    : fallLoser.workerName;
  const result: MatchResolutionEngineResult = {
    winnerKey: fallWinner.workerKey,
    winnerName,
    loserKey: fallLoser.workerKey,
    loserName,
    winnerTeamId: winningTeam.id,
    winnerTeamName: winnerName,
    winnerMemberKeys: winningTeam.memberKeys,
    winnerMemberNames: winningTeam.memberNames,
    loserKeys: losingMembers.map((item) => item.workerKey),
    loserNames: losingMembers.map((item) => item.workerName),
    fallWinnerKey: fallWinner.workerKey,
    fallWinnerName: fallWinner.workerName,
    fallLoserKey: fallLoser.workerKey,
    fallLoserName: fallLoser.workerName,
    teamResults: teams,
    eliminationOrder: eliminations,
    finishType,
    finishDescription: teamOutcome
      ? `${winnerName} won when ${fallWinner.workerName} defeated ${fallLoser.workerName} by ${finishType.toLowerCase()}.`
      : format === "Battle Royal"
        ? `${fallWinner.workerName} won the battle royal after eliminating ${fallLoser.workerName} last.`
        : format === "Elimination"
          ? `${fallWinner.workerName} survived the elimination match and secured the final elimination over ${fallLoser.workerName}.`
          : finishDescription(finishType, fallWinner, fallLoser),
    actualDurationMinutes: duration,
    matchScore: score.score,
    starRating: calculateStarRating(score.score),
    performanceLeaderKey: performanceLeader.workerKey,
    performanceLeaderName: performanceLeader.workerName,
    winnerProbability: winningTeam.winProbability,
    resultRoll: roll,
    confidenceLabel: confidenceLabel(Math.max(...(teams.length ? teams : workerResults).map((item) => item.winProbability))),
    upset: winningTeam.winProbability < 1 / (teams.length || workerResults.length),
    decisiveFactors: decisiveFactors(fallWinner, fallLoser),
    matchFacts: [
      `${winnerName} won the ${format.toLowerCase()} match.`,
      teamOutcome ? `${fallWinner.workerName} scored the deciding fall over ${fallLoser.workerName}.` : `${fallWinner.workerName} secured the deciding result over ${fallLoser.workerName}.`,
      `${performanceLeader.workerName} delivered the strongest individual performance.`,
      ...eliminations.map((item) => `${item.byWorkerName} eliminated ${item.eliminatedWorkerName} (${item.order}).`),
      ...workerResults.flatMap((item) => item.incident ? [`${item.workerName}: ${item.incident}`] : []),
    ],
  };
  const outcomeLedger = outcomeLedgerFor(input.setup, workerResults, teams, roll, winningTeam.id, winnerName);
  return {
    id: createMatchEngineId(), number: 1, seed,
    setupFingerprint: matchResolutionSetupFingerprint(input.setup, input.workers),
    setupChangeReason: input.setupChangeReason ?? "",
    calculationVersion: RESOLUTION_CALCULATION_VERSION,
    generatedAt: new Date().toISOString(), status: "Calculated", workerResults,
    engineResult: result, finalResult: null,
    calculationLedger: { version: RESOLUTION_CALCULATION_VERSION, matchQuality: score.ledger, outcome: outcomeLedger },
  };
}

export function resolveSinglesMatch(input: ResolveSinglesMatchInput): MatchResolutionAttempt {
  if (input.workers.length !== 2) throw new Error("The Phase 6B1 singles engine requires exactly two wrestler profiles.");
  if (input.setup.workers.length !== 2) throw new Error("The match setup must contain exactly two wrestler settings.");
  const seed = input.seed || createMatchEngineId();
  const random = seededRandom(seed);
  const firstApproaches = selectedApproaches(input.setup.workers[0], input.workers[0], [input.workers[1]], input.setup);
  const secondApproaches = selectedApproaches(input.setup.workers[1], input.workers[1], [input.workers[0]], input.setup);
  const first = workerResult(input.workers[0], input.setup.workers[0], input.setup, firstApproaches, [secondApproaches.ids], random);
  const second = workerResult(input.workers[1], input.setup.workers[1], input.setup, secondApproaches, [firstApproaches.ids], random);
  const workerResults = applyProbabilities([first, second], input.setup.volatility);
  const roll = round(random(), 6);
  const winner = roll <= workerResults[0].winProbability ? workerResults[0] : workerResults[1];
  const loser = winner.workerKey === workerResults[0].workerKey ? workerResults[1] : workerResults[0];
  const finishType = finishTypeForWinner(winner, random);
  const score = matchScore(workerResults, input.setup);
  const duration = actualDuration(input.setup, workerResults, random);
  const performanceLeader = [...workerResults].sort((left, right) => right.performanceScore - left.performanceScore)[0];
  const result: MatchResolutionEngineResult = {
    winnerKey: winner.workerKey,
    winnerName: winner.workerName,
    loserKey: loser.workerKey,
    loserName: loser.workerName,
    finishType,
    finishDescription: finishDescription(finishType, winner, loser),
    actualDurationMinutes: duration,
    matchScore: score.score,
    starRating: calculateStarRating(score.score),
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
  const outcomeLedger = outcomeLedgerFor(input.setup, workerResults, [], roll, winner.workerKey, winner.workerName);
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
    calculationLedger: { version: RESOLUTION_CALCULATION_VERSION, matchQuality: score.ledger, outcome: outcomeLedger },
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
    winnerTeamId: result.winnerTeamId,
    winnerTeamName: result.winnerTeamName,
    winnerMemberKeys: result.winnerMemberKeys,
    winnerMemberNames: result.winnerMemberNames,
    loserKeys: result.loserKeys,
    loserNames: result.loserNames,
    fallWinnerKey: result.fallWinnerKey,
    fallWinnerName: result.fallWinnerName,
    fallLoserKey: result.fallLoserKey,
    fallLoserName: result.fallLoserName,
    eliminationOrder: result.eliminationOrder,
    finishType: result.finishType,
    finishDescription: result.finishDescription,
    actualDurationMinutes: result.actualDurationMinutes,
    matchScore: result.matchScore,
    starRating: result.starRating,
    upset: result.upset,
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
  if (!reason.trim()) throw new Error("Record why the engine result was overridden.");
  if (finishType === "No Contest") {
    const finalResult: MatchResolutionFinalResult = {
      winnerKey: "",
      winnerName: "",
      loserKey: "",
      loserName: "",
      winnerTeamId: "",
      winnerTeamName: "",
      winnerMemberKeys: [],
      winnerMemberNames: [],
      loserKeys: [],
      loserNames: [],
      fallWinnerKey: "",
      fallWinnerName: "",
      fallLoserKey: "",
      fallLoserName: "",
      eliminationOrder: [],
      finishType,
      finishDescription: finishDescriptionValue.trim() || "The match ended in a No Contest; no winner or loser was recorded.",
      actualDurationMinutes: attempt.engineResult.actualDurationMinutes,
      matchScore: attempt.engineResult.matchScore,
      starRating: attempt.engineResult.starRating,
      upset: false,
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
  const winner = attempt.workerResults.find((item) => item.workerKey === winnerKey);
  if (!winner) throw new Error("Choose one of the calculated match participants as the override winner.");
  const setupWorker = record.setup.workers.find((item) => item.workerKey === winnerKey);
  const format = inferredFormat(record.setup);
  const distinctTeamIds = new Set(record.setup.workers.map(workerTeamId));
  const teamOutcome = format === "Team" || (format === "Elimination" && distinctTeamIds.size >= 2 && distinctTeamIds.size < record.setup.workers.length);
  const winnerTeamId = setupWorker ? workerTeamId(setupWorker) : winnerKey;
  const winnerMembers = teamOutcome
    ? attempt.workerResults.filter((item) => {
      const settings = record.setup.workers.find((worker) => worker.workerKey === item.workerKey);
      return settings ? workerTeamId(settings) === winnerTeamId : item.workerKey === winnerKey;
    })
    : [winner];
  const losers = attempt.workerResults.filter((item) => !winnerMembers.some((member) => member.workerKey === item.workerKey));
  const loser = [...losers].sort((left, right) => left.competitiveScore - right.competitiveScore)[0];
  if (!loser) throw new Error("The override winner must leave at least one losing participant.");
  const winnerName = teamOutcome ? workerTeamName(setupWorker!) : winner.workerName;
  const loserName = teamOutcome
    ? Array.from(new Set(losers.map((item) => {
      const settings = record.setup.workers.find((worker) => worker.workerKey === item.workerKey);
      return settings ? workerTeamName(settings) : item.workerName;
    }))).join(" & ")
    : loser.workerName;
  const outcomeCount = attempt.engineResult.teamResults?.length || attempt.workerResults.length;
  const finalWinProbability = teamOutcome
    ? attempt.engineResult.teamResults?.find((team) => team.id === winnerTeamId)?.winProbability ?? winner.winProbability
    : winner.winProbability;
  const finalResult: MatchResolutionFinalResult = {
    winnerKey: winner.workerKey,
    winnerName,
    loserKey: loser.workerKey,
    loserName,
    winnerTeamId,
    winnerTeamName: winnerName,
    winnerMemberKeys: winnerMembers.map((item) => item.workerKey),
    winnerMemberNames: winnerMembers.map((item) => item.workerName),
    loserKeys: losers.map((item) => item.workerKey),
    loserNames: losers.map((item) => item.workerName),
    fallWinnerKey: winner.workerKey,
    fallWinnerName: winner.workerName,
    fallLoserKey: loser.workerKey,
    fallLoserName: loser.workerName,
    eliminationOrder: attempt.engineResult.eliminationOrder,
    finishType,
    finishDescription: finishDescriptionValue.trim() || `${winnerName} defeated ${loserName} by ${finishType.toLowerCase()}.`,
    actualDurationMinutes: attempt.engineResult.actualDurationMinutes,
    matchScore: attempt.engineResult.matchScore,
    starRating: attempt.engineResult.starRating,
    upset: finalWinProbability < 1 / outcomeCount,
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

export function finalizeResolutionForLiveCrowd(
  record: MatchResolutionRecord,
  anticipation: MatchAnticipation,
  crowdBefore: number,
): MatchResolutionRecord {
  const attempt = activeResolutionAttempt(record);
  if (!attempt?.finalResult || (attempt.status !== "Accepted" && attempt.status !== "Overridden")) throw new Error("Accept or explicitly override the match result before applying the live crowd rating.");
  if (attempt.finalResult.audience) return record;
  const audience = calculateLiveMatchAudience(attempt.engineResult.matchScore, anticipation.score, crowdBefore, attempt.workerResults.map((result) => result.mentalStateName));
  const finalResult: MatchResolutionFinalResult = {
    ...attempt.finalResult,
    performanceRating: attempt.engineResult.matchScore,
    audience,
    matchScore: audience.finalRating,
    starRating: calculateStarRating(audience.finalRating),
  };
  return {
    ...record,
    setup: { ...record.setup, anticipation },
    attempts: record.attempts.map((item) => item.id === attempt.id ? { ...item, finalResult } : item),
    updatedAt: new Date().toISOString(),
  };
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
