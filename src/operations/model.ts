import type { HandoffUniverse, HandoffVersion, ShowHandoffRecord } from "../handoff/types";
import { MATCH_AIMS, MATCH_APPROACHES } from "../matchEngine/catalog";
import { approachLimitForSetup, evaluatePace, profileStaminaCapacity } from "../matchEngine/model";
import type { MatchEngineProfile } from "../matchEngine/types";
import type { ActualMatchSnapshot, PlannedSegment, PlannedShow } from "../planner/types";
import type { MatchRecord, ShowRecord, TewSnapshot } from "../tew/types";
import type { TransferPackage, TransferRecord, TransferUniverse } from "../transfer/types";
import type {
  OperationsChangeNote,
  PreflightActionTarget,
  PreflightCategory,
  PreflightSeverity,
  ResultIntakeSession,
  ResultMatchSuggestion,
  ShowOperationStage,
  ShowOperationsRecord,
  ShowOperationsSummary,
  ShowOperationsUniverse,
  ShowPreflightIssue,
  ShowPreflightReport,
} from "./types";

function createId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function words(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter((word) => word.length > 1));
}

function similarity(left: string, right: string): number {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / new Set([...a, ...b]).size;
}

function parseMinutes(value: string): number | null {
  const found = value.match(/(\d+(?:\.\d+)?)/);
  return found ? Number(found[1]) : null;
}

function plannedMinutes(show: PlannedShow): number {
  return show.segments.reduce((total, segment) => total + segment.durationMinutes, 0);
}

function findHandoffRecord(showId: string, universe: HandoffUniverse): ShowHandoffRecord | null {
  return universe.records.find((record) => record.showId === showId) ?? null;
}

function findHandoffVersion(record: ShowHandoffRecord | null): HandoffVersion | null {
  if (!record) return null;
  return record.versions.find((version) => version.id === record.activeVersionId) ?? record.versions.at(-1) ?? null;
}

function findTransferRecord(showId: string, universe: TransferUniverse): TransferRecord | null {
  return universe.records.find((record) => record.showId === showId) ?? null;
}

function findTransferPackage(record: TransferRecord | null): TransferPackage | null {
  if (!record) return null;
  return record.packageHistory.find((pkg) => pkg.id === record.activePackageId) ?? record.packageHistory.at(-1) ?? null;
}

export function emptyShowOperationsUniverse(): ShowOperationsUniverse {
  return { records: [] };
}

export function createShowOperationsRecord(showId: string): ShowOperationsRecord {
  return {
    showId,
    acknowledgedIssueIds: [],
    changeNotes: [],
    resultSessions: [],
    lastViewedTab: "overview",
    updatedAt: new Date().toISOString(),
  };
}

export function operationsRecord(showId: string, universe: ShowOperationsUniverse): ShowOperationsRecord {
  return universe.records.find((record) => record.showId === showId) ?? createShowOperationsRecord(showId);
}

function makeIssue(
  show: PlannedShow,
  acknowledged: Set<string>,
  suffix: string,
  severity: PreflightSeverity,
  category: PreflightCategory,
  message: string,
  detail: string,
  actionLabel: string,
  actionTarget: PreflightActionTarget,
  segmentId = "",
): ShowPreflightIssue {
  const id = `${show.id}:${segmentId || "show"}:${suffix}`;
  return { id, severity, category, message, detail, segmentId, actionLabel, actionTarget, acknowledged: acknowledged.has(id) };
}

function averageApproachPace(segment: PlannedSegment): number {
  const paces: number[] = segment.matchApproachSetup.workerPlans
    .flatMap((plan) => plan.selectedApproachIds)
    .map((approachId) => Number(MATCH_APPROACHES.find((approach) => approach.id === approachId)?.pace ?? 0));
  if (!paces.length) return 0;
  return Math.round((paces.reduce((total: number, value: number) => total + value, 0) / paces.length) * 20) / 10;
}

