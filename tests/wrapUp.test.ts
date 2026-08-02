import { describe, expect, test } from "vitest";
import {
  createChampionship,
  createChampionshipReign,
} from "../src/championships/model";
import { emptyChampionshipUniverse } from "../src/championships/storage";
import { createBookingIdea } from "../src/control/model";
import { emptyCreativeControlData } from "../src/control/storage";
import {
  buildCompetitionStandings,
  createCompetitionParticipant,
  createCompetitionTemplate,
  generateCompetitionStructure,
} from "../src/competitions/model";
import { emptyCompetitionUniverse } from "../src/competitions/model";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import { emptyPromotionScheduleUniverse } from "../src/schedule/model";
import { createStorylineMilestone, createTrackerStoryline } from "../src/storylines/model";
import { createWorkerArc, createWorkerProfile } from "../src/workers/model";
import {
  applyArcConsequence,
  applyBookingIdeaConsequence,
  applyChampionshipConsequence,
  applyCompetitionConsequence,
  applyFollowUpConsequence,
  applyMilestoneConsequence,
  applySegmentReview,
  buildShowClosureReport,
  buildWrapUpProgress,
  capturePreWrapSnapshot,
  closeWrapUpSession,
  createWrapUpSession,
  openWrapUpAmendment,
  parsePreWrapSnapshot,
  previewChampionshipDecision,
  synchronizeWrapUpSession,
} from "../src/wrapUp/model";
import { migrateShowsToWrapUp, parseWrapUpUniverse } from "../src/wrapUp/storage";

function actualMatch(winner: string, rating = 82) {
  return {
    id: `actual-${winner}`,
    description: `${winner} won the match`,
    rating,
    winner,
    matchTime: "18:20",
    notes: "TEW result notes",
    placement: "Main Show" as const,
    workers: [winner],
  };
}

function reconciledShow() {
  const show = createPlannedShow(1);
  show.id = "show-1";
  show.name = "PWL Power Hour #1";
  show.date = "2026-08-03";
  show.status = "Reconciled";
  show.reconciliation = {
    linkedShowId: "actual-show",
    actualShow: {
      id: "actual-show",
      name: "PWL Power Hour #1",
      date: "2026-08-03",
      rating: 79,
      attendance: 1200,
      venue: "PWL Arena",
      company: "PWL",
      broadcast: "Television",
      sourceFile: "TEW-post-show.mdb",
    },
    linkedAt: "2026-08-03T20:00:00.000Z",
    completedAt: "2026-08-03T22:00:00.000Z",
    notes: "Confirmed",
  };
  return show;
}

function synchronize(show: ReturnType<typeof reconciledShow>, input: {
  championships?: ReturnType<typeof emptyChampionshipUniverse>;
  competitions?: ReturnType<typeof emptyCompetitionUniverse>;
  storylines?: ReturnType<typeof createTrackerStoryline>[];
  control?: ReturnType<typeof emptyCreativeControlData>;
  workers?: { profiles: ReturnType<typeof createWorkerProfile>[]; relationships: [] };
} = {}) {
  return synchronizeWrapUpSession({
    session: createWrapUpSession(show),
    show,
    championships: input.championships ?? emptyChampionshipUniverse(),
    competitions: input.competitions ?? emptyCompetitionUniverse(),
    storylines: input.storylines ?? [],
    control: input.control ?? emptyCreativeControlData(),
    workers: input.workers ?? { profiles: [], relationships: [] },
  });
}

function singlesTitle() {
  const title = createChampionship(1);
  title.id = "pwl-title";
  title.name = "PWL Championship";
  title.status = "Active";
  title.currentChampions = [{ id: "champion", name: "Jay White" }];
  title.dateWon = "2026-07-01";
  title.reigns = [createChampionshipReign(title.currentChampions, [], title.dateWon)];
  return title;
}

function competitionWithParticipants(template: "world-classic" | "league" = "world-classic", count = 4) {
  const competition = createCompetitionTemplate(template);
  competition.participants = Array.from({ length: count }, (_, index) => createCompetitionParticipant(
    `Wrestler ${index + 1}`,
    competition.participantType,
    { seed: index + 1, memberNames: [`Wrestler ${index + 1}`] },
  ));
  return generateCompetitionStructure(competition);
}

