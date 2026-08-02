import type { BridgeFieldMapping, BridgeMappingVerificationStage } from "../bridge/types";
import { MATCH_AIMS, MATCH_APPROACHES } from "../matchEngine/catalog";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type {
  TransferAuditLog,
  TransferDestination,
  TransferField,
  TransferPackage,
  TransferRecord,
  TransferSegmentProgress,
  TransferSegmentTranslation,
  TransferUniverse,
} from "./types";

function createId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mappingStage(mapping: BridgeFieldMapping | undefined): BridgeMappingVerificationStage | "Manual" {
  if (!mapping) return "Manual";
  if (mapping.verificationStage) return mapping.verificationStage;
  if (mapping.status === "Verified") return "Verified";
  if (mapping.status === "Unsupported") return "Unsupported";
  return "Candidate";
}

function mappingFor(mappings: BridgeFieldMapping[], category: BridgeFieldMapping["category"], field: string): BridgeFieldMapping | undefined {
  return mappings.find((mapping) => mapping.category === category && mapping.trackerField === field);
}

function transferField(
  mappings: BridgeFieldMapping[],
  category: BridgeFieldMapping["category"],
  key: string,
  label: string,
  value: string,
  destination: TransferDestination,
  required: boolean,
  guidance: string,
): TransferField {
  const mapping = mappingFor(mappings, category, key);
  return {
    key,
    label,
    value,
    destination,
    required,
    mappingStage: mappingStage(mapping),
    mappingTarget: mapping?.tewTable && mapping.tewField ? `${mapping.tewTable}.${mapping.tewField}` : "Manual TEW entry",
    guidance,
  };
}

function workerText(segment: PlannedSegment): string {
  return segment.workers.map((worker) => `${worker.name}${worker.role ? ` — ${worker.role}` : ""}${worker.side ? ` (${worker.side})` : ""}`).join("\n");
}

function storylineText(segment: PlannedSegment): string {
  return segment.storylines.map((storyline) => storyline.name).join(", ");
}

function approachPlanText(segment: PlannedSegment): string {
  const aim = MATCH_AIMS.find((item) => item.id === segment.matchApproachSetup.matchAimId);
  const lines = [`Match aim: ${aim?.name ?? segment.matchApproachSetup.matchAimId}`, `Ideal pace: ${aim?.idealPace ?? "Open"}`];
  for (const plan of segment.matchApproachSetup.workerPlans) {
    const approaches = plan.selectedApproachIds.map((approachId) => MATCH_APPROACHES.find((item) => item.id === approachId)).filter(Boolean);
    lines.push(`${plan.workerName}: ${approaches.map((approach) => `${approach!.name} (pace ${approach!.pace}, stamina ${approach!.staminaCost})`).join(", ") || "No approaches selected"}`);
  }
  if (segment.matchApproachSetup.notes.trim()) lines.push(`Approach notes: ${segment.matchApproachSetup.notes.trim()}`);
  return lines.join("\n");
}

function performancePreviewText(segment: PlannedSegment): string {
  const preview = segment.matchApproachSetup.performancePreview;
  if (!preview) return "No tracker advisory preview generated.";
  const workers = preview.workerResults.map((worker) => `${worker.workerName}: ${worker.mentalStateName}, ${worker.staminaStatus}, ${worker.performanceScore.toFixed(1)} performance`).join("\n");
  return [
    `Tracker advisory preview: ${preview.matchScore.toFixed(1)}/100 · ${preview.starRating} stars`,
    preview.summary,
    workers,
    "This preview is companion-only. TEW remains authoritative for the real result and rating.",
  ].filter(Boolean).join("\n");
}

function matchNotes(segment: PlannedSegment): string {
  return [
    segment.purpose && `Creative purpose: ${segment.purpose}`,
    approachPlanText(segment),
    segment.matchStory && `Match Story:\n${segment.matchStory}`,
    segment.keyMoments && `Key moments:\n${segment.keyMoments}`,
    segment.interference && `Interference:\n${segment.interference}`,
    segment.postMatch && `Post-match:\n${segment.postMatch}`,
    segment.consequences && `Consequences:\n${segment.consequences}`,
    segment.followUp && `Follow-up:\n${segment.followUp}`,
    segment.privateNotes && `Private road-agent notes:\n${segment.privateNotes}`,
  ].filter(Boolean).join("\n\n");
}

function angleNotes(segment: PlannedSegment): string {
  return [
    segment.purpose && `Story purpose: ${segment.purpose}`,
    segment.segmentOutput && `Segment Output:\n${segment.segmentOutput}`,
    segment.audienceTakeaway && `Audience takeaway:\n${segment.audienceTakeaway}`,
    segment.consequences && `Consequences:\n${segment.consequences}`,
    segment.followUp && `Follow-up:\n${segment.followUp}`,
    segment.privateNotes && `Private production notes:\n${segment.privateNotes}`,
  ].filter(Boolean).join("\n\n");
}