function staminaCost(segment: PlannedSegment, workerKey: string): number {
  const plan = segment.matchApproachSetup.workerPlans.find((item) => item.workerKey === workerKey);
  return plan?.selectedApproachIds.reduce((total: number, approachId) => total + Number(MATCH_APPROACHES.find((approach) => approach.id === approachId)?.staminaCost ?? 0), 0) ?? 0;
}

export function buildShowPreflight(
  show: PlannedShow,
  handoff: HandoffUniverse,
  transfer: TransferUniverse,
  acknowledgedIssueIds: string[] = [],
  profiles: MatchEngineProfile[] = [],
): ShowPreflightReport {
  const acknowledged = new Set(acknowledgedIssueIds);
  const issues: ShowPreflightIssue[] = [];
  const add = (
    suffix: string,
    severity: PreflightSeverity,
    category: PreflightCategory,
    message: string,
    detail: string,
    actionLabel: string,
    actionTarget: PreflightActionTarget,
    segmentId = "",
  ) => issues.push(makeIssue(show, acknowledged, suffix, severity, category, message, detail, actionLabel, actionTarget, segmentId));

  if (!show.name.trim() || /^untitled show/i.test(show.name)) add("show-name", "Blocking", "Show", "Show name is not final", "Set the exact event or television-show name that will be used in TEW.", "Open Show", "show");
  if (!show.date.trim()) add("show-date", "Blocking", "Show", "Show date is missing", "A date is required for TEW entry and post-show matching.", "Open Show", "show");
  if (!show.company.trim()) add("show-company", "Important", "Show", "Company is missing", "Set the TEW company so worker, championship, and storyline mappings remain clear.", "Open Show", "show");
  if (!show.showType.trim()) add("show-type", "Important", "Show", "Event type is missing", "Choose television, event, tour, or the appropriate tracker label.", "Open Show", "show");
  if (!show.venue.trim()) add("show-venue", "Advisory", "Show", "Venue is not set", "Venue information improves transfer and result matching.", "Open Show", "show");
  if (!show.segments.length) add("empty-card", "Blocking", "Card", "The card has no segments", "Add at least one match or angle before finalization.", "Open Show", "show");

  const minutes = plannedMinutes(show);
  const runtimeRatio = show.expectedMinutes > 0 ? Math.abs(minutes - show.expectedMinutes) / show.expectedMinutes : 0;
  if (runtimeRatio >= 0.25) add("runtime-major", "Important", "Card", "Card runtime is far from the target", `${minutes} planned minutes versus ${show.expectedMinutes} expected minutes.`, "Review Card", "show");
  else if (runtimeRatio >= 0.1) add("runtime-minor", "Advisory", "Card", "Card runtime differs from the target", `${minutes} planned minutes versus ${show.expectedMinutes} expected minutes.`, "Review Card", "show");

  const bookings = new Map<string, PlannedSegment[]>();
  show.segments.forEach((segment) => segment.workers.forEach((worker) => {
    const key = normalize(worker.name);
    if (key) bookings.set(key, [...(bookings.get(key) ?? []), segment]);
  }));
  bookings.forEach((segments, workerKey) => {
    const matches = segments.filter((segment) => segment.type === "match");
    if (matches.length > 1) {
      const displayName = matches[0].workers.find((worker) => normalize(worker.name) === workerKey)?.name ?? workerKey;
      add(`double-booked-${workerKey}`, "Important", "Card", `${displayName} is booked in multiple matches`, `${matches.length} matches use this worker. Acknowledge deliberate tournament or storyline double duty.`, "Review First Match", "show", matches[0].id);
    }
  });

  show.segments.forEach((segment, index) => {
    const category: PreflightCategory = segment.type === "match" ? "Match" : "Angle";
    const prefix = `Segment ${index + 1}: ${segment.title || (segment.type === "match" ? "Untitled Match" : "Untitled Angle")}`;
    if (!segment.title.trim() || /^untitled/i.test(segment.title)) add("title", "Blocking", category, `${prefix} needs a final title`, "Name the segment so it can be identified during entry and reconciliation.", "Open Segment", "show", segment.id);
    if (segment.durationMinutes <= 0) add("duration", "Blocking", category, `${prefix} has no valid duration`, "Set a positive planned duration.", "Open Segment", "show", segment.id);
    if (!segment.workers.length) add("workers", "Blocking", category, `${prefix} has no participants`, "Add the workers or teams involved.", "Open Segment", "show", segment.id);
    if (segment.workers.some((worker) => !worker.role.trim())) add("roles", "Important", category, `${prefix} has participants without roles`, "Assign competitor, manager, speaker, target, or another clear role.", "Open Segment", "show", segment.id);

    if (segment.type === "match") {
      if (!segment.matchType.trim()) add("match-type", "Blocking", "Match", `${prefix} is missing its match type`, "Set the TEW match type before handoff.", "Open Match", "match-setup", segment.id);
      const authority = segment.matchApproachSetup.performanceSettings.authority;
      if (authority === "booker-selected" && !segment.plannedWinner.trim()) add("winner", "Blocking", "Match", `${prefix} needs a booked winner`, "Booker-selected mode requires a planned winner.", "Open Match", "match-setup", segment.id);
      if (authority === "booker-selected" && !segment.plannedFinish.trim()) add("finish", "Important", "Match", `${prefix} needs a planned finish`, "Set the finish that should be entered in TEW.", "Open Match Story", "match-story", segment.id);
      if (!segment.matchStory.trim()) add("story", "Important", "Match", `${prefix} has no Match Story`, "Generate or write the opening, middle, turning point, finish, and aftermath.", "Open Match Story", "match-story", segment.id);

      const requiredSlots = approachLimitForSetup(segment.durationMinutes, segment.matchApproachSetup.approachLimit);
      segment.workers.forEach((worker) => {
        const key = `${worker.source}:${worker.id}`;
        const plan = segment.matchApproachSetup.workerPlans.find((item) => item.workerKey === key || normalize(item.workerName) === normalize(worker.name));
        if (!plan?.selectedApproachIds.length) add(`approach-${key}`, "Important", "Match", `${worker.name} has no selected approach in ${prefix}`, `${requiredSlots} approach slot${requiredSlots === 1 ? " is" : "s are"} available at ${segment.durationMinutes} minutes.`, "Open Match Setup", "match-setup", segment.id);
        else if (plan.selectedApproachIds.length !== requiredSlots) add(`approach-count-${key}`, "Important", "Match", `${worker.name} has the wrong number of approaches in ${prefix}`, `${plan.selectedApproachIds.length} selected; ${requiredSlots} required by the duration rule.`, "Open Match Setup", "match-setup", segment.id);
        const profile = profiles.find((item) => item.workerKey === key || normalize(item.workerName) === normalize(worker.name));
        const staminaAvailable = profile ? profileStaminaCapacity(profile) : null;
        const staminaUsed = staminaCost(segment, plan?.workerKey ?? key);
        if (staminaAvailable !== null && staminaUsed > staminaAvailable) add(`stamina-${key}`, "Important", "Match", `${worker.name} exceeds their approach stamina budget in ${prefix}`, `${staminaUsed}/${staminaAvailable} stamina is planned. Reduce high-cost approaches or acknowledge the fatigue risk.`, "Open Match Setup", "match-setup", segment.id);
      });

      const aim = MATCH_AIMS.find((item) => item.id === segment.matchApproachSetup.matchAimId);
      const paceValue = averageApproachPace(segment);
      if (aim && paceValue > 0) {
        const pace = evaluatePace(aim.idealPace, paceValue);
        if (pace.modifier <= -10) add("pace-conflict", "Important", "Match", `${prefix} has a major pace conflict`, `${aim.name} expects pace ${aim.idealPace}; selected approaches average ${paceValue} (${pace.status}).`, "Open Match Setup", "match-setup", segment.id);
        else if (pace.modifier < 0) add("pace-warning", "Advisory", "Match", `${prefix} is slightly off its intended pace`, `${aim.name} expects pace ${aim.idealPace}; selected approaches average ${paceValue}.`, "Open Match Setup", "match-setup", segment.id);
      }
      if (segment.championship && !segment.championshipStakes.trim()) add("title-stakes", "Important", "Championship", `${prefix} is a championship match without written stakes`, "Document the title purpose, champion entering, challenger, and expected consequence.", "Open Match", "match-story", segment.id);
      if (segment.competitionId && (!segment.competitionFixtureId || !segment.competitionRoundLabel.trim())) add("competition-link", "Important", "Competition", `${prefix} has an incomplete competition link`, "Reconnect the fixture and round before finalizing the card.", "Open Match", "match-story", segment.id);
    } else {
      if (!segment.segmentOutput.trim()) add("output", "Important", "Angle", `${prefix} has no Segment Output`, "Generate or write the complete angle output before handoff.", "Open Angle Output", "angle-output", segment.id);
      if (!segment.purpose.trim()) add("purpose", "Advisory", "Angle", `${prefix} has no stated story purpose`, "State what the angle must accomplish.", "Open Angle", "angle-output", segment.id);
      if (!segment.audienceTakeaway.trim()) add("takeaway", "Advisory", "Angle", `${prefix} has no audience takeaway`, "Record what viewers should understand when the segment ends.", "Open Angle", "angle-output", segment.id);
      if (!segment.angleLocation.trim()) add("location", "Important", "Angle", `${prefix} has no location`, "Set the in-ring, backstage, interview, or other TEW location.", "Open Angle", "angle-output", segment.id);
    }
  });

  const handoffRecord = findHandoffRecord(show.id, handoff);
  const version = findHandoffVersion(handoffRecord);
  if (!version) add("handoff-missing", "Advisory", "Handoff", "No finalized TEW handoff version exists", "Finalize after blocking and important creative issues are resolved.", "Open Handoff", "handoff");
  else if (new Date(version.show.sourceUpdatedAt).getTime() < new Date(show.updatedAt).getTime()) add("handoff-stale", "Important", "Handoff", "The finalized handoff is older than the current card", `Version ${version.versionNumber} predates the latest planned-show change.`, "Create New Version", "handoff");

  const transferRecord = findTransferRecord(show.id, transfer);
  const pkg = findTransferPackage(transferRecord);
  if (version && !pkg) add("transfer-missing", "Advisory", "Transfer", "No assisted TEW transfer package exists", "Generate the TEW-oriented package after finalizing the handoff.", "Open Transfer", "transfer");
  else if (pkg && new Date(pkg.generatedAt).getTime() < new Date(show.updatedAt).getTime()) add("transfer-stale", "Important", "Transfer", "The transfer package is older than the current card", "Regenerate it before continuing TEW entry.", "Regenerate Transfer", "transfer");

  const active = issues.filter((issue) => !issue.acknowledged);
  const blockingCount = active.filter((issue) => issue.severity === "Blocking").length;
  const importantCount = active.filter((issue) => issue.severity === "Important").length;
  const advisoryCount = active.filter((issue) => issue.severity === "Advisory").length;
  return {
    showId: show.id,
    generatedAt: new Date().toISOString(),
    score: Math.max(0, 100 - blockingCount * 18 - importantCount * 8 - advisoryCount * 2),
    blockingCount,
    importantCount,
    advisoryCount,
    acknowledgedCount: issues.filter((issue) => issue.acknowledged).length,
    issues,
  };
}