describe("Phase 5I post-show consequence center", () => {
  test("preserves a partial final angle record without inventing a TEW angle result", () => {
    const show = reconciledShow();
    const angle = createPlannedSegment("angle");
    angle.id = "angle-1";
    angle.title = "Contract Signing";
    angle.segmentOutput = "The champion signs before the challenger flips the table.";
    angle.workflowStatus = "Reconciled";
    show.segments = [angle];
    const session = synchronize(show);
    const review = {
      ...session.segmentReviews[0],
      happenedAsPlanned: "Partially" as const,
      actualAngleRating: 74,
      finalNarrative: "The contract was signed, but the planned table flip was removed.",
      changes: "The confrontation remained verbal.",
      actualConsequences: "The title match is official.",
      finalFollowUp: "Final face-to-face next week.",
    };
    const applied = applySegmentReview(show, review);
    const reconciliation = applied.show.segments[0].reconciliation;
    expect(reconciliation.happenedAsPlanned).toBeNull();
    expect(reconciliation.happenedAsPlannedDetail).toBe("Partially");
    expect(reconciliation.actualRating).toBe(74);
    expect(reconciliation.finalNarrative).toContain("planned table flip was removed");
    expect(applied.review.status).toBe("Reviewed");
  });

  test("confirms a retained championship and increments the defense only after approval", () => {
    const show = reconciledShow();
    const match = createPlannedSegment("match");
    match.id = "title-match";
    match.title = "PWL Championship Match";
    match.championshipId = "pwl-title";
    match.championship = "PWL Championship";
    match.championEntering = "Jay White";
    match.challenger = "PAC";
    match.workflowStatus = "Reconciled";
    match.reconciliation.actualMatch = actualMatch("Jay White");
    show.segments = [match];
    const title = singlesTitle();
    const session = synchronize(show, { championships: { championships: [title] } });
    const decision = session.championshipDecisions[0];
    expect(decision.suggestedDecision).toBe("Retained");
    expect(title.defenses).toBe(0);
    const applied = applyChampionshipConsequence({ universe: { championships: [title] }, show, decision });
    expect(applied.universe.championships[0].defenses).toBe(1);
    expect(applied.decision.status).toBe("Confirmed");
    expect(applied.show.segments[0].titleResultDecision).toBe("Retained");
  });

  test("blocks an ambiguous tag-title change until all new champions are resolved", () => {
    const show = reconciledShow();
    const match = createPlannedSegment("match");
    match.id = "tag-title-match";
    match.championshipId = "tag-title";
    match.championship = "PWL Tag Team Championship";
    match.championEntering = "Team Alpha";
    match.challenger = "Team Beta";
    match.workflowStatus = "Reconciled";
    match.reconciliation.actualMatch = actualMatch("Team Beta");
    show.segments = [match];
    const title = singlesTitle();
    title.id = "tag-title";
    title.name = "PWL Tag Team Championship";
    title.division = "Tag Team";
    title.currentChampions = [{ id: "alpha-1", name: "Alpha One" }, { id: "alpha-2", name: "Alpha Two" }];
    title.reigns = [createChampionshipReign(title.currentChampions, [], "2026-07-01")];
    const session = synchronize(show, { championships: { championships: [title] } });
    const decision = { ...session.championshipDecisions[0], decision: "Changed Hands" as const, resolvedChampionNames: "Beta One" };
    const blocked = previewChampionshipDecision({ championship: title, show, segment: match, decision });
    expect(blocked.blocked).toBe(true);
    expect(blocked.message).toContain("at least 2");
    const resolved = previewChampionshipDecision({ championship: title, show, segment: match, decision: { ...decision, resolvedChampionNames: "Beta One & Beta Two" } });
    expect(resolved.blocked).toBe(false);
    expect(resolved.championship.currentChampions.map((champion) => champion.name)).toEqual(["Beta One", "Beta Two"]);
  });

  test("confirms a vacancy without guessing a replacement champion", () => {
    const show = reconciledShow();
    const match = createPlannedSegment("match");
    match.id = "vacancy-source";
    match.championshipId = "pwl-title";
    match.championship = "PWL Championship";
    match.championEntering = "Jay White";
    match.challenger = "PAC";
    match.workflowStatus = "Reconciled";
    match.reconciliation.actualMatch = actualMatch("No Contest");
    show.segments = [match];
    const title = singlesTitle();
    const session = synchronize(show, { championships: { championships: [title] } });
    const decision = { ...session.championshipDecisions[0], decision: "Vacated" as const, reason: "The champion could no longer continue." };
    const applied = applyChampionshipConsequence({ universe: { championships: [title] }, show, decision });
    expect(applied.universe.championships[0].status).toBe("Vacant");
    expect(applied.universe.championships[0].currentChampions).toEqual([]);
    expect(applied.show.segments[0].titleResultDecision).toBe("Vacated");
  });

  test("previews and confirms elimination-bracket advancement from a reconciled TEW winner", () => {
    const show = reconciledShow();
    const competition = competitionWithParticipants();
    const fixture = competition.fixtures.find((item) => item.participantAId && item.participantBId)!;
    const winner = competition.participants.find((item) => item.id === fixture.participantBId)!;
    const match = createPlannedSegment("match");
    match.id = "competition-match";
    match.competitionId = competition.id;
    match.competitionFixtureId = fixture.id;
    match.competitionRoundLabel = fixture.roundLabel;
    match.workflowStatus = "Reconciled";
    match.reconciliation.actualMatch = actualMatch(winner.name);
    show.segments = [match];
    const session = synchronize(show, { competitions: { competitions: [competition] } });
    const decision = session.competitionDecisions[0];
    expect(decision.proposedWinnerParticipantId).toBe(winner.id);
    const applied = applyCompetitionConsequence({ universe: { competitions: [competition] }, decision });
    const updated = applied.universe.competitions[0];
    expect(updated.fixtures.find((item) => item.id === fixture.id)?.winnerId).toBe(winner.id);
    expect(applied.decision.preview).toContain("advances");
  });

  test("previews and applies league standings rather than silently changing points", () => {
    const show = reconciledShow();
    const league = competitionWithParticipants("league", 3);
    const fixture = league.fixtures[0];
    const winner = league.participants.find((item) => item.id === fixture.participantAId)!;
    const match = createPlannedSegment("match");
    match.id = "league-match";
    match.competitionId = league.id;
    match.competitionFixtureId = fixture.id;
    match.competitionRoundLabel = fixture.roundLabel;
    match.workflowStatus = "Reconciled";
    match.reconciliation.actualMatch = actualMatch(winner.name);
    show.segments = [match];
    const session = synchronize(show, { competitions: { competitions: [league] } });
    const before = buildCompetitionStandings(league).find((row) => row.participantId === winner.id)!.points;
    const applied = applyCompetitionConsequence({ universe: { competitions: [league] }, decision: session.competitionDecisions[0] });
    const after = buildCompetitionStandings(applied.universe.competitions[0]).find((row) => row.participantId === winner.id)!.points;
    expect(after).toBeGreaterThan(before);
    expect(applied.decision.preview).toContain("points");
  });

  test("requires explicit milestone, booking-idea, and character-arc progress decisions", () => {
    const show = reconciledShow();
    const storyline = createTrackerStoryline(1);
    storyline.id = "storyline";
    storyline.name = "World Title Rivalry";
    const milestone = createStorylineMilestone(1);
    milestone.id = "milestone";
    milestone.title = "Contract Signing";
    milestone.assignedShowId = show.id;
    milestone.status = "Assigned";
    storyline.milestones = [milestone];
    const idea = createBookingIdea(1);
    idea.id = "idea";
    idea.title = "Contract Signing";
    idea.targetShowId = show.id;
    idea.status = "Scheduled";
    const worker = createWorkerProfile(1);
    worker.id = "worker";
    worker.displayName = "PAC";
    const arc = createWorkerArc(1);
    arc.id = "arc";
    arc.name = "Road to the Championship";
    arc.targetShowId = show.id;
    arc.status = "Active";
    worker.arcs = [arc];
    const session = synchronize(show, {
      storylines: [storyline],
      control: { ...emptyCreativeControlData(), ideas: [idea] },
      workers: { profiles: [worker], relationships: [] },
    });

    const milestoneResult = applyMilestoneConsequence({ storylines: [storyline], decision: { ...session.milestoneDecisions[0], decision: "Completed", note: "The contract was signed." } });
    expect(milestoneResult.storylines[0].milestones[0].status).toBe("Completed");
    const ideaResult = applyBookingIdeaConsequence({ control: { ...emptyCreativeControlData(), ideas: [idea] }, decision: { ...session.bookingIdeaDecisions[0], decision: "Completed", note: "The segment aired." } });
    expect(ideaResult.control.ideas[0].status).toBe("Completed");
    expect(() => applyArcConsequence({ workers: { profiles: [worker], relationships: [] }, decision: { ...session.arcDecisions[0], decision: "Turning Point", progressNote: "" } })).toThrow("Record what occurred");
    const arcResult = applyArcConsequence({ workers: { profiles: [worker], relationships: [] }, decision: { ...session.arcDecisions[0], decision: "Turning Point", progressNote: "PAC rejected the champion's shortcut." } });
    expect(arcResult.workers.profiles[0].arcs[0].turningPoint).toContain("PAC rejected");
  });

  test("rolls a grounded follow-up into a later show without choosing wrestlers or a winner", () => {
    const source = reconciledShow();
    const angle = createPlannedSegment("angle");
    angle.id = "source-angle";
    angle.title = "Opening Challenge";
    angle.workflowStatus = "Reconciled";
    angle.reconciliation.finalFollowUp = "The challenger signs the championship contract next week.";
    source.segments = [angle];
    const target = createPlannedShow(2);
    target.id = "show-2";
    target.name = "PWL Power Hour #2";
    target.date = "2026-08-10";
    const session = synchronize(source);
    const decision = {
      ...session.followUpDecisions[0],
      destination: "New Angle" as const,
      targetShowId: target.id,
      reason: "Use the next weekly episode.",
    };
    const applied = applyFollowUpConsequence({ shows: [source, target], schedule: emptyPromotionScheduleUniverse(), sourceShow: source, decision });
    const rolled = applied.shows.find((show) => show.id === target.id)!.segments[0];
    expect(rolled.title).toBe("Follow up: Opening Challenge");
    expect(rolled.type).toBe("angle");
    expect(rolled.workers).toEqual([]);
    expect(rolled.plannedWinner).toBe("");
    expect(applied.schedule.continuityDecisions).toHaveLength(1);
  });

  test("closes only after reviews checkpoints and consequence decisions are complete", () => {
    const show = reconciledShow();
    const angle = createPlannedSegment("angle");
    angle.id = "angle";
    angle.segmentOutput = "Planned output";
    angle.workflowStatus = "Reconciled";
    show.segments = [angle];
    let session = synchronize(show);
    session.segmentReviews[0] = {
      ...session.segmentReviews[0],
      status: "Reviewed",
      happenedAsPlanned: "Yes",
      finalNarrative: "Final output",
      outputItemId: "output",
      outputVersionId: "version",
    };
    const progress = buildWrapUpProgress(session, show);
    expect(progress.canClose).toBe(true);
    const report = buildShowClosureReport({ show, session, progress });
    const closed = closeWrapUpSession(session, report);
    expect(closed.status).toBe("Closed");
    expect(closed.closureReports[0].text).toContain("SHOW CLOSURE REPORT");
    expect(openWrapUpAmendment(closed)).toMatchObject({ status: "Amendment Open", amendmentCount: 1 });
  });

  test("stores a full pre-wrap recovery snapshot and migrates older reconciled shows as unreviewed", () => {
    const show = reconciledShow();
    const snapshot = capturePreWrapSnapshot({
      shows: [show], championships: emptyChampionshipUniverse(), competitions: emptyCompetitionUniverse(),
      storylines: [], control: emptyCreativeControlData(), workers: { profiles: [], relationships: [] },
      promotionSchedule: emptyPromotionScheduleUniverse(), outputLibrary: { items: [], structures: [], showPackets: [], settings: { activeTab: "library", searchQuery: "", typeFilter: "All", sourceFilter: "All", selectedItemId: "", selectedShowId: "", compareFromVersionId: "", compareToVersionId: "" } },
    });
    expect((parsePreWrapSnapshot(snapshot)?.shows as ReturnType<typeof reconciledShow>[])[0].name).toBe(show.name);
    const migrated = migrateShowsToWrapUp([show]);
    expect(migrated.sessions[0]).toMatchObject({ showId: show.id, status: "Not Reviewed" });
    expect(parseWrapUpUniverse(JSON.parse(JSON.stringify(migrated)) as unknown)).toEqual(migrated);
  });
});
