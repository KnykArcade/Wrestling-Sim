import type { HandoffUniverse, HandoffVersion, ShowHandoffRecord } from "../handoff/types";
import { MATCH_AIMS, MATCH_APPROACHES } from "../matchEngine/catalog";
import { approachSlotsForDuration, evaluatePace } from "../matchEngine/model";
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

function id(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalized(value).split(" ").filter((token) => token.length > 1));
}

function tokenSimilarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function parseMinutes(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function totalMinutes(show: PlannedShow): number {
  return show.segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
}

function handoffRecord(showId: string, universe: HandoffUniverse): ShowHandoffRecord | null {
  return universe.records.find((record) => record.showId === showId) ?? null;
}

function activeHandoffVersion(record: ShowHandoffRecord | null): HandoffVersion | null {
  if (!record) return null;
  return record.versions.find((version) => version.id === record.activeVersionId) ?? record.versions.at(-1) ?? null;
}

function transferRecord(showId: string, universe: TransferUniverse): TransferRecord | null {
  return universe.records.find((record) => record.showId === showId) ?? null;
}

function activeTransferPackage(record: TransferRecord | null): TransferPackage | null {
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

function preflightIssue(
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
  const issueId = `${show.id}:${segmentId || "show"}:${suffix}`;
  return { id: issueId, severity, category, message, detail, segmentId, actionLabel, actionTarget, acknowledged: acknowledged.has(issueId) };
}

function averageApproachPace(segment: PlannedSegment): number {
  const ids = segment.matchApproachSetup.workerPlans.flatMap((plan) => plan.selectedApproachIds);
  if (ids.length === 0) return 0;
  const values = ids.map((approachId) => MATCH_APPROACHES.find((approach) => approach.id === approachId)?.pace ?? 0);
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function selectedStamina(segment: PlannedSegment, workerKey: string): number {
  const plan = segment.matchApproachSetup.workerPlans.find((item) => item.workerKey === workerKey);
  return plan?.selectedApproachIds.reduce((sum, approachId) => sum + (MATCH_APPROACHES.find((approach) => approach.id === approachId)?.staminaCost ?? 0), 0) ?? 0;
}

export function buildShowPreflight(
  show: PlannedShow,
  handoff: HandoffUniverse,
  transfer: TransferUniverse,
  acknowledgedIssueIds: string[] = [],
): ShowPreflightReport {
  const acknowledged = new Set(acknowledgedIssueIds);
  const issues: ShowPreflightIssue[] = [];
  const add = (...args: Parameters<typeof preflightIssue> extends [PlannedShow, Set<string>, ...infer Rest] ? Rest : never) => issues.push(preflightIssue(show, acknowledged, ...args));

  if (!show.name.trim() || /^untitled show/i.test(show.name)) add("show-name", "Blocking", "Show", "Show name is not final", "Set the exact event or television-show name that will be used in TEW.", "Open Show", "show");
  if (!show.date.trim()) add("show-date", "Blocking", "Show", "Show date is missing", "A date is required for TEW entry and post-show matching.", "Open Show", "show");
  if (!show.company.trim()) add("show-company", "Important", "Show", "Company is missing", "Set the TEW company so worker, championship, and storyline mappings remain clear.", "Open Show", "show");
  if (!show.showType.trim()) add("show-type", "Important", "Show", "Event type is missing", "Choose television, event, tour, or the appropriate tracker label.", "Open Show", "show");
  if (!show.venue.trim()) add("show-venue", "Advisory", "Show", "Venue is not set", "The card can continue, but venue information improves transfer and result matching.", "Open Show", "show");
  if (show.segments.length === 0) add("empty-card", "Blocking", "Card", "The card has no segments", "Add at least one match or angle before finalization.", "Open Show", "show");

  const minutes = totalMinutes(show);
  const difference = Math.abs(minutes - show.expectedMinutes);
  const ratio = show.expectedMinutes > 0 ? difference / show.expectedMinutes : 0;
  if (ratio >= 0.25) add("runtime-major", "Important", "Card", "Card runtime is far from the target", `${minutes} planned minutes versus ${show.expectedMinutes} expected minutes.`, "Review Card", "show");
  else if (ratio >= 0.1) add("runtime-minor", "Advisory", "Card", "Card runtime differs from the target", `${minutes} planned minutes versus ${show.expectedMinutes} expected minutes.`, "Review Card", "show");

  const workerBookings = new Map<string, PlannedSegment[]>();
  show.segments.forEach((segment) => segment.workers.forEach((worker) => {
    const key = normalized(worker.name);
    if (!key) return;
    workerBookings.set(key, [...(workerBookings.get(key) ?? []), segment]);
  }));
  workerBookings.forEach((segments, workerName) => {
    const matchCount = segments.filter((segment) => segment.type === "match").length;
    if (matchCount > 1) add(`double-booked-${workerName}`, "Important", "Card", `${segments[0]?.workers.find((worker) => normalized(worker.name) === workerName)?.name || workerName} is booked in multiple matches`, `${matchCount} matches use this worker. Acknowledge deliberate tournament or storyline double duty.`, "Review First Match", "show", segments[0]?.id ?? "");
  });

  show.segments.forEach((segment, index) => {
    const prefix = `Segment ${index + 1}: ${segment.title || (segment.type === "match" ? "Untitled Match" : "Untitled Angle")}`;
    if (!segment.title.trim() || /^untitled/i.test(segment.title)) add("title", "Blocking", segment.type === "match" ? "Match" : "Angle", `${prefix} needs a final title`, "Name the segment so it can be identified during TEW entry and reconciliation.", "Open Segment", "show", segment.id);
    if (segment.durationMinutes <= 0) add("duration", "Blocking", segment.type === "match" ? "Match" : "Angle", `${prefix} has no valid duration`, "Set a positive planned duration.", "Open Segment", "show", segment.id);
    if (segment.workers.length === 0) add("workers", "Blocking", segment.type === "match" ? "Match" : "Angle", `${prefix} has no participants`, "Add the workers or teams involved.", "Open Segment", "show", segment.id);
    if (segment.workers.some((worker) => !worker.role.trim())) add("roles", "Important", segment.type === "match" ? "Match" : "Angle", `${prefix} has participants without roles`, "Assign competitor, manager, speaker, target, or another clear role.", "Open Segment", "show", segment.id);

    if (segment.type === "match") {
      if (!segment.matchType.trim()) add("match-type", "Blocking", "Match", `${prefix} is missing its match type`, "Set the TEW match type before handoff.", "Open Match", "match-setup", segment.id);
      const authority = segment.matchApproachSetup.performanceSettings.authority;
      if (authority === "booker-selected" && !segment.plannedWinner.trim()) add("winner", "Blocking", "Match", `${prefix} needs a booked winner`, "Booker-selected mode requires a planned winner.", "Open Match", "match-setup", segment.id);
      if (authority === "booker-selected" && !segment.plannedFinish.trim()) add("finish", "Important", "Match", `${prefix} needs a planned finish`, "Set the finish that should be entered in TEW.", "Open Match", "match-story", segment.id);
      if (!segment.matchStory.trim()) add("story", "Important", "Match", `${prefix} has no Match Story`, "Generate or write the opening, middle, turning point, finish, and aftermath.", "Open Match Story", "match-story", segment.id);

      const requiredSlots = approachSlotsForDuration(segment.durationMinutes);
      segment.workers.forEach((worker) => {
        const workerKey = `${worker.source}:${worker.id}`;
        const plan = segment.matchApproachSetup.workerPlans.find((item) => item.workerKey === workerKey || normalized(item.workerName) === normalized(worker.name));
        if (!plan || plan.selectedApproachIds.length === 0) add(`approach-${workerKey}`, "Important", "Match", `${worker.name} has no selected approach in ${prefix}`, `${requiredSlots} approach slot${requiredSlots === 1 ? " is" : "s are"} available at ${segment.durationMinutes} minutes.`, "Open Match Setup", "match-setup", segment.id);
        else if (plan.selectedApproachIds.length !== requiredSlots) add(`approach-count-${workerKey}`, "Important", "Match", `${worker.name} has the wrong number of approaches in ${prefix}`, `${plan.selectedApproachIds.length} selected; ${requiredSlots} required by the approved duration rule.`, "Open Match Setup", "match-setup", segment.id);
        if (selectedStamina(segment, plan?.workerKey ?? workerKey) > 9) add(`stamina-${workerKey}`, "Important", "Match", `${worker.name} exceeds the maximum approach stamina budget in ${prefix}`, "Reduce high-cost approaches or deliberately acknowledge the fatigue risk.", "Open Match Setup", "match-setup", segment.id);
      });

      const aim = MATCH_AIMS.find((item) => item.id === segment.matchApproachSetup.matchAimId);
      const actualPace = averageApproachPace(segment);
      if (aim && actualPace > 0) {
        const pace = evaluatePace(aim.idealPace, actualPace);
        if (pace.modifier <= -10) add("pace-conflict", "Important", "Match", `${prefix} has a major pace conflict`, `${aim.name} expects pace ${aim.idealPace}; selected approaches average ${actualPace} (${pace.status}).`, "Open Match Setup", "match-setup", segment.id);
        else if (pace.modifier < 0) add("pace-warning", "Advisory", "Match", `${prefix} is slightly off its intended pace`, `${aim.name} expects pace ${aim.idealPace}; selected approaches average ${actualPace}.`, "Open Match Setup", "match-setup", segment.id);
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

  const record = handoffRecord(show.id, handoff);
  const version = activeHandoffVersion(record);
  if (!version) add("handoff-missing", "Advisory", "Handoff", "No finalized TEW handoff version exists", "Finalize only after blocking and important creative issues are resolved.", "Open Handoff", "handoff");
  else if (new Date(version.show.sourceUpdatedAt).getTime() < new Date(show.updatedAt).getTime()) add("handoff-stale", "Important", "Handoff", "The finalized handoff is older than the current card", `Version ${version.versionNumber} was created before the latest planned-show change.`, "Create New Version", "handoff");

  const transferRec = transferRecord(show.id, transfer);
  const pkg = activeTransferPackage(transferRec);
  if (version && !pkg) add("transfer-missing", "Advisory", "Transfer", "No assisted TEW transfer package exists", "Generate the TEW-oriented package after finalizing the handoff.", "Open Transfer", "transfer");
  else if (pkg && new Date(pkg.generatedAt).getTime() < new Date(show.updatedAt).getTime()) add("transfer-stale", "Important", "Transfer", "The transfer package is older than the current card", "Regenerate it before continuing TEW entry.", "Regenerate Transfer", "transfer");

  const activeIssues = issues.filter((issue) => !issue.acknowledged);
  const blockingCount = activeIssues.filter((issue) => issue.severity === "Blocking").length;
  const importantCount = activeIssues.filter((issue) => issue.severity === "Important").length;
  const advisoryCount = activeIssues.filter((issue) => issue.severity === "Advisory").length;
  const score = Math.max(0, 100 - blockingCount * 18 - importantCount * 8 - advisoryCount * 2);
  return { showId: show.id, generatedAt: new Date().toISOString(), score, blockingCount, importantCount, advisoryCount, acknowledgedCount: issues.filter((issue) => issue.acknowledged).length, issues };
}

function completionCounts(show: PlannedShow): Pick<ShowOperationsSummary, "approachesComplete" | "approachesTotal" | "narrativesComplete" | "narrativesTotal"> {
  const matches = show.segments.filter((segment) => segment.type === "match");
  const approachesComplete = matches.filter((segment) => segment.workers.length > 0 && segment.workers.every((worker) => segment.matchApproachSetup.workerPlans.some((plan) => normalized(plan.workerName) === normalized(worker.name) && plan.selectedApproachIds.length === approachSlotsForDuration(segment.durationMinutes)))).length;
  const narrativesComplete = show.segments.filter((segment) => segment.type === "match" ? Boolean(segment.matchStory.trim()) : Boolean(segment.segmentOutput.trim())).length;
  return { approachesComplete, approachesTotal: matches.length, narrativesComplete, narrativesTotal: show.segments.length };
}

export function buildShowOperationsSummary(
  show: PlannedShow,
  handoff: HandoffUniverse,
  transfer: TransferUniverse,
  preflight: ShowPreflightReport,
  snapshot: TewSnapshot | null,
): ShowOperationsSummary {
  const handoffRec = handoffRecord(show.id, handoff);
  const version = activeHandoffVersion(handoffRec);
  const transferRec = transferRecord(show.id, transfer);
  const pkg = activeTransferPackage(transferRec);
  const transferCompleted = transferRec?.segmentProgress.filter((progress) => progress.completed).length ?? 0;
  const transferTotal = pkg?.segments.length ?? 0;
  const staleHandoff = Boolean(version && new Date(version.show.sourceUpdatedAt).getTime() < new Date(show.updatedAt).getTime());
  const staleTransfer = Boolean(pkg && new Date(pkg.generatedAt).getTime() < new Date(show.updatedAt).getTime());
  const counts = completionCounts(show);
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
  } else if (handoffRec?.status === "Entered in TEW" || handoffRec?.status === "Completed") {
    stage = "Entered";
    stageDetail = "The handoff is marked entered in TEW.";
  } else if (pkg || handoffRec?.status === "Entering in TEW") {
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
    plannedMinutes: totalMinutes(show),
    expectedMinutes: show.expectedMinutes,
    matchCount: show.segments.filter((segment) => segment.type === "match").length,
    angleCount: show.segments.filter((segment) => segment.type === "angle").length,
    ...counts,
    handoffVersion: version?.versionNumber ?? 0,
    transferCompleted,
    transferTotal,
    staleHandoff,
    staleTransfer,
  };
}

function showCandidateScore(planned: PlannedShow, actual: ShowRecord): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const nameScore = Math.round(tokenSimilarity(planned.name, actual.name) * 50);
  score += nameScore;
  if (nameScore >= 25) reasons.push(`Show-name similarity +${nameScore}`);
  if (planned.date && actual.date && planned.date === actual.date) { score += 25; reasons.push("Exact show date +25"); }
  if (planned.company && actual.company && normalized(planned.company) === normalized(actual.company)) { score += 15; reasons.push("Company match +15"); }
  if (planned.venue && actual.venue && normalized(planned.venue) === normalized(actual.venue)) { score += 10; reasons.push("Venue match +10"); }
  return { score: Math.min(100, score), reasons };
}

export function findActualShowCandidate(show: PlannedShow, snapshot: TewSnapshot): { show: ShowRecord; confidence: number; reasons: string[] } | null {
  const ranked = snapshot.shows.map((actual) => ({ show: actual, ...showCandidateScore(show, actual) })).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  return best && best.score > 0 ? { show: best.show, confidence: best.score, reasons: best.reasons } : null;
}

function participantScore(segment: PlannedSegment, actual: MatchRecord): number {
  const planned = new Set(segment.workers.map((worker) => normalized(worker.name)).filter(Boolean));
  const observed = new Set(actual.workers.map((worker) => normalized(worker.name)).filter(Boolean));
  if (planned.size === 0 || observed.size === 0) return 0;
  const intersection = [...planned].filter((name) => observed.has(name)).length;
  const union = new Set([...planned, ...observed]).size;
  return union ? intersection / union : 0;
}

function matchSuggestion(segment: PlannedSegment, actual: MatchRecord): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const participants = Math.round(participantScore(segment, actual) * 55);
  score += participants;
  if (participants) reasons.push(`Participant overlap +${participants}`);
  const title = Math.round(tokenSimilarity(segment.title, actual.description) * 20);
  score += title;
  if (title) reasons.push(`Description similarity +${title}`);
  if (segment.section === actual.placement) { score += 10; reasons.push("Card section +10"); }
  const actualMinutes = parseMinutes(actual.matchTime);
  if (actualMinutes !== null) {
    const distance = Math.abs(actualMinutes - segment.durationMinutes);
    const durationScore = distance <= 1 ? 10 : distance <= 3 ? 7 : distance <= 5 ? 3 : 0;
    score += durationScore;
    if (durationScore) reasons.push(`Duration proximity +${durationScore}`);
  }
  if (segment.plannedWinner && actual.winner && normalized(segment.plannedWinner) === normalized(actual.winner)) { score += 5; reasons.push("Winner match +5"); }
  return { score: Math.min(100, score), reasons };
}

export function buildResultIntakeSession(show: PlannedShow, snapshot: TewSnapshot): ResultIntakeSession | null {
  const candidate = findActualShowCandidate(show, snapshot);
  if (!candidate) return null;
  const available = [...candidate.show.matches];
  const suggestions: ResultMatchSuggestion[] = [];
  show.segments.filter((segment) => segment.type === "match").forEach((segment) => {
    const ranked = available.map((actual) => ({ actual, ...matchSuggestion(segment, actual) })).sort((left, right) => right.score - left.score);
    const best = ranked[0];
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
    const index = available.findIndex((actual) => actual.id === best.actual.id);
    if (index >= 0) available.splice(index, 1);
  });
  return {
    id: id("result-intake"),
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

function actualMatchSnapshot(match: MatchRecord): ActualMatchSnapshot {
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
  const actualShow = snapshot.shows.find((item) => item.id === session.actualShowId);
  if (!actualShow) throw new Error("The selected actual TEW show is no longer available in this snapshot.");
  const confirmed = session.suggestions.filter((suggestion) => suggestion.status === "Confirmed");
  const segments = show.segments.map((segment) => {
    const suggestion = confirmed.find((item) => item.plannedSegmentId === segment.id);
    if (!suggestion || segment.type !== "match") return segment;
    const actual = actualShow.matches.find((match) => match.id === suggestion.actualMatchId);
    if (!actual) return segment;
    return {
      ...segment,
      workflowStatus: "Reconciled" as const,
      reconciliation: {
        ...segment.reconciliation,
        linkedMatchId: actual.id,
        actualMatch: actualMatchSnapshot(actual),
        happenedAsPlanned: segment.plannedWinner && actual.winner ? normalized(segment.plannedWinner) === normalized(actual.winner) : null,
        actualRating: actual.rating,
        finalNarrative: segment.matchStory,
        changes: segment.plannedWinner && actual.winner && normalized(segment.plannedWinner) !== normalized(actual.winner) ? `Actual winner: ${actual.winner}` : "",
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
  return { ...input, id: id("operations-change"), createdAt: new Date().toISOString() };
}
