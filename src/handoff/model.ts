import type { PlannedShow } from "../planner/types";
import type { TewSnapshot } from "../tew/types";
import type {
  HandoffChecklist,
  HandoffFieldKey,
  HandoffMapping,
  HandoffMappingKind,
  HandoffSegmentProgress,
  HandoffSegmentSnapshot,
  HandoffUniverse,
  HandoffVersion,
  HandoffWarning,
  ShowHandoffRecord,
} from "./types";

export const HANDOFF_FIELDS: HandoffFieldKey[] = [
  "title",
  "participants",
  "duration",
  "winner",
  "finish",
  "championship",
  "narrative",
  "storylines",
  "agentNotes",
];

function id(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now(): string {
  return new Date().toISOString();
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function createEmptyChecklist(): HandoffChecklist {
  return {
    showCreated: false,
    eventSettingsEntered: false,
    matchesEntered: false,
    anglesEntered: false,
    workersAssigned: false,
    winnersAndFinishesEntered: false,
    championshipsAssigned: false,
    storylinesAssigned: false,
    durationsChecked: false,
    runningOrderConfirmed: false,
    finalCardReviewed: false,
  };
}

export function createEmptyHandoffUniverse(): HandoffUniverse {
  return { records: [], mappings: [] };
}

export function createShowHandoffRecord(showId: string): ShowHandoffRecord {
  const timestamp = now();
  return {
    showId,
    status: "Draft",
    activeVersionId: "",
    versions: [],
    checklist: createEmptyChecklist(),
    segmentProgress: [],
    entryNotes: "",
    startedAt: "",
    enteredAt: "",
    updatedAt: timestamp,
  };
}

function freezeSegment(show: PlannedShow, index: number): HandoffSegmentSnapshot {
  const segment = show.segments[index];
  return {
    id: segment.id,
    order: index + 1,
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
    championshipMatchPurpose: segment.championshipMatchPurpose,
    championEntering: segment.championEntering,
    challenger: segment.challenger,
    expectedTitleChange: segment.expectedTitleChange,
    championshipStakes: segment.championshipStakes,
    plannedWinner: segment.plannedWinner,
    plannedFinish: segment.plannedFinish,
    matchStory: segment.matchStory,
    keyMoments: segment.keyMoments,
    interference: segment.interference,
    postMatch: segment.postMatch,
    angleLocation: segment.angleLocation,
    angleContentType: segment.angleContentType,
    segmentOutput: segment.segmentOutput,
    audienceTakeaway: segment.audienceTakeaway,
    bookingIdeaId: segment.bookingIdeaId,
  };
}

export function compareHandoffVersions(
  previous: HandoffVersion | null,
  next: Omit<HandoffVersion, "changesFromPrevious">,
): string[] {
  if (!previous) return ["Initial finalized handoff package."];
  const changes: string[] = [];
  const metadata: Array<[keyof HandoffVersion["show"], string]> = [
    ["name", "Show name"],
    ["date", "Show date"],
    ["company", "Company"],
    ["showType", "Show type"],
    ["venue", "Venue"],
    ["expectedMinutes", "Expected duration"],
    ["notes", "Show notes"],
  ];
  metadata.forEach(([key, label]) => {
    if (previous.show[key] !== next.show[key]) changes.push(`${label} changed.`);
  });
  if (previous.segments.length !== next.segments.length) {
    changes.push(`Card changed from ${previous.segments.length} to ${next.segments.length} segments.`);
  }
  const previousById = new Map(previous.segments.map((segment) => [segment.id, segment]));
  next.segments.forEach((segment) => {
    const before = previousById.get(segment.id);
    if (!before) {
      changes.push(`Added segment: ${segment.title}.`);
      return;
    }
    if (before.order !== segment.order) changes.push(`${segment.title}: running-order position changed.`);
    if (before.title !== segment.title) changes.push(`Segment renamed from ${before.title} to ${segment.title}.`);
    if (before.durationMinutes !== segment.durationMinutes) changes.push(`${segment.title}: duration changed.`);
    if (before.plannedWinner !== segment.plannedWinner) changes.push(`${segment.title}: planned winner changed.`);
    if (before.plannedFinish !== segment.plannedFinish) changes.push(`${segment.title}: finish changed.`);
    if (before.championship !== segment.championship || before.championshipId !== segment.championshipId) changes.push(`${segment.title}: championship assignment changed.`);
    if (before.matchStory !== segment.matchStory || before.segmentOutput !== segment.segmentOutput) changes.push(`${segment.title}: narrative changed.`);
    if (before.workers.map((worker) => worker.name).join("|") !== segment.workers.map((worker) => worker.name).join("|")) changes.push(`${segment.title}: participants changed.`);
  });
  previous.segments.forEach((segment) => {
    if (!next.segments.some((candidate) => candidate.id === segment.id)) changes.push(`Removed segment: ${segment.title}.`);
  });
  return changes.length > 0 ? changes : ["No material changes from the previous finalized version."];
}

export function finalizeHandoffVersion(show: PlannedShow, previous: HandoffVersion | null): HandoffVersion {
  const timestamp = now();
  const base = {
    id: id("handoff-version"),
    versionNumber: (previous?.versionNumber ?? 0) + 1,
    createdAt: timestamp,
    show: {
      id: show.id,
      name: show.name,
      date: show.date,
      company: show.company,
      showType: show.showType,
      venue: show.venue,
      expectedMinutes: show.expectedMinutes,
      notes: show.notes,
      sourceUpdatedAt: show.updatedAt,
    },
    segments: show.segments.map((_, index) => freezeSegment(show, index)),
  };
  return { ...base, changesFromPrevious: compareHandoffVersions(previous, base) };
}

export function createSegmentProgress(segmentId: string): HandoffSegmentProgress {
  return {
    segmentId,
    fields: {
      title: false,
      participants: false,
      duration: false,
      winner: false,
      finish: false,
      championship: false,
      narrative: false,
      storylines: false,
      agentNotes: false,
    },
    completed: false,
    updatedAt: now(),
  };
}

export function synchronizeSegmentProgress(
  version: HandoffVersion,
  existing: HandoffSegmentProgress[],
): HandoffSegmentProgress[] {
  return version.segments.map((segment) => existing.find((item) => item.segmentId === segment.id) ?? createSegmentProgress(segment.id));
}

export function upsertMapping(
  mappings: HandoffMapping[],
  input: Omit<HandoffMapping, "id" | "updatedAt">,
): HandoffMapping[] {
  const existing = mappings.find((mapping) => mapping.kind === input.kind && mapping.trackerId === input.trackerId);
  const mapping: HandoffMapping = {
    ...input,
    id: existing?.id ?? id("mapping"),
    updatedAt: now(),
  };
  return existing
    ? mappings.map((item) => item.id === existing.id ? mapping : item)
    : [...mappings, mapping];
}

export function findMapping(
  mappings: HandoffMapping[],
  kind: HandoffMappingKind,
  trackerId: string,
  trackerName: string,
): HandoffMapping | null {
  return mappings.find((mapping) =>
    mapping.kind === kind &&
    (mapping.trackerId === trackerId || normalize(mapping.trackerName) === normalize(trackerName)),
  ) ?? null;
}

function hasSnapshotMatch(
  snapshot: TewSnapshot | null,
  kind: "Worker" | "Storyline",
  name: string,
): boolean {
  if (!snapshot) return false;
  const source = kind === "Worker" ? snapshot.workers : snapshot.storylines;
  return source.some((record) => normalize(record.name) === normalize(name));
}

export function buildHandoffWarnings(
  version: HandoffVersion | null,
  snapshot: TewSnapshot | null,
  mappings: HandoffMapping[],
): HandoffWarning[] {
  if (!version) return [{ id: "no-version", category: "Card", message: "Finalize the card before beginning TEW entry.", segmentId: "" }];
  const warnings: HandoffWarning[] = [];
  if (!snapshot) warnings.push({ id: "snapshot", category: "Snapshot", message: "No TEW snapshot is loaded. Record matching cannot be verified.", segmentId: "" });
  const mappedCompany = findMapping(mappings, "Company", version.show.company, version.show.company);
  if (version.show.company && !mappedCompany) warnings.push({ id: `company-${version.show.company}`, category: "Mapping", message: `${version.show.company} has no saved TEW company mapping.`, segmentId: "" });
  const totalMinutes = version.segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
  if (totalMinutes > version.show.expectedMinutes) warnings.push({ id: "time-over", category: "Card", message: `The finalized card is ${totalMinutes - version.show.expectedMinutes} minutes over the expected show length.`, segmentId: "" });
  if (version.segments.length === 0) warnings.push({ id: "empty-card", category: "Card", message: "The finalized handoff package contains no segments.", segmentId: "" });

  version.segments.forEach((segment) => {
    if (!segment.title.trim()) warnings.push({ id: `title-${segment.id}`, category: "Segment", message: `Segment #${segment.order} has no title.`, segmentId: segment.id });
    if (segment.durationMinutes <= 0) warnings.push({ id: `duration-${segment.id}`, category: "Segment", message: `${segment.title || `Segment #${segment.order}`} has no valid duration.`, segmentId: segment.id });
    if (segment.workers.length === 0) warnings.push({ id: `workers-${segment.id}`, category: "Segment", message: `${segment.title} has no assigned workers.`, segmentId: segment.id });
    const duplicateRoles = new Map<string, Set<string>>();
    segment.workers.forEach((worker) => {
      const key = normalize(worker.name);
      const roles = duplicateRoles.get(key) ?? new Set<string>();
      roles.add(`${worker.role}|${worker.side}`);
      duplicateRoles.set(key, roles);
      const mapping = findMapping(mappings, "Worker", worker.id, worker.name);
      if (!mapping && !hasSnapshotMatch(snapshot, "Worker", worker.name)) {
        warnings.push({ id: `worker-${segment.id}-${worker.id}`, category: "Mapping", message: `${worker.name} cannot be matched to the loaded TEW worker list.`, segmentId: segment.id });
      }
    });
    duplicateRoles.forEach((roles, workerName) => {
      if (roles.size > 1) warnings.push({ id: `conflict-${segment.id}-${workerName}`, category: "Conflict", message: `${segment.title} assigns ${workerName} to multiple conflicting roles or sides.`, segmentId: segment.id });
    });
    segment.storylines.forEach((storyline) => {
      const mapping = findMapping(mappings, "Storyline", storyline.id, storyline.name);
      if (!mapping && !hasSnapshotMatch(snapshot, "Storyline", storyline.name)) {
        warnings.push({ id: `storyline-${segment.id}-${storyline.id}`, category: "Mapping", message: `${storyline.name} exists only in the tracker and has no TEW storyline mapping.`, segmentId: segment.id });
      }
    });
    if (segment.type === "match") {
      if (!segment.plannedWinner.trim()) warnings.push({ id: `winner-${segment.id}`, category: "Segment", message: `${segment.title} has no planned winner.`, segmentId: segment.id });
      if (!segment.plannedFinish.trim()) warnings.push({ id: `finish-${segment.id}`, category: "Segment", message: `${segment.title} has no planned finish.`, segmentId: segment.id });
      if (!segment.matchStory.trim()) warnings.push({ id: `narrative-${segment.id}`, category: "Segment", message: `${segment.title} has no full Match Story.`, segmentId: segment.id });
      if (segment.championship || segment.championshipId) {
        const mapping = findMapping(mappings, "Championship", segment.championshipId || segment.championship, segment.championship);
        if (!mapping) warnings.push({ id: `champ-${segment.id}`, category: "Mapping", message: `${segment.championship || "The tracker championship"} has no saved TEW championship mapping.`, segmentId: segment.id });
        if (!segment.championshipMatchPurpose) warnings.push({ id: `stakes-purpose-${segment.id}`, category: "Championship", message: `${segment.title} is a title match without a match purpose.`, segmentId: segment.id });
        if (!segment.championEntering && segment.championshipMatchPurpose === "Defense") warnings.push({ id: `champion-${segment.id}`, category: "Championship", message: `${segment.title} is a defense without a champion entering.`, segmentId: segment.id });
        if (!segment.challenger && segment.championshipMatchPurpose === "Defense") warnings.push({ id: `challenger-${segment.id}`, category: "Championship", message: `${segment.title} is a defense without a challenger.`, segmentId: segment.id });
      }
    } else if (!segment.segmentOutput.trim()) {
      warnings.push({ id: `narrative-${segment.id}`, category: "Segment", message: `${segment.title} has no full Segment Output.`, segmentId: segment.id });
    }
  });
  return warnings;
}

function mappedName(
  mappings: HandoffMapping[],
  kind: HandoffMappingKind,
  trackerId: string,
  trackerName: string,
): string {
  return findMapping(mappings, kind, trackerId, trackerName)?.tewName || trackerName;
}

export function buildSegmentEntryText(segment: HandoffSegmentSnapshot, mappings: HandoffMapping[] = []): string {
  const workers = segment.workers.map((worker) => {
    const name = mappedName(mappings, "Worker", worker.id, worker.name);
    const detail = [worker.role, worker.side].filter(Boolean).join(" / ");
    return detail ? `${name} — ${detail}` : name;
  });
  const storylines = segment.storylines.map((storyline) => mappedName(mappings, "Storyline", storyline.id, storyline.name));
  const championship = segment.championship
    ? mappedName(mappings, "Championship", segment.championshipId || segment.championship, segment.championship)
    : "";
  const lines = [
    `#${segment.order} · ${segment.section} · ${segment.type === "match" ? "MATCH" : "ANGLE"}`,
    segment.title,
    `Duration: ${segment.durationMinutes} minutes`,
    workers.length ? `Participants:\n${workers.join("\n")}` : "Participants: None assigned",
    storylines.length ? `Storylines: ${storylines.join(", ")}` : "",
  ];
  if (segment.type === "match") {
    lines.push(
      segment.matchType ? `Match type: ${mappedName(mappings, "Match Term", segment.matchType, segment.matchType)}` : "",
      championship ? `Championship: ${championship}` : "",
      segment.championshipMatchPurpose ? `Title purpose: ${segment.championshipMatchPurpose}` : "",
      segment.championEntering ? `Champion entering: ${segment.championEntering}` : "",
      segment.challenger ? `Challenger: ${segment.challenger}` : "",
      segment.expectedTitleChange === null ? "" : `Expected title change: ${segment.expectedTitleChange ? "Yes" : "No"}`,
      segment.championshipStakes ? `Championship stakes: ${segment.championshipStakes}` : "",
      segment.plannedWinner ? `Planned winner: ${segment.plannedWinner}` : "",
      segment.plannedFinish ? `Planned finish: ${segment.plannedFinish}` : "",
      segment.matchStory ? `Match Story:\n${segment.matchStory}` : "",
      segment.keyMoments ? `Key moments:\n${segment.keyMoments}` : "",
      segment.interference ? `Interference:\n${segment.interference}` : "",
      segment.postMatch ? `Post-match:\n${segment.postMatch}` : "",
    );
  } else {
    lines.push(
      segment.angleLocation ? `Location: ${segment.angleLocation}` : "",
      segment.angleContentType ? `Content type: ${segment.angleContentType}` : "",
      segment.segmentOutput ? `Segment Output:\n${segment.segmentOutput}` : "",
      segment.audienceTakeaway ? `Audience takeaway:\n${segment.audienceTakeaway}` : "",
    );
  }
  lines.push(
    segment.purpose ? `Creative purpose:\n${segment.purpose}` : "",
    segment.consequences ? `Consequences:\n${segment.consequences}` : "",
    segment.followUp ? `Required follow-up:\n${segment.followUp}` : "",
    segment.privateNotes ? `Road-agent / private notes:\n${segment.privateNotes}` : "",
  );
  return lines.filter(Boolean).join("\n\n");
}

export function buildShowHandoffText(version: HandoffVersion, mappings: HandoffMapping[] = []): string {
  const company = mappedName(mappings, "Company", version.show.company, version.show.company);
  const total = version.segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
  const header = [
    `TEW SHOW HANDOFF · VERSION ${version.versionNumber}`,
    version.show.name,
    `Date: ${version.show.date || "Not set"}`,
    `Company: ${company || "Not set"}`,
    `Type: ${version.show.showType}`,
    `Venue: ${version.show.venue || "Not set"}`,
    `Card time: ${total}/${version.show.expectedMinutes} minutes`,
    version.show.notes ? `Show notes:\n${version.show.notes}` : "",
  ].filter(Boolean).join("\n");
  return `${header}\n\n${version.segments.map((segment) => buildSegmentEntryText(segment, mappings)).join("\n\n${"=".repeat(72)}\n\n")}`;
}

export function buildShowHandoffMarkdown(version: HandoffVersion, mappings: HandoffMapping[] = []): string {
  const total = version.segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);
  const company = mappedName(mappings, "Company", version.show.company, version.show.company);
  const sections = version.segments.map((segment) => {
    const workers = segment.workers.map((worker) => `- ${mappedName(mappings, "Worker", worker.id, worker.name)}${worker.role ? ` — ${worker.role}` : ""}${worker.side ? ` (${worker.side})` : ""}`).join("\n");
    const narrative = segment.type === "match" ? segment.matchStory : segment.segmentOutput;
    return [
      `## ${segment.order}. ${segment.title}`,
      `**${segment.type === "match" ? "Match" : "Angle"} · ${segment.section} · ${segment.durationMinutes} minutes**`,
      workers ? `### Participants\n${workers}` : "",
      segment.storylines.length ? `**Storylines:** ${segment.storylines.map((storyline) => mappedName(mappings, "Storyline", storyline.id, storyline.name)).join(", ")}` : "",
      segment.type === "match" && segment.matchType ? `**Match type:** ${segment.matchType}` : "",
      segment.type === "match" && segment.championship ? `**Championship:** ${mappedName(mappings, "Championship", segment.championshipId || segment.championship, segment.championship)}` : "",
      segment.type === "match" && segment.plannedWinner ? `**Planned winner:** ${segment.plannedWinner}` : "",
      segment.type === "match" && segment.plannedFinish ? `**Planned finish:** ${segment.plannedFinish}` : "",
      narrative ? `### ${segment.type === "match" ? "Match Story" : "Segment Output"}\n${narrative}` : "",
      segment.privateNotes ? `### Road-Agent Notes\n${segment.privateNotes}` : "",
    ].filter(Boolean).join("\n\n");
  });
  return [
    `# ${version.show.name}`,
    `**TEW Handoff Version ${version.versionNumber}**`,
    `- Date: ${version.show.date || "Not set"}`,
    `- Company: ${company || "Not set"}`,
    `- Show type: ${version.show.showType}`,
    `- Venue: ${version.show.venue || "Not set"}`,
    `- Card time: ${total}/${version.show.expectedMinutes} minutes`,
    version.show.notes ? `## Show Notes\n${version.show.notes}` : "",
    ...sections,
  ].filter(Boolean).join("\n\n");
}

export function collectMappingTargets(version: HandoffVersion | null): Array<{ kind: HandoffMappingKind; trackerId: string; trackerName: string }> {
  if (!version) return [];
  const targets: Array<{ kind: HandoffMappingKind; trackerId: string; trackerName: string }> = [];
  if (version.show.company) targets.push({ kind: "Company", trackerId: version.show.company, trackerName: version.show.company });
  version.segments.forEach((segment) => {
    segment.workers.forEach((worker) => targets.push({ kind: "Worker", trackerId: worker.id, trackerName: worker.name }));
    segment.storylines.forEach((storyline) => targets.push({ kind: "Storyline", trackerId: storyline.id, trackerName: storyline.name }));
    if (segment.championship) targets.push({ kind: "Championship", trackerId: segment.championshipId || segment.championship, trackerName: segment.championship });
    if (segment.matchType) targets.push({ kind: "Match Term", trackerId: segment.matchType, trackerName: segment.matchType });
  });
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.kind}:${target.trackerId}:${normalize(target.trackerName)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function handoffProgress(record: ShowHandoffRecord, version: HandoffVersion | null): { completed: number; total: number } {
  if (!version) return { completed: 0, total: 0 };
  const completed = version.segments.filter((segment) => record.segmentProgress.find((item) => item.segmentId === segment.id)?.completed).length;
  return { completed, total: version.segments.length };
}

export function participantNames(segment: HandoffSegmentSnapshot, mappings: HandoffMapping[]): string {
  return unique(segment.workers.map((worker) => mappedName(mappings, "Worker", worker.id, worker.name))).join(", ");
}