function buildMatchTranslation(segment: PlannedSegment, order: number, mappings: BridgeFieldMapping[]): TransferSegmentTranslation {
  const directFields: TransferField[] = [
    transferField(mappings, "Match", "title", "Segment title", segment.title, "Direct TEW Field", true, "Use as the working segment label while entering the match."),
    transferField(mappings, "Match", "durationMinutes", "Duration", String(segment.durationMinutes), "Direct TEW Field", true, "Enter the planned match time in TEW."),
    transferField(mappings, "Match", "workers", "Participants and sides", workerText(segment), "Direct TEW Field", true, "Assign every competitor, manager, and role exactly as listed."),
    transferField(mappings, "Match", "matchType", "Match type", segment.matchType, "Direct TEW Field", true, "Choose the nearest verified TEW match type."),
    transferField(mappings, "Match", "plannedWinner", "Winner", segment.plannedWinner, "Direct TEW Field", false, "Leave TEW authoritative when no winner is booked in the tracker."),
    transferField(mappings, "Match", "plannedFinish", "Finish", segment.plannedFinish, "Direct TEW Field", false, "Use the booked finish or leave unresolved for TEW-authoritative play."),
    transferField(mappings, "Match", "championship", "Championship", segment.championship, "Direct TEW Field", false, "Assign the title and stakes when this is a championship match."),
    transferField(mappings, "Match", "storylines", "Storylines", storylineText(segment), "Direct TEW Field", false, "Attach the matching TEW storyline records."),
  ];
  const tewNotes = [
    transferField(mappings, "Match", "matchStory", "Road-agent and Match Story notes", matchNotes(segment), "TEW Notes", false, "Paste into the most appropriate TEW notes or road-agent area. Preserve the full version in the tracker."),
  ];
  const companionOnly = [
    transferField(mappings, "Match", "approaches", "Selected approach plan", approachPlanText(segment), "Companion Only", false, "TEW does not directly represent the custom approach system; use it to guide booking and notes."),
    transferField(mappings, "Match", "performancePreview", "Advisory performance preview", performancePreviewText(segment), "Companion Only", false, "Never treat this advisory preview as the official TEW result."),
  ];
  const completeEntryText = [
    `${order}. MATCH — ${segment.title}`,
    ...directFields.map((field) => `${field.label}: ${field.value || "Not set"}`),
    tewNotes[0].value ? `TEW NOTES:\n${tewNotes[0].value}` : "",
    `COMPANION APPROACH PLAN:\n${companionOnly[0].value}`,
  ].filter(Boolean).join("\n\n");
  return { segmentId: segment.id, order, section: segment.section, type: "match", title: segment.title, directFields, tewNotes, companionOnly, completeEntryText };
}

function buildAngleTranslation(segment: PlannedSegment, order: number, mappings: BridgeFieldMapping[]): TransferSegmentTranslation {
  const directFields: TransferField[] = [
    transferField(mappings, "Angle", "title", "Segment title", segment.title, "Direct TEW Field", true, "Use as the working segment label."),
    transferField(mappings, "Angle", "durationMinutes", "Duration", String(segment.durationMinutes), "Direct TEW Field", true, "Enter the planned angle time."),
    transferField(mappings, "Angle", "workers", "Participants and roles", workerText(segment), "Direct TEW Field", true, "Assign each participant and role."),
    transferField(mappings, "Angle", "angleLocation", "Location", segment.angleLocation, "Direct TEW Field", false, "Choose the closest TEW angle location."),
    transferField(mappings, "Angle", "angleContentType", "Content type", segment.angleContentType, "Direct TEW Field", false, "Use the closest TEW content or angle type."),
    transferField(mappings, "Angle", "storylines", "Storylines", storylineText(segment), "Direct TEW Field", false, "Attach matching TEW storylines."),
  ];
  const tewNotes = [
    transferField(mappings, "Angle", "segmentOutput", "Segment Output and production notes", angleNotes(segment), "TEW Notes", false, "Paste the usable summary into TEW notes while preserving the full output in the tracker."),
  ];
  const companionOnly = [
    transferField(mappings, "Angle", "audienceTakeaway", "Audience takeaway", segment.audienceTakeaway, "Companion Only", false, "Use this as creative quality control after the TEW segment is entered."),
  ];
  const completeEntryText = [
    `${order}. ANGLE — ${segment.title}`,
    ...directFields.map((field) => `${field.label}: ${field.value || "Not set"}`),
    tewNotes[0].value ? `TEW NOTES:\n${tewNotes[0].value}` : "",
  ].filter(Boolean).join("\n\n");
  return { segmentId: segment.id, order, section: segment.section, type: "angle", title: segment.title, directFields, tewNotes, companionOnly, completeEntryText };
}

