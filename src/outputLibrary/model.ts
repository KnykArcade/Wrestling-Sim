import { MATCH_AIMS, MATCH_APPROACHES } from "../matchEngine/catalog";
import type { MatchApproachId } from "../matchEngine/types";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type { WorkbenchDraftRevision } from "../workbench/types";
import type {
  OutputComparisonRow,
  OutputLibraryItem,
  OutputLibraryUniverse,
  OutputLineageStage,
  OutputPackageField,
  OutputProductionPackage,
  OutputSegmentSnapshot,
  OutputSourceKind,
  OutputVersion,
  PhraseSourceAttribution,
  PlannedActualRow,
  PlannedVsActualReport,
  ReusableOutputStructure,
  ShowProductionPacket,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

function outputId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function approachName(id: MatchApproachId): string {
  return MATCH_APPROACHES.find((approach) => approach.id === id)?.name ?? id;
}

function matchAimName(id: OutputSegmentSnapshot["matchAimId"]): string {
  return MATCH_AIMS.find((aim) => aim.id === id)?.name ?? id;
}

function participantsLabel(snapshot: OutputSegmentSnapshot): string {
  return snapshot.workers.map((worker) => {
    const detail = [worker.side, worker.role].filter(Boolean).join(" / ");
    return detail ? `${worker.name} (${detail})` : worker.name;
  }).join(", ");
}

function approachLabel(snapshot: OutputSegmentSnapshot): string {
  return snapshot.approaches.map((plan) => `${plan.workerName}: ${plan.approachIds.map(approachName).join(", ") || "No approaches selected"}`).join("\n");
}

function actualSnapshot(segment: PlannedSegment): OutputSegmentSnapshot["actual"] {
  const reconciliation = segment.reconciliation;
  if (!reconciliation.actualMatch) return null;
  return {
    linkedMatchId: reconciliation.linkedMatchId,
    description: reconciliation.actualMatch.description,
    winner: reconciliation.actualMatch.winner,
    matchTime: reconciliation.actualMatch.matchTime,
    rating: reconciliation.actualRating ?? reconciliation.actualMatch.rating,
    notes: reconciliation.actualMatch.notes,
    happenedAsPlanned: reconciliation.happenedAsPlanned,
    finalNarrative: reconciliation.finalNarrative,
    changes: reconciliation.changes,
    actualConsequences: reconciliation.actualConsequences,
    finalFollowUp: reconciliation.finalFollowUp,
    reconciledAt: reconciliation.reconciledAt,
  };
}

export function snapshotOutputSegment(segment: PlannedSegment): OutputSegmentSnapshot {
  const preview = segment.matchApproachSetup.performancePreview;
  return {
    segmentId: segment.id,
    type: segment.type,
    section: segment.section,
    title: segment.title,
    durationMinutes: segment.durationMinutes,
    notes: segment.notes,
    workers: segment.workers.map((worker) => ({ ...worker })),
    storylines: segment.storylines.map((storyline) => ({ ...storyline })),
    purpose: segment.purpose,
    consequences: segment.consequences,
    followUp: segment.followUp,
    privateNotes: segment.privateNotes,

    matchType: segment.matchType,
    championship: segment.championship,
    championshipId: segment.championshipId,
    championshipStakes: segment.championshipStakes,
    plannedWinner: segment.plannedWinner,
    plannedFinish: segment.plannedFinish,
    matchStory: segment.matchStory,
    keyMoments: segment.keyMoments,
    interference: segment.interference,
    postMatch: segment.postMatch,
    matchAimId: segment.matchApproachSetup.matchAimId,
    approaches: segment.matchApproachSetup.workerPlans.map((plan) => ({
      workerKey: plan.workerKey,
      workerName: plan.workerName,
      approachIds: [...plan.selectedApproachIds],
    })),
    advisoryMatchScore: preview?.matchScore ?? null,
    advisoryStarRating: preview?.starRating ?? null,
    advisorySummary: preview?.summary ?? "",
    competitionId: segment.competitionId,
    competitionRoundLabel: segment.competitionRoundLabel,

    angleLocation: segment.angleLocation,
    angleContentType: segment.angleContentType,
    segmentOutput: segment.segmentOutput,
    audienceTakeaway: segment.audienceTakeaway,

    workflowStatus: segment.workflowStatus,
    actual: actualSnapshot(segment),
  };
}

function planSnapshot(segment: PlannedSegment): OutputSegmentSnapshot {
  const snapshot = snapshotOutputSegment(segment);
  return {
    ...snapshot,
    matchStory: "",
    keyMoments: "",
    segmentOutput: "",
    advisoryMatchScore: null,
    advisoryStarRating: null,
    advisorySummary: "",
    actual: null,
  };
}

export function sourceAttributionForSegment(segment: PlannedSegment): PhraseSourceAttribution[] {
  const selected = unique(segment.matchApproachSetup.workerPlans.flatMap((plan) => plan.selectedApproachIds));
  const attributions: PhraseSourceAttribution[] = selected.map((id) => {
    const approach = MATCH_APPROACHES.find((item) => item.id === id);
    const source = approach?.narrative ? "Canonical approach phrase library" as const : "Generic structural fallback" as const;
    return {
      id: `approach:${id}`,
      label: approach?.name ?? id,
      source,
      approachId: id,
      note: approach?.narrative
        ? "This approach has source wording from the uploaded canonical phrase library."
        : approach?.sourceNotes.join(" ") || "No canonical phrase row was supplied, so the package uses transparent structural wording.",
    };
  });
  const hasEnteredPlan = [
    segment.notes,
    segment.purpose,
    segment.consequences,
    segment.followUp,
    segment.matchStory,
    segment.segmentOutput,
    segment.keyMoments,
  ].some((value) => value.trim());
  if (hasEnteredPlan) {
    attributions.unshift({
      id: "entered-plan",
      label: "Entered creative plan",
      source: "Entered creative plan",
      approachId: "",
      note: "This material comes from the segment setup, written output, consequences, follow-up, or key moments entered in the companion.",
    });
  }
  return attributions;
}

function versionFromSnapshot(
  snapshot: OutputSegmentSnapshot,
  stage: OutputLineageStage,
  label: string,
  attribution: PhraseSourceAttribution[],
  createdAt = now(),
): OutputVersion {
  return {
    id: outputId("output-version"),
    stage,
    label: label.trim() || stage,
    createdAt,
    snapshot,
    sourceAttribution: attribution.map((item) => ({ ...item })),
  };
}

function snapshotFingerprint(snapshot: OutputSegmentSnapshot): string {
  return JSON.stringify(snapshot);
}

export function lineageStageForSegment(segment: PlannedSegment): OutputLineageStage {
  if (segment.reconciliation.actualMatch || segment.workflowStatus === "Reconciled") return "Reconciled Actual Version";
  if (segment.workflowStatus === "Entered in TEW" || segment.workflowStatus === "Completed") return "Entered in TEW Version";
  const output = segment.type === "match" ? segment.matchStory : segment.segmentOutput;
  return output.trim() || segment.keyMoments.trim() ? "Applied Output" : "Plan";
}

function fieldsText(title: string, fields: OutputPackageField[]): string {
  const available = fields.filter((field) => field.value.trim());
  if (available.length === 0) return "";
  return `${title}\n${available.map((field) => `${field.label}: ${field.value}`).join("\n")}`;
}

function approachDirection(segment: PlannedSegment): string {
  if (segment.type !== "match" || segment.matchApproachSetup.workerPlans.length === 0) return "";
  return segment.matchApproachSetup.workerPlans.map((plan) => {
    const approaches = plan.selectedApproachIds.map((id) => {
      const approach = MATCH_APPROACHES.find((item) => item.id === id);
      return approach ? `${approach.name} (pace ${approach.pace}, stamina ${approach.staminaCost})` : id;
    });
    return `${plan.workerName}: ${approaches.join(", ") || "No approaches selected"}`;
  }).join("\n");
}

function previewDirection(segment: PlannedSegment): string {
  const preview = segment.matchApproachSetup.performancePreview;
  if (!preview) return "";
  const workers = preview.workerResults.map((worker) => `${worker.workerName}: ${worker.staminaStatus}, ${worker.paceStatus}, ${worker.performanceScore.toFixed(1)} performance`).join("\n");
  return [`Advisory preview: ${preview.matchScore.toFixed(1)}/100 · ${preview.starRating}★`, preview.summary, workers].filter(Boolean).join("\n");
}

export function buildRoadAgentPackage(segment: PlannedSegment, showName = ""): OutputProductionPackage {
  const directTewFields: OutputPackageField[] = [
    { label: "Show", value: showName },
    { label: "Section", value: segment.section },
    { label: "Match", value: segment.title },
    { label: "Participants", value: segment.workers.map((worker) => `${worker.name}${worker.side ? ` — ${worker.side}` : ""}${worker.role ? ` (${worker.role})` : ""}`).join(", ") },
    { label: "Match type", value: segment.matchType },
    { label: "Duration", value: `${segment.durationMinutes} minutes` },
    { label: "Championship", value: segment.championship },
    { label: "Championship stakes", value: segment.championshipStakes },
    { label: "Competition", value: segment.competitionRoundLabel },
    { label: "Planned winner", value: segment.plannedWinner },
    { label: "Planned finish", value: segment.plannedFinish },
  ];
  const tewNotes: OutputPackageField[] = [
    { label: "Match Story", value: segment.matchStory },
    { label: "Key moments / road-agent map", value: segment.keyMoments },
    { label: "Interference", value: segment.interference },
    { label: "Post-match activity", value: segment.postMatch },
    { label: "Consequences", value: segment.consequences },
    { label: "Follow-up", value: segment.followUp },
  ];
  const companionOnly: OutputPackageField[] = [
    { label: "Match aim", value: matchAimName(segment.matchApproachSetup.matchAimId) },
    { label: "Selected approaches", value: approachDirection(segment) },
    { label: "Approach notes", value: segment.matchApproachSetup.notes },
    { label: "Advisory performance preview", value: previewDirection(segment) },
  ];
  const warnings = [
    segment.workers.length === 0 ? "No wrestlers are assigned." : "",
    !segment.matchType.trim() ? "Match type is missing." : "",
    !segment.matchStory.trim() ? "Match Story is missing." : "",
    segment.matchApproachSetup.workerPlans.length === 0 ? "No match approaches are selected." : "",
    !segment.plannedFinish.trim() ? "Planned finish is blank; TEW-authoritative matches may intentionally remain unresolved." : "",
  ].filter(Boolean);
  const conciseText = [
    fieldsText("DIRECT TEW FIELDS", directTewFields),
    fieldsText("TEW NOTES", tewNotes),
  ].filter(Boolean).join("\n\n");
  const fullText = [
    "ROAD-AGENT MATCH PACKAGE",
    conciseText,
    fieldsText("COMPANION-ONLY STRATEGY", companionOnly),
    warnings.length ? `WARNINGS\n${warnings.map((warning) => `- ${warning}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    id: outputId("road-agent-package"),
    kind: "Road-Agent Match Package",
    generatedAt: now(),
    directTewFields,
    tewNotes,
    companionOnly,
    warnings,
    conciseText,
    fullText,
  };
}

export function buildAngleProductionPackage(segment: PlannedSegment, showName = ""): OutputProductionPackage {
  const directTewFields: OutputPackageField[] = [
    { label: "Show", value: showName },
    { label: "Section", value: segment.section },
    { label: "Angle", value: segment.title },
    { label: "Participants and roles", value: segment.workers.map((worker) => `${worker.name}${worker.role ? ` — ${worker.role}` : ""}`).join(", ") },
    { label: "Duration", value: `${segment.durationMinutes} minutes` },
    { label: "Location", value: segment.angleLocation },
    { label: "Content type", value: segment.angleContentType },
  ];
  const tewNotes: OutputPackageField[] = [
    { label: "Segment Output", value: segment.segmentOutput },
    { label: "Story purpose", value: segment.purpose },
    { label: "Consequences", value: segment.consequences },
    { label: "Follow-up", value: segment.followUp },
    { label: "Audience takeaway", value: segment.audienceTakeaway },
  ];
  const companionOnly: OutputPackageField[] = [
    { label: "Creative outline", value: segment.notes },
    { label: "Private production notes", value: segment.privateNotes },
    { label: "Linked storylines", value: segment.storylines.map((storyline) => storyline.name).join(", ") },
  ];
  const warnings = [
    segment.workers.length === 0 ? "No angle participants are assigned." : "",
    !segment.segmentOutput.trim() ? "Angle Segment Output is missing." : "",
    !segment.purpose.trim() ? "Story purpose is missing." : "",
    !segment.angleLocation.trim() ? "Angle location is missing." : "",
  ].filter(Boolean);
  const conciseText = [
    fieldsText("DIRECT TEW FIELDS", directTewFields),
    fieldsText("TEW NOTES", tewNotes),
  ].filter(Boolean).join("\n\n");
  const fullText = [
    "ANGLE PRODUCTION PACKAGE",
    conciseText,
    fieldsText("COMPANION-ONLY PRODUCTION GUIDANCE", companionOnly),
    warnings.length ? `WARNINGS\n${warnings.map((warning) => `- ${warning}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    id: outputId("angle-package"),
    kind: "Angle Production Package",
    generatedAt: now(),
    directTewFields,
    tewNotes,
    companionOnly,
    warnings,
    conciseText,
    fullText,
  };
}

export function buildProductionPackage(segment: PlannedSegment, showName = ""): OutputProductionPackage {
  return segment.type === "match" ? buildRoadAgentPackage(segment, showName) : buildAngleProductionPackage(segment, showName);
}

function comparisonStatus(fromValue: string, toValue: string): OutputComparisonRow["status"] {
  if (fromValue === toValue) return "Same";
  if (!fromValue && toValue) return "Added";
  if (fromValue && !toValue) return "Removed";
  return "Changed";
}

export function compareOutputVersions(from: OutputVersion, to: OutputVersion): OutputComparisonRow[] {
  const values: Array<[string, string, string]> = [
    ["Title", from.snapshot.title, to.snapshot.title],
    ["Participants", participantsLabel(from.snapshot), participantsLabel(to.snapshot)],
    ["Duration", `${from.snapshot.durationMinutes} minutes`, `${to.snapshot.durationMinutes} minutes`],
    ["Winner", from.snapshot.plannedWinner, to.snapshot.plannedWinner],
    ["Finish", from.snapshot.plannedFinish, to.snapshot.plannedFinish],
    ["Match aim", matchAimName(from.snapshot.matchAimId), matchAimName(to.snapshot.matchAimId)],
    ["Approaches", approachLabel(from.snapshot), approachLabel(to.snapshot)],
    ["Match Story", from.snapshot.matchStory, to.snapshot.matchStory],
    ["Angle Output", from.snapshot.segmentOutput, to.snapshot.segmentOutput],
    ["Key moments", from.snapshot.keyMoments, to.snapshot.keyMoments],
    ["Consequences", from.snapshot.consequences, to.snapshot.consequences],
    ["Follow-up", from.snapshot.followUp, to.snapshot.followUp],
    ["Championship", from.snapshot.championship, to.snapshot.championship],
    ["Competition", from.snapshot.competitionRoundLabel, to.snapshot.competitionRoundLabel],
  ];
  return values.map(([field, fromValue, toValue]) => ({ field, fromValue, toValue, status: comparisonStatus(fromValue, toValue) }));
}

export function buildPlannedVsActualReport(segment: PlannedSegment): PlannedVsActualReport {
  const actual = segment.reconciliation.actualMatch;
  if (!actual) {
    return {
      generatedAt: now(),
      ready: false,
      summary: "No reconciled TEW match result is linked yet.",
      rows: [
        { field: "Winner", plannedValue: segment.plannedWinner, actualValue: "Awaiting TEW result", status: "Pending" },
        { field: "Duration", plannedValue: `${segment.durationMinutes} minutes`, actualValue: "Awaiting TEW result", status: "Pending" },
        { field: "TEW rating", plannedValue: segment.matchApproachSetup.performancePreview ? `${segment.matchApproachSetup.performancePreview.matchScore.toFixed(1)}/100 · ${segment.matchApproachSetup.performancePreview.starRating}★ advisory` : "No advisory preview", actualValue: "Awaiting TEW result", status: "Pending" },
      ],
    };
  }
  const rows: PlannedActualRow[] = [
    { field: "Winner", plannedValue: segment.plannedWinner || "Unresolved in plan", actualValue: actual.winner || "Not recorded", status: comparisonStatus(segment.plannedWinner, actual.winner) },
    { field: "Duration", plannedValue: `${segment.durationMinutes} minutes`, actualValue: actual.matchTime || "Not recorded", status: actual.matchTime ? "Changed" : "Pending" },
    { field: "Finish / result notes", plannedValue: segment.plannedFinish || "Unresolved in plan", actualValue: actual.notes || "No TEW notes recorded", status: comparisonStatus(segment.plannedFinish, actual.notes) },
    { field: "Match Story", plannedValue: segment.matchStory, actualValue: segment.reconciliation.finalNarrative || actual.description, status: comparisonStatus(segment.matchStory, segment.reconciliation.finalNarrative || actual.description) },
    { field: "Consequences", plannedValue: segment.consequences, actualValue: segment.reconciliation.actualConsequences, status: comparisonStatus(segment.consequences, segment.reconciliation.actualConsequences) },
    { field: "Follow-up", plannedValue: segment.followUp, actualValue: segment.reconciliation.finalFollowUp, status: comparisonStatus(segment.followUp, segment.reconciliation.finalFollowUp) },
    { field: "Rating", plannedValue: segment.matchApproachSetup.performancePreview ? `${segment.matchApproachSetup.performancePreview.matchScore.toFixed(1)}/100 · ${segment.matchApproachSetup.performancePreview.starRating}★ advisory` : "No advisory preview", actualValue: `${segment.reconciliation.actualRating ?? actual.rating ?? "Not recorded"}`, status: "Changed" },
  ];
  const changed = rows.filter((row) => row.status !== "Same").length;
  return {
    generatedAt: now(),
    ready: true,
    summary: segment.reconciliation.happenedAsPlanned === true
      ? `TEW result confirmed as broadly matching the plan; ${changed} comparison field${changed === 1 ? "" : "s"} still differ or require context.`
      : segment.reconciliation.happenedAsPlanned === false
        ? `TEW result was recorded as differing from the plan across ${changed} comparison field${changed === 1 ? "" : "s"}.`
        : `TEW result is linked. Review ${changed} changed or contextual field${changed === 1 ? "" : "s"}.`,
    rows,
  };
}

export function emptyOutputLibraryUniverse(): OutputLibraryUniverse {
  return {
    items: [],
    structures: [],
    showPackets: [],
    settings: {
      activeTab: "library",
      searchQuery: "",
      typeFilter: "All",
      sourceFilter: "All",
      selectedItemId: "",
      selectedShowId: "",
      compareFromVersionId: "",
      compareToVersionId: "",
    },
  };
}

export interface SaveOutputLibraryInput {
  segment: PlannedSegment;
  show?: PlannedShow | null;
  sourceKind: OutputSourceKind;
  quickSegmentId?: string;
  draftHistory?: WorkbenchDraftRevision[];
  stage?: OutputLineageStage;
  label?: string;
}

function itemSourceMatches(item: OutputLibraryItem, input: SaveOutputLibraryInput): boolean {
  if (input.sourceKind === "Quick Segment") return Boolean(input.quickSegmentId) && item.sourceQuickSegmentId === input.quickSegmentId;
  return Boolean(input.show) && item.sourceShowId === input.show?.id && item.sourceSegmentId === input.segment.id;
}

function itemMetadata(item: OutputLibraryItem, segment: PlannedSegment, show?: PlannedShow | null): OutputLibraryItem {
  const approachIds = unique(segment.matchApproachSetup.workerPlans.flatMap((plan) => plan.selectedApproachIds));
  return {
    ...item,
    sourceShowId: show?.id ?? item.sourceShowId,
    sourceShowName: show?.name ?? item.sourceShowName,
    sourceSegmentId: segment.id,
    type: segment.type,
    title: segment.title,
    participantNames: segment.workers.map((worker) => worker.name),
    storylineNames: segment.storylines.map((storyline) => storyline.name),
    championship: segment.championship,
    competitionRoundLabel: segment.competitionRoundLabel,
    matchAimId: segment.matchApproachSetup.matchAimId,
    approachIds,
    productionPackage: buildProductionPackage(segment, show?.name ?? item.sourceShowName),
    plannedVsActual: buildPlannedVsActualReport(segment),
    updatedAt: now(),
  };
}

export function saveSegmentToOutputLibrary(
  universe: OutputLibraryUniverse,
  input: SaveOutputLibraryInput,
): { universe: OutputLibraryUniverse; item: OutputLibraryItem; createdVersion: boolean } {
  const timestamp = now();
  const attribution = sourceAttributionForSegment(input.segment);
  const currentSnapshot = snapshotOutputSegment(input.segment);
  const stage = input.stage ?? lineageStageForSegment(input.segment);
  const existing = universe.items.find((item) => itemSourceMatches(item, input));

  if (!existing) {
    const versions: OutputVersion[] = [versionFromSnapshot(planSnapshot(input.segment), "Plan", "Original plan", attribution, timestamp)];
    for (const revision of [...(input.draftHistory ?? [])].reverse()) {
      const draftSnapshot = planSnapshot(input.segment);
      if (input.segment.type === "match") {
        draftSnapshot.matchStory = revision.fullOutput;
        draftSnapshot.keyMoments = revision.keyMoments;
      } else {
        draftSnapshot.segmentOutput = revision.fullOutput;
      }
      versions.push(versionFromSnapshot(draftSnapshot, "Generated Draft", revision.label, attribution, revision.createdAt || timestamp));
    }
    const planOnly = stage === "Plan" && snapshotFingerprint(versions[0].snapshot) === snapshotFingerprint(currentSnapshot);
    if (!planOnly) versions.push(versionFromSnapshot(currentSnapshot, stage, input.label || stage, attribution, timestamp));
    const currentVersion = versions.at(-1)!;
    const base: OutputLibraryItem = {
      id: outputId("output-item"),
      sourceKind: input.sourceKind,
      sourceQuickSegmentId: input.quickSegmentId ?? "",
      sourceShowId: input.show?.id ?? "",
      sourceShowName: input.show?.name ?? "",
      sourceSegmentId: input.segment.id,
      type: input.segment.type,
      title: input.segment.title,
      participantNames: [],
      storylineNames: [],
      championship: "",
      competitionRoundLabel: "",
      matchAimId: input.segment.matchApproachSetup.matchAimId,
      approachIds: [],
      versions,
      currentVersionId: currentVersion.id,
      productionPackage: buildProductionPackage(input.segment, input.show?.name ?? ""),
      plannedVsActual: buildPlannedVsActualReport(input.segment),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const item = itemMetadata(base, input.segment, input.show);
    const nextUniverse = {
      ...universe,
      items: [item, ...universe.items],
      settings: {
        ...universe.settings,
        selectedItemId: item.id,
        compareFromVersionId: item.versions[0]?.id ?? "",
        compareToVersionId: item.currentVersionId,
      },
    };
    return { universe: nextUniverse, item, createdVersion: versions.length > 1 };
  }

  const current = existing.versions.find((version) => version.id === existing.currentVersionId) ?? existing.versions.at(-1);
  const duplicate = current && current.stage === stage && snapshotFingerprint(current.snapshot) === snapshotFingerprint(currentSnapshot);
  const versions = duplicate
    ? existing.versions
    : [...existing.versions, versionFromSnapshot(currentSnapshot, stage, input.label || stage, attribution, timestamp)];
  const item = itemMetadata({
    ...existing,
    versions,
    currentVersionId: versions.at(-1)?.id ?? existing.currentVersionId,
  }, input.segment, input.show);
  return {
    universe: {
      ...universe,
      items: universe.items.map((candidate) => candidate.id === item.id ? item : candidate),
      settings: {
        ...universe.settings,
        selectedItemId: item.id,
        compareFromVersionId: universe.settings.compareFromVersionId || item.versions[0]?.id || "",
        compareToVersionId: item.currentVersionId,
      },
    },
    item,
    createdVersion: !duplicate,
  };
}

export function syncPlannedShowsToOutputLibrary(universe: OutputLibraryUniverse, shows: PlannedShow[]): OutputLibraryUniverse {
  let next = universe;
  for (const show of shows) {
    for (const segment of show.segments) {
      next = saveSegmentToOutputLibrary(next, { segment, show, sourceKind: "Planned Show" }).universe;
    }
  }
  return next;
}

export function restoreOutputVersion(segment: PlannedSegment, version: OutputVersion): PlannedSegment {
  const snapshot = version.snapshot;
  return {
    ...segment,
    title: snapshot.title,
    section: snapshot.section,
    durationMinutes: snapshot.durationMinutes,
    notes: snapshot.notes,
    workers: snapshot.workers.map((worker) => ({ ...worker })),
    storylines: snapshot.storylines.map((storyline) => ({ ...storyline })),
    purpose: snapshot.purpose,
    consequences: snapshot.consequences,
    followUp: snapshot.followUp,
    privateNotes: snapshot.privateNotes,
    matchType: snapshot.matchType,
    championship: snapshot.championship,
    championshipId: snapshot.championshipId,
    championshipStakes: snapshot.championshipStakes,
    plannedWinner: snapshot.plannedWinner,
    plannedFinish: snapshot.plannedFinish,
    matchStory: snapshot.matchStory,
    keyMoments: snapshot.keyMoments,
    interference: snapshot.interference,
    postMatch: snapshot.postMatch,
    competitionId: snapshot.competitionId,
    competitionRoundLabel: snapshot.competitionRoundLabel,
    angleLocation: snapshot.angleLocation,
    angleContentType: snapshot.angleContentType,
    segmentOutput: snapshot.segmentOutput,
    audienceTakeaway: snapshot.audienceTakeaway,
    matchApproachSetup: {
      ...segment.matchApproachSetup,
      matchAimId: snapshot.matchAimId,
      workerPlans: snapshot.approaches.map((plan) => {
        const existing = segment.matchApproachSetup.workerPlans.find((candidate) => candidate.workerKey === plan.workerKey);
        return {
          workerKey: plan.workerKey,
          workerName: plan.workerName,
          selectedApproachIds: [...plan.approachIds],
          lockedApproachIds: existing?.lockedApproachIds.filter((id) => plan.approachIds.includes(id)) ?? [],
          mode: existing?.mode ?? "Manual",
          generatedAt: "",
        };
      }),
      performancePreview: null,
      updatedAt: now(),
    },
  };
}

function sanitized(value: string, snapshot: OutputSegmentSnapshot): string {
  let result = value;
  const replacements = unique([
    ...snapshot.workers.map((worker) => worker.name),
    snapshot.plannedWinner,
    snapshot.championship,
  ].filter(Boolean)).sort((a, b) => b.length - a.length);
  for (const item of replacements) {
    const replacement = item === snapshot.championship ? "[Championship]" : item === snapshot.plannedWinner ? "[Planned Winner]" : "[Wrestler]";
    result = result.split(item).join(replacement);
  }
  return result;
}

export function createReusableOutputStructure(item: OutputLibraryItem, name: string): ReusableOutputStructure {
  const version = item.versions.find((candidate) => candidate.id === item.currentVersionId) ?? item.versions.at(-1)!;
  const snapshot = version.snapshot;
  const timestamp = now();
  return {
    id: outputId("output-structure"),
    name: name.trim() || `${snapshot.title || (snapshot.type === "match" ? "Match" : "Angle")} Structure`,
    type: snapshot.type,
    summary: snapshot.type === "match"
      ? "Reusable match construction with wrestler names, winner, championship, dialogue, and specific storyline outcomes removed."
      : "Reusable angle production structure with wrestler names, dialogue, and specific storyline outcomes removed.",
    durationMinutes: snapshot.durationMinutes,
    matchType: snapshot.type === "match" ? snapshot.matchType : "",
    matchAimId: snapshot.matchAimId,
    angleLocation: snapshot.type === "angle" ? snapshot.angleLocation : "",
    angleContentType: snapshot.type === "angle" ? snapshot.angleContentType : "",
    purpose: sanitized(snapshot.purpose, snapshot),
    notes: sanitized(snapshot.notes, snapshot),
    requiredSections: snapshot.type === "match"
      ? ["Opening", "Middle", "Turning point", "Finish", "Aftermath", "Key moments / road-agent map"]
      : ["Participants and roles", "Required beats", "Consequences", "Follow-up", "Audience takeaway"],
    sourceItemId: item.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildShowProductionPacket(show: PlannedShow, items: OutputLibraryItem[]): ShowProductionPacket {
  const warnings: string[] = [];
  const packages = show.segments.map((segment, index) => {
    const item = items.find((candidate) => candidate.sourceShowId === show.id && candidate.sourceSegmentId === segment.id);
    if (!item) warnings.push(`Segment ${index + 1} (${segment.title}) has not been saved to the Output Library.`);
    if (segment.workers.length === 0) warnings.push(`Segment ${index + 1} (${segment.title}) has no participants.`);
    if (segment.type === "match" && !segment.matchStory.trim()) warnings.push(`Segment ${index + 1} (${segment.title}) has no Match Story.`);
    if (segment.type === "angle" && !segment.segmentOutput.trim()) warnings.push(`Segment ${index + 1} (${segment.title}) has no Angle Segment Output.`);
    return { index, segment, item, package: buildProductionPackage(segment, show.name) };
  });
  const header = [
    `SHOW-WIDE PRODUCTION PACKET: ${show.name}`,
    `Date: ${show.date || "Unscheduled"}`,
    `Company: ${show.company || "Not entered"}`,
    `Venue: ${show.venue || "Not entered"}`,
    `Running time target: ${show.expectedMinutes} minutes`,
    `Segments: ${show.segments.length}`,
  ].join("\n");
  const textValue = [
    header,
    packages.map(({ index, segment, package: productionPackage }) => `#${index + 1} · ${segment.section} · ${segment.title}\n${productionPackage.fullText}`).join("\n\n---\n\n"),
    warnings.length ? `SHOW PACKET WARNINGS\n${warnings.map((warning) => `- ${warning}`).join("\n")}` : "SHOW PACKET WARNINGS\nNone.",
    "POST-SHOW CHECKLIST\n- Import the updated read-only TEW snapshot.\n- Link the completed show and matches.\n- Confirm championship and competition changes.\n- Review planned-versus-actual reports.\n- Preserve final Match Stories and Angle Outputs in permanent history.",
  ].filter(Boolean).join("\n\n");
  const packet = {
    id: outputId("show-production-packet"),
    showId: show.id,
    showName: show.name,
    generatedAt: now(),
    segmentCount: show.segments.length,
    matchCount: show.segments.filter((segment) => segment.type === "match").length,
    angleCount: show.segments.filter((segment) => segment.type === "angle").length,
    warnings,
    segmentItemIds: packages.map(({ item }) => item?.id ?? "").filter(Boolean),
    text: textValue,
    json: "",
  } satisfies ShowProductionPacket;
  return {
    ...packet,
    json: JSON.stringify({
      show: {
        id: show.id,
        name: show.name,
        date: show.date,
        company: show.company,
        venue: show.venue,
        expectedMinutes: show.expectedMinutes,
      },
      generatedAt: packet.generatedAt,
      warnings,
      segments: packages.map(({ index, segment, item, package: productionPackage }) => ({
        order: index + 1,
        id: segment.id,
        title: segment.title,
        type: segment.type,
        section: segment.section,
        outputLibraryItemId: item?.id ?? "",
        package: productionPackage,
      })),
    }, null, 2),
  };
}