function completionCounts(show: PlannedShow): Pick<ShowOperationsSummary, "approachesComplete" | "approachesTotal" | "narrativesComplete" | "narrativesTotal"> {
  const matches = show.segments.filter((segment) => segment.type === "match");
  return {
    approachesComplete: matches.filter((segment) => segment.workers.length > 0 && segment.workers.every((worker) => segment.matchApproachSetup.workerPlans.some((plan) => normalize(plan.workerName) === normalize(worker.name) && plan.selectedApproachIds.length === approachLimitForSetup(segment.durationMinutes, segment.matchApproachSetup.approachLimit)))).length,
    approachesTotal: matches.length,
    narrativesComplete: show.segments.filter((segment) => segment.type === "match" ? Boolean(segment.matchStory.trim()) : Boolean(segment.segmentOutput.trim())).length,
    narrativesTotal: show.segments.length,
  };
}

export function buildShowOperationsSummary(show: PlannedShow, handoff: HandoffUniverse, transfer: TransferUniverse, preflight: ShowPreflightReport, snapshot: TewSnapshot | null): ShowOperationsSummary {
  const handoffRecord = findHandoffRecord(show.id, handoff);
  const version = findHandoffVersion(handoffRecord);
  const transferRecord = findTransferRecord(show.id, transfer);
  const pkg = findTransferPackage(transferRecord);
  const transferCompleted = transferRecord?.segmentProgress.filter((progress) => progress.completed).length ?? 0;
  const transferTotal = pkg?.segments.length ?? 0;
  const staleHandoff = Boolean(version && new Date(version.show.sourceUpdatedAt).getTime() < new Date(show.updatedAt).getTime());
  const staleTransfer = Boolean(pkg && new Date(pkg.generatedAt).getTime() < new Date(show.updatedAt).getTime());
  const actualCandidate = snapshot ? findActualShowCandidate(show, snapshot) : null;

  let stage: ShowOperationStage = "Draft";
  let stageDetail = "Resolve the card preflight before finalizing.";
  if (show.status === "Reconciled" && show.reconciliation) {
    stage = "Reconciled";
    stageDetail = "The permanent tracker history is linked to the actual TEW show.";
  } else if (show.reconciliation || (actualCandidate && actualCandidate.confidence >= 55)) {
    stage = "Reconciliation Needed";
    stageDetail = "A post-show TEW result is available for confirmation.";
  } else if (transferTotal > 0 && transferCompleted === transferTotal) {
    stage = "Awaiting Results";
    stageDetail = "The card is entered. Run the show in TEW, then import the updated snapshot.";
  } else if (handoffRecord?.status === "Entered in TEW" || handoffRecord?.status === "Completed") {
    stage = "Entered";
    stageDetail = "The handoff is marked entered in TEW.";
  } else if (pkg || handoffRecord?.status === "Entering in TEW") {
    stage = "Entering in TEW";
    stageDetail = `${transferCompleted} of ${transferTotal} transfer segments are complete.`;
  } else if (version && !staleHandoff) {
    stage = "Handoff Ready";
    stageDetail = `Handoff Version ${version.versionNumber} is frozen and current.`;
  } else if (preflight.blockingCount === 0 && preflight.importantCount === 0 && show.segments.length > 0) {
    stage = "Creative Ready";
    stageDetail = "The card has no unresolved blocking or important preflight issues.";
  }

  const nextIssue = preflight.issues.find((issue) => !issue.acknowledged && issue.severity === "Blocking")
    ?? preflight.issues.find((issue) => !issue.acknowledged && issue.severity === "Important")
    ?? preflight.issues.find((issue) => !issue.acknowledged && issue.severity === "Advisory");
  let nextAction = nextIssue?.message ?? "Review the show operations dashboard.";
  let nextActionTarget: PreflightActionTarget = nextIssue?.actionTarget ?? "show";
  let nextSegmentId = nextIssue?.segmentId ?? "";
  if (!nextIssue && stage === "Creative Ready") { nextAction = "Finalize the TEW handoff version."; nextActionTarget = "handoff"; }
  else if (!nextIssue && stage === "Handoff Ready") { nextAction = "Generate the assisted TEW transfer package."; nextActionTarget = "transfer"; }
  else if (!nextIssue && stage === "Entering in TEW") { nextAction = "Continue TEW entry from the last saved segment."; nextActionTarget = "transfer"; }
  else if (!nextIssue && (stage === "Entered" || stage === "Awaiting Results")) { nextAction = "Import the post-show TEW snapshot and analyze results."; nextActionTarget = "results"; }
  else if (!nextIssue && stage === "Reconciliation Needed") { nextAction = "Review and confirm the suggested TEW result links."; nextActionTarget = "results"; }

  return {
    showId: show.id,
    showName: show.name,
    stage,
    stageDetail,
    nextAction,
    nextActionTarget,
    nextSegmentId,
    plannedMinutes: plannedMinutes(show),
    expectedMinutes: show.expectedMinutes,
    matchCount: show.segments.filter((segment) => segment.type === "match").length,
    angleCount: show.segments.filter((segment) => segment.type === "angle").length,
    ...completionCounts(show),
    handoffVersion: version?.versionNumber ?? 0,
    transferCompleted,
    transferTotal,
    staleHandoff,
    staleTransfer,
  };
}