export function buildTransferPackage(show: PlannedShow, mappings: BridgeFieldMapping[]): TransferPackage {
  const eventFields: TransferField[] = [
    transferField(mappings, "Show", "name", "Show name", show.name, "Direct TEW Field", true, "Create or select the event in TEW."),
    transferField(mappings, "Show", "date", "Show date", show.date, "Direct TEW Field", true, "Confirm the event date."),
    transferField(mappings, "Show", "showType", "Event type", show.showType, "Direct TEW Field", true, "Choose the matching TEW event type."),
    transferField(mappings, "Show", "venue", "Venue", show.venue, "Direct TEW Field", false, "Select the intended TEW venue."),
    transferField(mappings, "Show", "company", "Company or brand", show.company, "Direct TEW Field", false, "Confirm company and brand context."),
  ];
  const segments = show.segments.map((segment, index) => segment.type === "match"
    ? buildMatchTranslation(segment, index + 1, mappings)
    : buildAngleTranslation(segment, index + 1, mappings));
  const warnings: string[] = [];
  if (show.segments.length === 0) warnings.push("The planned show has no segments.");
  for (const field of [...eventFields, ...segments.flatMap((segment) => segment.directFields)]) {
    if (field.required && !field.value.trim()) warnings.push(`${field.label} is required but empty.`);
    if (field.mappingStage === "Unsupported") warnings.push(`${field.label} is marked unsupported and must remain manual.`);
  }
  return { id: createId("transfer-package"), showId: show.id, showName: show.name, generatedAt: new Date().toISOString(), eventFields, segments, warnings };
}

export function buildTransferText(pkg: TransferPackage): string {
  return [
    `TEW TRANSFER PACKAGE — ${pkg.showName}`,
    `Generated: ${pkg.generatedAt}`,
    "",
    "EVENT",
    ...pkg.eventFields.map((field) => `${field.label}: ${field.value || "Not set"}`),
    "",
    ...pkg.segments.map((segment) => segment.completeEntryText),
    "",
    "SAFETY",
    "This is an assisted TEW transfer package. It does not modify a TEW database.",
  ].join("\n");
}

export function emptyTransferUniverse(): TransferUniverse {
  return { records: [], auditLogs: [] };
}

function emptySegmentProgress(segment: TransferSegmentTranslation): TransferSegmentProgress {
  const fields = [...segment.directFields, ...segment.tewNotes, ...segment.companionOnly].map((field) => ({
    fieldKey: `${segment.segmentId}:${field.destination}:${field.key}`,
    status: field.destination === "Companion Only" ? "Not Applicable" as const : "Pending" as const,
    updatedAt: "",
  }));
  return { segmentId: segment.segmentId, fields, completed: false, entryNotes: "", updatedAt: "" };
}

export function synchronizeTransferRecord(current: TransferRecord | undefined, pkg: TransferPackage): TransferRecord {
  const now = new Date().toISOString();
  const priorHistory = current?.packageHistory ?? [];
  const previousEvent = new Map((current?.eventProgress ?? []).map((field) => [field.fieldKey, field]));
  const previousSegments = new Map((current?.segmentProgress ?? []).map((segment) => [segment.segmentId, segment]));
  const eventProgress = pkg.eventFields.map((field) => previousEvent.get(`event:${field.key}`) ?? { fieldKey: `event:${field.key}`, status: "Pending" as const, updatedAt: "" });
  const segmentProgress = pkg.segments.map((segment) => {
    const previous = previousSegments.get(segment.segmentId);
    if (!previous) return emptySegmentProgress(segment);
    const expected = emptySegmentProgress(segment);
    const oldFields = new Map(previous.fields.map((field) => [field.fieldKey, field]));
    return { ...previous, fields: expected.fields.map((field) => oldFields.get(field.fieldKey) ?? field) };
  });
  return {
    showId: pkg.showId,
    activePackageId: pkg.id,
    packageHistory: [...priorHistory, pkg].slice(-10),
    eventProgress,
    segmentProgress,
    currentSegmentIndex: Math.min(current?.currentSegmentIndex ?? 0, Math.max(0, pkg.segments.length - 1)),
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
}

export function createTransferAudit(showId: string, action: TransferAuditLog["action"], detail: string): TransferAuditLog {
  return { id: createId("transfer-audit"), showId, createdAt: new Date().toISOString(), action, detail };
}
