import { describe, expect, it } from "vitest";
import { mapTewTables } from "../src/tew/mapper";
import type { LoadedTable } from "../src/tew/types";

function fixtureTables(): LoadedTable[] {
  return [
    {
      name: "Previous_Shows",
      rows: [
        {
          UID: 10,
          Show_Name: "AEW Press Conference",
          Show_Date: new Date("2014-04-13T00:00:00.000Z"),
          Rating: 71,
          Attendance: 10500,
          Venue: "Yeungling Center",
          Company_Initials: "AEW",
        },
      ],
    },
    {
      name: "Match_Histories",
      rows: [
        {
          UID: 100,
          PreviousShowUID: 10,
          Match_Description: "Matt Jackson and Nick Jackson defeated Bobby Lashley and Shelton Benjamin",
          Rating: 73,
          Which_Side_Won: "Side 1",
          Match_Time: "17:50",
          Extra_Notes: "A storyline-driving finish.",
        },
      ],
    },
    {
      name: "Match_Histories_Wrestlers",
      rows: [
        { MatchHistoryUID: 100, WorkerUID: 1, Side: "Side 1" },
        { MatchHistoryUID: 100, WorkerUID: 2, Side: "Side 2" },
      ],
    },
    {
      name: "Workers",
      rows: [
        { UID: 1, Name: "Matt Jackson" },
        { UID: 2, Name: "Bobby Lashley" },
      ],
    },
    {
      name: "Player_Storylines",
      rows: [
        {
          UID: 50,
          Name: "The Elite vs. The Hurt Business",
          Description: "A fight for control of the promotion.",
          Status: "Active",
          Heat: 78,
        },
      ],
    },
    {
      name: "tblStorylineInvolved",
      rows: [
        { StorylineUID: 50, WorkerUID: 1, Storyline_Role: "Protagonist" },
        { StorylineUID: 50, WorkerUID: 2, Storyline_Role: "Antagonist" },
      ],
    },
  ];
}

describe("mapTewTables", () => {
  it("reconstructs shows, matches, workers, participants, and storylines", () => {
    const result = mapTewTables(fixtureTables());

    expect(result.workers.map((worker) => worker.name)).toEqual([
      "Bobby Lashley",
      "Matt Jackson",
    ]);
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0]).toMatchObject({
      id: "10",
      name: "AEW Press Conference",
      rating: 71,
      attendance: 10500,
    });
    expect(result.shows[0].matches).toHaveLength(1);
    expect(result.shows[0].matches[0]).toMatchObject({
      id: "100",
      rating: 73,
      winner: "Side 1",
      matchTime: "17:50",
    });
    expect(result.shows[0].matches[0].workers.map((worker) => worker.name)).toEqual([
      "Matt Jackson",
      "Bobby Lashley",
    ]);

    expect(result.storylines).toHaveLength(1);
    expect(result.storylines[0]).toMatchObject({
      id: "50",
      name: "The Elite vs. The Hurt Business",
      heat: 78,
      status: "Active",
    });
    expect(result.storylines[0].workers.map((worker) => worker.role)).toEqual([
      "Protagonist",
      "Antagonist",
    ]);
    expect(result.diagnostics.warnings).toEqual([]);
  });

  it("matches table and field names without depending on underscores or casing", () => {
    const result = mapTewTables([
      {
        name: "previousshows",
        rows: [{ id: 1, showname: "Test Show", showdate: "2026-07-31", showrating: "65" }],
      },
      {
        name: "matchhistories",
        rows: [{ id: 2, showid: 1, matchresult: "A defeated B", matchrating: "70" }],
      },
      {
        name: "matchhistorywrestlers",
        rows: [],
      },
      {
        name: "storylines",
        rows: [{ id: 3, title: "Test Story", momentum: 60 }],
      },
      {
        name: "workers",
        rows: [{ id: 4, workername: "Test Worker" }],
      },
    ]);

    expect(result.shows[0].name).toBe("Test Show");
    expect(result.shows[0].rating).toBe(65);
    expect(result.shows[0].matches[0].description).toBe("A defeated B");
    expect(result.storylines[0].name).toBe("Test Story");
    expect(result.workers[0].name).toBe("Test Worker");
  });

  it("reports missing TEW history tables instead of inventing data", () => {
    const result = mapTewTables([]);

    expect(result.workers).toEqual([]);
    expect(result.shows).toEqual([]);
    expect(result.storylines).toEqual([]);
    expect(result.diagnostics.matchedTables.shows).toBeNull();
    expect(result.diagnostics.warnings).toContain("No supported previous-show table was found.");
    expect(result.diagnostics.warnings).toContain("No supported match-history table was found.");
    expect(result.diagnostics.warnings).toContain("No supported storyline table was found.");
    expect(result.diagnostics.warnings).toContain(
      "No supported worker table was found; planner worker selection will require manual entry.",
    );
  });

  it("keeps unlinked matches out of fabricated shows and reports them", () => {
    const result = mapTewTables([
      { name: "Previous_Shows", rows: [{ UID: 1, Name: "Known Show" }] },
      {
        name: "Match_Histories",
        rows: [{ UID: 2, PreviousShowUID: 999, Match_Description: "Unlinked Match" }],
      },
    ]);

    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].matches).toEqual([]);
    expect(result.diagnostics.orphanMatchCount).toBe(1);
  });
});