function scoreShow(planned: PlannedShow, actual: ShowRecord): { score: number; reasons: string[] } {
  let score = Math.round(similarity(planned.name, actual.name) * 50);
  const reasons: string[] = score >= 25 ? [`Show-name similarity +${score}`] : [];
  if (planned.date && actual.date && planned.date === actual.date) { score += 25; reasons.push("Exact show date +25"); }
  if (planned.company && actual.company && normalize(planned.company) === normalize(actual.company)) { score += 15; reasons.push("Company match +15"); }
  if (planned.venue && actual.venue && normalize(planned.venue) === normalize(actual.venue)) { score += 10; reasons.push("Venue match +10"); }
  return { score: Math.min(100, score), reasons };
}

export function findActualShowCandidate(show: PlannedShow, snapshot: TewSnapshot): { show: ShowRecord; confidence: number; reasons: string[] } | null {
  const best = snapshot.shows.map((actual) => ({ show: actual, ...scoreShow(show, actual) })).sort((left, right) => right.score - left.score)[0];
  return best && best.score > 0 ? { show: best.show, confidence: best.score, reasons: best.reasons } : null;
}

function participantSimilarity(segment: PlannedSegment, actual: MatchRecord): number {
  const planned = new Set(segment.workers.map((worker) => normalize(worker.name)).filter(Boolean));
  const observed = new Set(actual.workers.map((worker) => normalize(worker.name)).filter(Boolean));
  if (!planned.size || !observed.size) return 0;
  const intersection = [...planned].filter((name) => observed.has(name)).length;
  return intersection / new Set([...planned, ...observed]).size;
}

