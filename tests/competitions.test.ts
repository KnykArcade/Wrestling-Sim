import { describe, expect, test } from "vitest";
import {
  addFixtureToPlannedShow,
  buildCompetitionStandings,
  competitionWarnings,
  createCompetitionParticipant,
  createCompetitionTemplate,
  generateCompetitionStructure,
  recordCompetitionResult,
  resetCompetitionResult,
  syncCompetitionFromPlannedShows,
} from "../src/competitions/model";
import {
  COMPETITION_STORAGE_KEY,
  loadCompetitionUniverse,
  saveCompetitionUniverse,
} from "../src/competitions/storage";
import { createPlannedShow } from "../src/planner/model";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function withParticipants(count: number, template: "world-classic" | "world-tag-classic" | "league" = "world-classic") {
  const competition = createCompetitionTemplate(template);
  competition.participants = Array.from({ length: count }, (_, index) => createCompetitionParticipant(
    template === "world-tag-classic" ? `Team ${index + 1}` : `Wrestler ${index + 1}`,
    competition.participantType,
    { seed: index + 1, memberNames: template === "world-tag-classic" ? [`A${index + 1}`, `B${index + 1}`] : [`Wrestler ${index + 1}`] },
  ));
  return competition;
}

describe("Phase 4D competition management", () => {
  test("creates the approved World Classic traditions and tag template", () => {
    const singles = createCompetitionTemplate("world-classic");
    const tags = createCompetitionTemplate("world-tag-classic");
    expect(singles.name).toBe("PWL World Classic");
    expect(singles.kind).toBe("Classic");
    expect(singles.traditions).toContain("ceremonial jacket");
    expect(tags.name).toBe("PWL World Tag Classic");
    expect(tags.participantType).toBe("Tag Team");
    expect(tags.championPresentation).toContain("jacket handoff");
  });

  test("generates a seeded elimination bracket with byes", () => {
    const generated = generateCompetitionStructure(withParticipants(6));
    expect(generated.fixtures).toHaveLength(7);
    expect(generated.fixtures.filter((fixture) => fixture.roundNumber === 1)).toHaveLength(4);
    expect(generated.fixtures.filter((fixture) => fixture.status === "Bye")).toHaveLength(2);
    expect(generated.fixtures.find((fixture) => fixture.roundLabel === "Final")).toBeDefined();
    expect(generated.status).toBe("Active");
  });

  test("advances elimination winners and crowns the final winner", () => {
    let competition = generateCompetitionStructure(withParticipants(4));
    const semifinals = competition.fixtures.filter((fixture) => fixture.roundLabel === "Semifinal");
    competition = recordCompetitionResult(competition, semifinals[0].id, "Decision", semifinals[0].participantAId);
    competition = recordCompetitionResult(competition, semifinals[1].id, "Decision", semifinals[1].participantBId);
    const final = competition.fixtures.find((fixture) => fixture.roundLabel === "Final")!;
    expect(final.participantAId).toBe(semifinals[0].participantAId);
    expect(final.participantBId).toBe(semifinals[1].participantBId);
    competition = recordCompetitionResult(competition, final.id, "Decision", final.participantAId);
    expect(competition.championParticipantId).toBe(final.participantAId);
    expect(competition.runnerUpParticipantId).toBe(final.participantBId);
    expect(competition.status).toBe("Completed");
    expect(competition.participants.find((participant) => participant.id === final.participantAId)?.status).toBe("Champion");
  });

  test("resets an earlier result and clears dependent rounds", () => {
    let competition = generateCompetitionStructure(withParticipants(4));
    const semifinal = competition.fixtures.find((fixture) => fixture.roundLabel === "Semifinal")!;
    competition = recordCompetitionResult(competition, semifinal.id, "Decision", semifinal.participantAId);
    expect(competition.fixtures.find((fixture) => fixture.roundLabel === "Final")?.participantAId).toBe(semifinal.participantAId);
    competition = resetCompetitionResult(competition, semifinal.id);
    expect(competition.fixtures.find((fixture) => fixture.roundLabel === "Final")?.participantAId).toBe("");
    expect(competition.fixtures.find((fixture) => fixture.id === semifinal.id)?.winnerId).toBe("");
  });

  test("generates round-robin and double-round-robin schedules", () => {
    const league = withParticipants(4, "league");
    const single = generateCompetitionStructure(league);
    expect(single.fixtures).toHaveLength(6);
    expect(new Set(single.fixtures.map((fixture) => fixture.roundNumber)).size).toBe(3);
    const double = generateCompetitionStructure({ ...league, format: "Double Round Robin" });
    expect(double.fixtures).toHaveLength(12);
    expect(new Set(double.fixtures.map((fixture) => fixture.roundNumber)).size).toBe(6);
  });

  test("calculates transparent league standings", () => {
    let league = generateCompetitionStructure(withParticipants(3, "league"));
    const [first, second, third] = league.fixtures;
    league = recordCompetitionResult(league, first.id, "Decision", first.participantAId);
    league = recordCompetitionResult(league, second.id, "Draw");
    league = recordCompetitionResult(league, third.id, "Decision", third.participantBId);
    const standings = buildCompetitionStandings(league);
    expect(standings).toHaveLength(3);
    expect(standings[0].points).toBeGreaterThanOrEqual(standings[1].points);
    expect(standings.reduce((sum, row) => sum + row.played, 0)).toBe(6);
    expect(standings.reduce((sum, row) => sum + row.draws, 0)).toBe(2);
  });

  test("creates one planned match per fixture and prevents duplicate scheduling", () => {
    const show = createPlannedShow(1);
    let competition = generateCompetitionStructure(withParticipants(4));
    const fixture = competition.fixtures.find((item) => item.participantAId && item.participantBId)!;
    const result = addFixtureToPlannedShow(competition, fixture.id, show.id, [show]);
    competition = result.competition;
    expect(result.created).toBe(true);
    expect(result.shows[0].segments).toHaveLength(1);
    expect(result.shows[0].segments[0]).toMatchObject({ competitionId: competition.id, competitionFixtureId: fixture.id, competitionRoundLabel: fixture.roundLabel });
    expect(result.shows[0].segments[0].workers.length).toBe(2);
    const duplicate = addFixtureToPlannedShow(competition, fixture.id, show.id, result.shows);
    expect(duplicate.created).toBe(false);
    expect(duplicate.shows[0].segments).toHaveLength(1);
  });

  test("syncs a reconciled TEW winner into the bracket", () => {
    const show = createPlannedShow(1);
    let competition = generateCompetitionStructure(withParticipants(4));
    const fixture = competition.fixtures.find((item) => item.participantAId && item.participantBId)!;
    const scheduled = addFixtureToPlannedShow(competition, fixture.id, show.id, [show]);
    competition = scheduled.competition;
    const winner = competition.participants.find((participant) => participant.id === fixture.participantBId)!;
    scheduled.shows[0].segments[0].reconciliation.actualMatch = {
      id: "actual-1",
      description: "Tournament match",
      rating: 80,
      winner: winner.name,
      matchTime: "14:22",
      notes: "",
      placement: "Main Show",
      workers: [],
    };
    const synced = syncCompetitionFromPlannedShows(competition, scheduled.shows);
    expect(synced.synced).toBe(1);
    expect(synced.competition.fixtures.find((item) => item.id === fixture.id)?.winnerId).toBe(winner.id);
  });

  test("reports missing structures and deleted planned links", () => {
    const competition = withParticipants(4);
    expect(competitionWarnings(competition).some((warning) => warning.id === "structure-not-generated")).toBe(true);
    const generated = generateCompetitionStructure(competition);
    const fixture = generated.fixtures.find((item) => item.participantAId && item.participantBId)!;
    fixture.plannedSegmentId = "missing-segment";
    expect(competitionWarnings(generated, []).some((warning) => warning.id === `missing-segment-${fixture.id}`)).toBe(true);
  });

  test("persists the competition universe", () => {
    const storage = new MemoryStorage();
    const universe = { competitions: [generateCompetitionStructure(withParticipants(4))] };
    saveCompetitionUniverse(storage, universe);
    expect(storage.getItem(COMPETITION_STORAGE_KEY)).toContain("PWL World Classic");
    expect(loadCompetitionUniverse(storage)).toEqual(universe);
  });
});
