import { MATCH_ENGINE_SKILLS } from "../matchEngine/profileCatalog";
import type { MatchEngineProfile, MatchEngineUniverse, WrestlerSkill } from "../matchEngine/types";
import { buildTewEntrySummary, createEmptySegmentReconciliation, createPlannedSegment, createPlannerId, touchShow } from "../planner/model";
import type { PlannedSegment, PlannedShow } from "../planner/types";
import type { TewSnapshot } from "../tew/types";
import type {
  OutputDetail,
  OutputTone,
  QuickSegmentRecord,
  RatingFieldSource,
  WorkbenchDraftRevision,
  WorkbenchTemplate,
  WorkbenchUniverse,
  WorkerRatingSourceRecord,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

function workbenchId(prefix: string): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const BUILT_IN_WORKBENCH_TEMPLATES: WorkbenchTemplate[] = [
  {
    id: "television-opening-promo",
    name: "Television Opening Promo",
    type: "angle",
    summary: "An opening segment that establishes the central issue and the night's most important stakes.",
    builtIn: true,
    durationMinutes: 8,
    matchType: "",
    matchAimId: "call-it-in-the-ring",
    angleLocation: "In The Ring",
    angleContentType: "Serious",
    purpose: "Establish the central conflict and give the audience a clear reason to watch the rest of the show.",
    notes: "Keep the opening focused on the night's main issue rather than resolving it immediately.",
  },
  {
    id: "post-match-confrontation",
    name: "Post-Match Confrontation",
    type: "angle",
    summary: "A short follow-up that converts a completed match into the next program beat.",
    builtIn: true,
    durationMinutes: 4,
    matchType: "",
    matchAimId: "call-it-in-the-ring",
    angleLocation: "In The Ring",
    angleContentType: "Serious",
    purpose: "Create the next clear conflict after the match result.",
    notes: "Preserve the importance of the match result before introducing the next challenger or issue.",
  },
  {
    id: "championship-contract-signing",
    name: "Championship Contract Signing",
    type: "angle",
    summary: "A formal confrontation designed to define championship stakes and personal motivations.",
    builtIn: true,
    durationMinutes: 10,
    matchType: "",
    matchAimId: "call-it-in-the-ring",
    angleLocation: "In The Ring",
    angleContentType: "Serious",
    purpose: "Clarify the championship stakes and why each participant believes they should win.",
    notes: "Do not invent dialogue. Record the required beats, escalation, and final visual.",
  },
  {
    id: "squash-match",
    name: "Squash Match",
    type: "match",
    summary: "A short dominance match that establishes one wrestler efficiently.",
    builtIn: true,
    durationMinutes: 5,
    matchType: "1 vs. 1",
    matchAimId: "sprint",
    angleLocation: "",
    angleContentType: "",
    purpose: "Establish the featured wrestler's strengths without unnecessary competitive drift.",
    notes: "One approach slot per wrestler at this duration.",
  },
  {
    id: "technical-showcase",
    name: "Technical Showcase",
    type: "match",
    summary: "A longer match built around holds, counters, control, and progressive escalation.",
    builtIn: true,
    durationMinutes: 18,
    matchType: "1 vs. 1",
    matchAimId: "technical-showcase",
    angleLocation: "",
    angleContentType: "",
    purpose: "Showcase technical ability while giving the match a clear beginning, middle, and finish.",
    notes: "Three approach slots per wrestler at this duration.",
  },
  {
    id: "heated-grudge-match",
    name: "Heated Grudge Match",
    type: "match",
    summary: "A feud match where aggression and consequences matter more than a neutral exhibition.",
    builtIn: true,
    durationMinutes: 16,
    matchType: "1 vs. 1",
    matchAimId: "feud-grudge-match",
    angleLocation: "",
    angleContentType: "",
    purpose: "Advance or settle a personal rivalry through a match with visible emotional stakes.",
    notes: "Use the finish and aftermath to create a concrete storyline consequence.",
  },
  {
    id: "tournament-match",
    name: "Tournament Match",
    type: "match",
    summary: "A competitive match whose result must clearly advance a bracket or league objective.",
    builtIn: true,
    durationMinutes: 15,
    matchType: "1 vs. 1",
    matchAimId: "competitive-tv-match",
    angleLocation: "",
    angleContentType: "",
    purpose: "Deliver a credible competitive result and make advancement feel meaningful.",
    notes: "Document the round and advancement consequence in the Match Story.",
  },
  {
    id: "tag-team-showcase",
    name: "Tag-Team Showcase",
    type: "match",
    summary: "A match structured around team identity, isolation, tags, and a decisive finishing sequence.",
    builtIn: true,
    durationMinutes: 14,
    matchType: "2 vs. 2",
    matchAimId: "feature-match",
    angleLocation: "",
    angleContentType: "",
    purpose: "Show the strengths and identity of both teams while keeping legal participants and sides clear.",
    notes: "Assign each wrestler to the correct side before selecting approaches.",
  },
  {
    id: "main-event-title-match",
    name: "Main-Event Title Match",
    type: "match",
    summary: "A long championship main event with room for escalation, adversity, and a definitive finish.",
    builtIn: true,
    durationMinutes: 25,
    matchType: "1 vs. 1",
    matchAimId: "epic-main-event-slow-burn",
    angleLocation: "",
    angleContentType: "",
    purpose: "Deliver a major championship match that justifies the main-event position and its aftermath.",
    notes: "Four approach slots per wrestler at this duration.",
  },
];

export function emptyWorkbenchUniverse(): WorkbenchUniverse {
  return {
    quickSegments: [],
    templates: BUILT_IN_WORKBENCH_TEMPLATES.map((template) => ({ ...template })),
    ratingSources: [],
    recentSegmentIds: [],
    settings: {
      advancedToolsVisible: false,
      defaultMode: "quick-match",
      lastQuickSegmentId: "",
      lastPlannedShowId: "",
      lastPlannedSegmentId: "",
      compactApproachView: true,
    },
  };
}

export function applyWorkbenchTemplate(segment: PlannedSegment, template: WorkbenchTemplate): PlannedSegment {
  return {
    ...segment,
    type: template.type,
    title: template.name,
    durationMinutes: template.durationMinutes,
    matchType: template.type === "match" ? template.matchType || "1 vs. 1" : "",
    purpose: template.purpose,
    notes: template.notes,
    angleLocation: template.type === "angle" ? template.angleLocation || "In The Ring" : "",
    angleContentType: template.type === "angle" ? template.angleContentType || "Serious" : "",
    matchApproachSetup: {
      ...segment.matchApproachSetup,
      matchAimId: template.matchAimId,
      workerPlans: [],
      performancePreview: null,
      updatedAt: now(),
    },
  };
}

export function createQuickSegmentRecord(type: PlannedSegment["type"], template?: WorkbenchTemplate): QuickSegmentRecord {
  const createdAt = now();
  const base = createPlannedSegment(type);
  const segment = template ? applyWorkbenchTemplate(base, template) : base;
  const id = workbenchId("quick-segment");
  return {
    id,
    type,
    segment: { ...segment, id },
    templateId: template?.id ?? "",
    draftHistory: [],
    attachedShowIds: [],
    createdAt,
    updatedAt: createdAt,
    lastOpenedAt: createdAt,
  };
}

export function primaryOutput(segment: PlannedSegment): string {
  return segment.type === "match" ? segment.matchStory : segment.segmentOutput;
}

export function tewNotesOutput(segment: PlannedSegment): string {
  const lines = [
    buildTewEntrySummary(segment),
    segment.type === "match" && segment.keyMoments ? `Key moments / road-agent map:\n${segment.keyMoments}` : "",
    segment.consequences ? `Consequences:\n${segment.consequences}` : "",
    segment.followUp ? `Follow-up:\n${segment.followUp}` : "",
  ];
  return lines.filter(Boolean).join("\n\n");
}

export function captureWorkbenchDraft(record: QuickSegmentRecord, tone: OutputTone, detail: OutputDetail, label = ""): QuickSegmentRecord {
  const output = primaryOutput(record.segment);
  const revision: WorkbenchDraftRevision = {
    id: workbenchId("workbench-draft"),
    createdAt: now(),
    label: label.trim() || `${record.segment.title || (record.type === "match" ? "Match" : "Angle")} draft ${record.draftHistory.length + 1}`,
    tone,
    detail,
    fullOutput: output,
    keyMoments: record.segment.keyMoments,
    tewNotes: tewNotesOutput(record.segment),
  };
  return { ...record, draftHistory: [revision, ...record.draftHistory].slice(0, 40), updatedAt: revision.createdAt };
}

export function restoreWorkbenchDraft(record: QuickSegmentRecord, revision: WorkbenchDraftRevision): QuickSegmentRecord {
  const segment = record.type === "match"
    ? { ...record.segment, matchStory: revision.fullOutput, keyMoments: revision.keyMoments }
    : { ...record.segment, segmentOutput: revision.fullOutput };
  return { ...record, segment, updatedAt: now() };
}

export function duplicateWorkbenchDraft(record: QuickSegmentRecord, revision: WorkbenchDraftRevision): QuickSegmentRecord {
  const restored = restoreWorkbenchDraft(record, revision);
  const timestamp = now();
  return {
    ...restored,
    id: workbenchId("quick-segment"),
    segment: { ...restored.segment, id: workbenchId("quick-segment-copy"), title: `${restored.segment.title} Copy` },
    templateId: "",
    draftHistory: [{ ...revision, id: workbenchId("workbench-draft-copy"), createdAt: timestamp, label: `${revision.label} Copy` }],
    attachedShowIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };
}

export function cloneSegmentForShow(segment: PlannedSegment): PlannedSegment {
  return {
    ...segment,
    id: createPlannerId(),
    bookingIdeaId: "",
    workflowStatus: "Planned",
    reconciliation: createEmptySegmentReconciliation(),
    matchApproachSetup: {
      ...segment.matchApproachSetup,
      workerPlans: segment.matchApproachSetup.workerPlans.map((plan) => ({
        ...plan,
        selectedApproachIds: [...plan.selectedApproachIds],
        lockedApproachIds: [...plan.lockedApproachIds],
      })),
      performancePreview: null,
      updatedAt: now(),
    },
    workers: segment.workers.map((worker) => ({ ...worker })),
    storylines: segment.storylines.map((storyline) => ({ ...storyline })),
  };
}

export function attachQuickSegmentToShow(record: QuickSegmentRecord, showId: string, shows: PlannedShow[]): { record: QuickSegmentRecord; shows: PlannedShow[]; segmentId: string } {
  const show = shows.find((item) => item.id === showId);
  if (!show) throw new Error("The selected planned show no longer exists.");
  const segment = cloneSegmentForShow(record.segment);
  const updatedShow = touchShow({ ...show, segments: [...show.segments, segment] });
  return {
    record: {
      ...record,
      attachedShowIds: [...new Set([...record.attachedShowIds, showId])],
      updatedAt: now(),
    },
    shows: shows.map((item) => item.id === showId ? updatedShow : item),
    segmentId: segment.id,
  };
}

export function saveCustomTemplate(record: QuickSegmentRecord, name: string): WorkbenchTemplate {
  const segment = record.segment;
  return {
    id: workbenchId("custom-template"),
    name: name.trim() || `${segment.title} Template`,
    type: segment.type,
    summary: `Reusable structure saved from ${segment.title}. Wrestlers, winners, and dialogue are not treated as template requirements.`,
    builtIn: false,
    durationMinutes: segment.durationMinutes,
    matchType: segment.matchType,
    matchAimId: segment.matchApproachSetup.matchAimId,
    angleLocation: segment.angleLocation,
    angleContentType: segment.angleContentType,
    purpose: segment.purpose,
    notes: segment.notes,
  };
}

function sourceField(field: string, profileValue: number | null, existing?: RatingFieldSource): RatingFieldSource {
  if (existing && existing.source !== "Missing") return existing;
  if (profileValue !== null) {
    return {
      field,
      source: "Manual Override",
      importedValue: null,
      overrideValue: profileValue,
      note: "The value comes from the tracker-side match profile. It was not read from the TEW snapshot.",
    };
  }
  return {
    field,
    source: "Missing",
    importedValue: null,
    overrideValue: null,
    note: "The normalized read-only TEW snapshot currently exposes worker identity, but not a verified value for this rating.",
  };
}

function profileForWorker(universe: MatchEngineUniverse, workerId: string): MatchEngineProfile | undefined {
  return universe.profiles.find((profile) => profile.workerSource === "tew" && profile.workerId === workerId);
}

export function synchronizeWorkerRatingSources(
  snapshot: TewSnapshot | null,
  matchEngine: MatchEngineUniverse,
  current: WorkerRatingSourceRecord[],
): WorkerRatingSourceRecord[] {
  if (!snapshot) return current;
  const byKey = new Map(current.map((record) => [record.workerKey, record]));
  const timestamp = now();
  return snapshot.workers.map((worker) => {
    const workerKey = `tew:${worker.id}`;
    const existing = byKey.get(workerKey);
    const profile = profileForWorker(matchEngine, worker.id);
    const skills = Object.fromEntries(MATCH_ENGINE_SKILLS.map((skill) => [
      skill,
      sourceField(skill, profile?.skills[skill] ?? null, existing?.skills[skill]),
    ])) as Record<WrestlerSkill, RatingFieldSource>;
    return {
      workerKey,
      workerId: worker.id,
      workerName: worker.name,
      snapshotFile: snapshot.fileName,
      identitySource: "TEW snapshot",
      overall: sourceField("Overall", profile?.overall ?? null, existing?.overall),
      health: sourceField("Health", profile?.health ?? null, existing?.health),
      popularity: sourceField("Popularity", profile?.popularity ?? null, existing?.popularity),
      experience: sourceField("Experience", profile?.experience ?? null, existing?.experience),
      skills,
      updatedAt: timestamp,
    };
  });
}

export function updateRecentSegments(universe: WorkbenchUniverse, segmentId: string): WorkbenchUniverse {
  return {
    ...universe,
    recentSegmentIds: [segmentId, ...universe.recentSegmentIds.filter((id) => id !== segmentId)].slice(0, 12),
    settings: { ...universe.settings, lastQuickSegmentId: segmentId },
  };
}