function scoreMatch(segment: PlannedSegment, actual: MatchRecord): { score: number; reasons: string[] } {
  let score = Math.round(participantSimilarity(segment, actual) * 55);
  const reasons: string[] = score ? [`Participant overlap +${score}`] : [];
  const titleScore = Math.round(similarity(segment.title, actual.description) * 20);
  score += titleScore;
  if (titleScore) reasons.push(`Description similarity +${titleScore}`);
  if (segment.section === actual.placement) { score += 10; reasons.push("Card section +10"); }
  const actualMinutes = parseMinutes(actual.matchTime);
  if (actualMinutes !== null) {
    const distance = Math.abs(actualMinutes - segment.durationMinutes);
    const durationScore = distance <= 1 ? 10 : distance <= 3 ? 7 : distance <= 5 ? 3 : 0;
    score += durationScore;
    if (durationScore) reasons.push(`Duration proximity +${durationScore}`);
  }
  if (segment.plannedWinner && actual.winner && normalize(segment.plannedWinner) === normalize(actual.winner)) { score += 5; reasons.push("Winner match +5"); }
  return { score: Math.min(100, score), reasons };
}

export function buildResultIntakeSession(show: PlannedShow, snapshot: TewSnapshot): ResultIntakeSession | null {
  const candidate = findActualShowCandidate(show, snapshot);
  if (!candidate) return null;
  const available = [...candidate.show.matches];
  const suggestions: ResultMatchSuggestion[] = [];
  show.segments.filter((segment) => segment.type === "match").forEach((segment) => {
    const best = available.map((actual) => ({ actual, ...scoreMatch(segment, actual) })).sort((left, right) => right.score - left.score)[0];
    if (!best) return;
    suggestions.push({
      plannedSegmentId: segment.id,
      plannedTitle: segment.title,
      actualMatchId: best.actual.id,
      actualDescription: best.actual.description,
      confidence: best.score,
      reasons: best.reasons,
      status: best.score >= 45 ? "Suggested" : "Rejected",
    });
    const usedIndex = available.findIndex((actual) => actual.id === best.actual.id);
    if (usedIndex >= 0) available.splice(usedIndex, 1);
  });
  return {
    id: createId("result-intake"),
    showId: show.id,
    createdAt: new Date().toISOString(),
    sourceFile: snapshot.fileName,
    actualShowId: candidate.show.id,
    actualShowName: candidate.show.name,
    showConfidence: candidate.confidence,
    showReasons: candidate.reasons,
    suggestions,
    appliedAt: "",
  };
}

