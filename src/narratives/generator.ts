import { MATCH_AIMS } from "../matchEngine/catalog";
import { evaluateApproachPlan, getApproach, workerProfileKey } from "../matchEngine/model";
import type { MatchEngineUniverse, MatchWorkerPerformanceResult } from "../matchEngine/types";
import type { PlannedSegment, PlannedWorkerReference } from "../planner/types";

export type NarrativeTone = "sports" | "dramatic" | "road-agent";
export type NarrativeDetail = "concise" | "standard" | "detailed";

export interface NarrativeGenerationOptions {
  tone: NarrativeTone;
  detail: NarrativeDetail;
  usePerformancePreview: boolean;
}

export interface GeneratedNarrativeDraft {
  kind: "match" | "angle";
  generatedAt: string;
  opening: string;
  middle: string;
  turningPoint: string;
  finish: string;
  aftermath: string;
  fullOutput: string;
  keyMoments: string;
  audienceTakeaway: string;
  warnings: string[];
  provenance: string[];
}

function sentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function lowerFirst(value: string): string {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}

function joinHuman(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function isLikelyCompetitor(worker: PlannedWorkerReference): boolean {
  const role = worker.role.trim().toLowerCase();
  if (!role) return true;
  return !["manager", "referee", "announcer", "commentator", "road agent", "cornerman"].some((term) => role.includes(term));
}

function tonePrefix(tone: NarrativeTone): string {
  if (tone === "road-agent") return "Road-agent direction:";
  if (tone === "dramatic") return "The match is presented as a major emotional contest.";
  return "The match is presented as a competitive sporting contest.";
}

function performanceResultFor(segment: PlannedSegment, workerKey: string): MatchWorkerPerformanceResult | null {
  return segment.matchApproachSetup.performancePreview?.workerResults.find((result) => result.workerKey === workerKey) ?? null;
}

function mentalStatePhrase(result: MatchWorkerPerformanceResult): string {
  if (result.mentalStateName === "HOT NIGHT") return `${result.workerName} is projected to be unusually sharp and confident`;
  if (result.mentalStateName === "FOCUSED") return `${result.workerName} is projected to work with strong focus`;
  if (result.mentalStateName === "DISTRACTED") return `${result.workerName} may lose timing or concentration during the middle stretch`;
  if (result.mentalStateName === "OFF NIGHT") return `${result.workerName} may struggle to execute the planned structure cleanly`;
  return `${result.workerName} is projected to perform near their normal level`;
}

function approachPhrase(segment: PlannedSegment, worker: PlannedWorkerReference, phase: "style" | "offense" | "selling" | "finish"): { text: string; missing: string[] } {
  const key = workerProfileKey(worker);
  const plan = segment.matchApproachSetup.workerPlans.find((item) => item.workerKey === key);
  const approaches = plan?.selectedApproachIds.map((id) => getApproach(id)).filter((item) => item !== null) ?? [];
  const missing: string[] = [];
  if (approaches.length === 0) return { text: "", missing };
  const index = phase === "style" ? 0 : phase === "offense" ? Math.min(1, approaches.length - 1) : phase === "selling" ? Math.min(2, approaches.length - 1) : approaches.length - 1;
  const approach = approaches[index];
  if (!approach.narrative) {
    missing.push(approach.name);
    return { text: lowerFirst(approach.summary), missing };
  }
  if (phase === "style") return { text: approach.narrative.styleSummary, missing };
  if (phase === "offense") return { text: approach.narrative.offensePhrase, missing };
  if (phase === "selling") return { text: approach.narrative.sellingPhrase, missing };
  return { text: approach.narrative.finishPhrase, missing };
}

export function generateMatchNarrative(
  segment: PlannedSegment,
  universe: MatchEngineUniverse,
  options: NarrativeGenerationOptions,
): GeneratedNarrativeDraft {
  const warnings: string[] = [];
  const provenance = [
    "Selected approaches, match aim, stamina, and pace come from the tracker match setup.",
    "Approach wording uses the uploaded phrase library when a source phrase exists.",
    "Connecting sentences are editable tracker templates and are not TEW-generated text.",
  ];
  const competitors = segment.workers.filter(isLikelyCompetitor);
  if (competitors.length === 0) warnings.push("No competitors are assigned to this match.");
  if (!segment.plannedWinner.trim()) warnings.push("No planned winner is entered. The draft deliberately leaves the winner unresolved for TEW or later booking.");
  if (!segment.plannedFinish.trim()) warnings.push("No planned finish is entered. The closing paragraph remains general.");
  if (!segment.matchApproachSetup.performancePreview && options.usePerformancePreview) warnings.push("No performance preview exists, so mental-state and off-night details were omitted.");

  const aim = MATCH_AIMS.find((item) => item.id === segment.matchApproachSetup.matchAimId) ?? MATCH_AIMS[0];
  const workerDetails = competitors.map((worker) => {
    const key = workerProfileKey(worker);
    const profile = universe.profiles.find((item) => item.workerKey === key) ?? null;
    const plan = segment.matchApproachSetup.workerPlans.find((item) => item.workerKey === key) ?? null;
    const evaluation = profile && plan ? evaluateApproachPlan(profile, aim.id, segment.durationMinutes, plan.selectedApproachIds) : null;
    const style = approachPhrase(segment, worker, "style");
    const offense = approachPhrase(segment, worker, "offense");
    const selling = approachPhrase(segment, worker, "selling");
    const finish = approachPhrase(segment, worker, "finish");
    [...style.missing, ...offense.missing, ...selling.missing, ...finish.missing].forEach((name) => {
      const warning = `${name} has no dedicated phrase-library row; its source summary was used instead.`;
      if (!warnings.includes(warning)) warnings.push(warning);
    });
    return { worker, key, profile, plan, evaluation, style: style.text, offense: offense.text, selling: selling.text, finish: finish.text };
  });

  const openingParts = workerDetails.map((detail) => detail.style ? `${detail.worker.name} ${detail.style}` : `${detail.worker.name} establishes their preferred style`);
  const opening = sentence(`${tonePrefix(options.tone)} ${joinHuman(openingParts)}. The opening should establish ${aim.name.toLowerCase()} at ${aim.idealPace === 0 ? "an open pace" : `pace ${aim.idealPace}`}`);

  const middleParts = workerDetails.map((detail) => {
    const offense = detail.offense || "works through the selected approach plan";
    const structure = detail.evaluation
      ? ` while managing ${detail.evaluation.usedStamina}/${detail.evaluation.availableStamina} stamina and a ${detail.evaluation.pace.status.toLowerCase()} pace result`
      : "";
    return `${detail.worker.name} advances the match by ${offense}${structure}`;
  });
  const middle = sentence(joinHuman(middleParts));

  const previewDetails = options.usePerformancePreview
    ? workerDetails.map((detail) => performanceResultFor(segment, detail.key)).filter((item): item is MatchWorkerPerformanceResult => item !== null)
    : [];
  const turningPoint = previewDetails.length > 0
    ? sentence(`${joinHuman(previewDetails.map(mentalStatePhrase))}. The turning point should reflect those projected execution differences without changing the booked result`)
    : sentence(`${joinHuman(workerDetails.map((detail) => `${detail.worker.name} ${detail.selling || "sells the accumulated damage and adjusts to the opponent's strategy"}`))}. The match then moves into its decisive stretch`);

  const plannedWinner = segment.plannedWinner.trim();
  const winnerDetail = workerDetails.find((detail) => detail.worker.name.toLowerCase() === plannedWinner.toLowerCase());
  const finishAction = winnerDetail?.finish || "completes the planned closing sequence";
  const finish = plannedWinner
    ? sentence(`${plannedWinner} ${finishAction} and wins${segment.plannedFinish.trim() ? ` by ${lowerFirst(segment.plannedFinish.trim())}` : " through the planned finish"}${segment.interference.trim() ? `. Interference note: ${segment.interference.trim()}` : ""}`)
    : sentence(`The closing exchange uses the selected finish approaches, but the winner remains unresolved in this tracker draft${segment.plannedFinish.trim() ? `. Planned finish type: ${segment.plannedFinish.trim()}` : ""}`);

  const aftermathParts = [segment.postMatch, segment.consequences, segment.followUp].filter((value) => value.trim()).map(sentence);
  const aftermath = aftermathParts.length > 0
    ? aftermathParts.join(" ")
    : "No post-match event or required follow-up has been entered.";

  const phaseParagraphs = [opening, middle, turningPoint, finish, aftermath].filter(Boolean);
  let fullOutput = phaseParagraphs.join("\n\n");
  if (options.detail === "concise") fullOutput = [opening, finish, aftermath].filter(Boolean).join("\n\n");
  if (options.detail === "detailed") {
    const approachList = workerDetails.map((detail) => `${detail.worker.name}: ${detail.plan?.selectedApproachIds.map((id) => getApproach(id)?.name ?? id).join(", ") || "No approaches selected"}`).join("\n");
    fullOutput = `${fullOutput}\n\nApproach map:\n${approachList}`;
  }

  const keyMoments = [
    `Opening: ${opening}`,
    `Middle: ${middle}`,
    `Turning point: ${turningPoint}`,
    `Finish: ${finish}`,
    `Aftermath: ${aftermath}`,
  ].join("\n");

  return {
    kind: "match",
    generatedAt: new Date().toISOString(),
    opening,
    middle,
    turningPoint,
    finish,
    aftermath,
    fullOutput,
    keyMoments,
    audienceTakeaway: segment.audienceTakeaway,
    warnings,
    provenance,
  };
}

export function generateAngleNarrative(segment: PlannedSegment, options: NarrativeGenerationOptions): GeneratedNarrativeDraft {
  const warnings: string[] = [];
  const provenance = [
    "The angle draft uses only workers, roles, location, content type, purpose, consequences, follow-up, and audience takeaway already entered in the tracker.",
    "No dialogue, action, or TEW result is invented beyond editable structural connector text.",
  ];
  const names = segment.workers.map((worker) => worker.name).filter(Boolean);
  if (names.length === 0) warnings.push("No workers are assigned to the angle.");
  if (!segment.purpose.trim()) warnings.push("No story purpose is entered, so the central beat remains general.");
  if (!segment.audienceTakeaway.trim()) warnings.push("No intended audience takeaway is entered.");

  const opening = sentence(`The segment opens ${segment.angleLocation ? `at ${segment.angleLocation}` : "in the selected location"}. ${names.length ? joinHuman(names) : "The assigned participants"} enter the scene for a ${segment.angleContentType.toLowerCase() || "storyline"} segment`);
  const roleSummary = segment.workers.filter((worker) => worker.role.trim()).map((worker) => `${worker.name} is used as ${lowerFirst(worker.role)}`);
  const middle = sentence(segment.purpose.trim() || (roleSummary.length ? joinHuman(roleSummary) : "The participants establish the central story beat without scripted dialogue"));
  const turningPoint = sentence(segment.consequences.trim() || "The segment changes the relationship or stakes established by the current storyline");
  const finish = sentence(segment.audienceTakeaway.trim() ? `The closing image makes clear that ${lowerFirst(segment.audienceTakeaway.trim())}` : "The segment ends on a clear visual that can be completed in the editable Segment Output");
  const aftermath = sentence(segment.followUp.trim() || "No required follow-up has been entered");
  const fullOutput = options.detail === "concise"
    ? [opening, middle, finish].join("\n\n")
    : [opening, middle, turningPoint, finish, aftermath].join("\n\n");

  return {
    kind: "angle",
    generatedAt: new Date().toISOString(),
    opening,
    middle,
    turningPoint,
    finish,
    aftermath,
    fullOutput,
    keyMoments: [opening, middle, turningPoint, finish, aftermath].map((value, index) => `${index + 1}. ${value}`).join("\n"),
    audienceTakeaway: segment.audienceTakeaway,
    warnings,
    provenance,
  };
}