function snapshotMatch(match: MatchRecord): ActualMatchSnapshot {
  return {
    id: match.id,
    description: match.description,
    rating: match.rating,
    winner: match.winner,
    matchTime: match.matchTime,
    notes: match.notes,
    placement: match.placement,
    workers: match.workers.map((worker) => worker.name),
  };
}

export function applyConfirmedResultLinks(show: PlannedShow, session: ResultIntakeSession, snapshot: TewSnapshot): PlannedShow {
  const actualShow = snapshot.shows.find((candidate) => candidate.id === session.actualShowId);
  if (!actualShow) throw new Error("The selected actual TEW show is no longer available in this snapshot.");
  const confirmed = session.suggestions.filter((suggestion) => suggestion.status === "Confirmed");
  const segments = show.segments.map((segment) => {
    const link = confirmed.find((suggestion) => suggestion.plannedSegmentId === segment.id);
    if (!link || segment.type !== "match") return segment;
    const actual = actualShow.matches.find((match) => match.id === link.actualMatchId);
    if (!actual) return segment;
    return {
      ...segment,
      workflowStatus: "Reconciled" as const,
      reconciliation: {
        ...segment.reconciliation,
        linkedMatchId: actual.id,
        actualMatch: snapshotMatch(actual),
        happenedAsPlanned: segment.plannedWinner && actual.winner ? normalize(segment.plannedWinner) === normalize(actual.winner) : null,
        actualRating: actual.rating,
        finalNarrative: segment.matchStory,
        changes: segment.plannedWinner && actual.winner && normalize(segment.plannedWinner) !== normalize(actual.winner) ? `Actual winner: ${actual.winner}` : "",
        actualConsequences: segment.consequences,
        finalFollowUp: segment.followUp,
        reconciledAt: new Date().toISOString(),
      },
    };
  });
  return {
    ...show,
    status: "Completed",
    updatedAt: new Date().toISOString(),
    segments,
    reconciliation: {
      linkedShowId: actualShow.id,
      actualShow: {
        id: actualShow.id,
        name: actualShow.name,
        date: actualShow.date,
        rating: actualShow.rating,
        attendance: actualShow.attendance,
        venue: actualShow.venue,
        company: actualShow.company,
        broadcast: actualShow.broadcast,
        sourceFile: snapshot.fileName,
      },
      linkedAt: new Date().toISOString(),
      completedAt: "",
      notes: `Phase 5C result intake applied ${confirmed.length} confirmed match link${confirmed.length === 1 ? "" : "s"}. Review angles and downstream updates before marking the show fully Reconciled.`,
    },
  };
}

export function createOperationsChangeNote(input: Omit<OperationsChangeNote, "id" | "createdAt">): OperationsChangeNote {
  return { ...input, id: createId("operations-change"), createdAt: new Date().toISOString() };
}
