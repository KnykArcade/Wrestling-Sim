import { describe, expect, test } from "vitest";
import { confirmStartingUniverse, createStartingUniverse } from "../src/startingUniverse/model";
import { activateStartingUniverseData, emptyStartingUniverseActivationState } from "../src/startingUniverse/activation";
import { calculateWorkbookMetrics, IMPORTED_APPROACH_FORMULAS } from "../src/startingUniverse/formulas";
import type { ParsedTewExport } from "../src/startingUniverse/parser";
import type { StartingUniverseContract, StartingUniverseWorker } from "../src/startingUniverse/types";
import { MATCH_APPROACHES } from "../src/matchEngine/catalog";
import { emptyMatchEngineUniverse } from "../src/matchEngine/storage";
import { emptyWorkerUniverse } from "../src/workers/storage";
import { emptyProfileLibraryUniverse } from "../src/profileLibrary/model";
import { emptyChampionshipUniverse } from "../src/championships/storage";
import { emptyPromotionScheduleUniverse } from "../src/schedule/model";
import { emptySnapshotVaultUniverse } from "../src/snapshotVault/model";
import { ensurePlayableFirstDay, firstDayReadiness } from "../src/startingUniverse/quickStart";

function importedWorld(): ParsedTewExport {
  return {
    format: "TEW ZIP CSV",
    fileName: "quick-load.zip",
    fileSize: 1024,
    fingerprint: "quick-load-fixture",
    tableNames: ["Companies", "Workers", "Contracts", "Tag_Teams"],
    warnings: [],
    tables: {
      Companies: [
        { UID: "1", Name: "Pro Wrestling League", Initials: "PWL", Profile: "A long promotional biography that must never become the company name in a booking control.", Currently_Open: 1, User_Controlled: 1 },
        { UID: "2", Name: "Other Wrestling", Initials: "OTHER", Profile: "Another company biography.", Currently_Open: 1, User_Controlled: 0 },
      ],
      Workers: [
        { UID: "w1", Name: "First Wrestler", Active: 1, Wrestler: 1, Stamina: 70, Basics: 70 },
        { UID: "w2", Name: "Second Wrestler", Active: 1, Wrestler: 1, Stamina: 65, Basics: 65 },
      ],
      Contracts: [
        { CompanyUID: "1", CompanyName: "Pro Wrestling League", WorkerUID: "w1", WorkerName: "First Wrestler", Wrestler: 1 },
        { CompanyUID: "1", CompanyName: "Pro Wrestling League", WorkerUID: "w2", WorkerName: "Second Wrestler", Wrestler: 1 },
      ],
      Tag_Teams: [
        { UID: "global", Name: "Global Name", CompanyUID: "0", Worker1: "w1", Worker2: "w2", Active: 1, Experience: 90 },
        { UID: "company", Name: "PWL Team", CompanyUID: "1", CompanyName: "Pro Wrestling League", Worker1: "w1", Worker2: "w2", Active: 1, Experience: 50 },
      ],
    },
  };
}

function activationWorld(): ParsedTewExport {
  const base = importedWorld();
  return {
    ...base,
    tableNames: [...base.tableNames, "Save_Game_Info", "Title_Belts", "TV_Shows", "Stables", "Worker_Relationships"],
    tables: {
      ...base.tables,
      Save_Game_Info: [{ Current_Date: "01/02/2019", Game_Start: "01/01/2019" }],
      Workers: [
        { UID: "w1", Name: "Roderick Strong", Active: 1, Wrestler: 1, Style: "Technician", Stamina: 70, Basics: 70 },
        { UID: "w2", Name: "Trevor Mann", Active: 1, Wrestler: 1, Style: "High Flyer", Stamina: 65, Basics: 65 },
        { UID: "s1", Name: "Senior Official", Active: 1, Referee: 1, Basics: 80 },
      ],
      Contracts: [
        { CompanyUID: "1", CompanyName: "Pro Wrestling League", WorkerUID: "w1", WorkerName: "Roderick Strong", Name: "Roderick Strong", Wrestler: 1, Babyface: 0, Gimmick: "Technical master", Brand: "Power Hour", Momentum: 74 },
        { CompanyUID: "1", CompanyName: "Pro Wrestling League", WorkerUID: "w2", WorkerName: "Trevor Mann", Name: "Ricochet", Wrestler: 1, Babyface: 1, Gimmick: "One and only", Brand: "Power Hour", Momentum: 81 },
        { CompanyUID: "1", CompanyName: "Pro Wrestling League", WorkerUID: "s1", WorkerName: "Senior Official", Name: "Senior Official", Referee: 1 },
      ],
      Title_Belts: [{ UID: "title-1", CompanyUID: "1", CompanyName: "Pro Wrestling League", Name: "PWL World Championship", BeltStyle: "Singles", BeltLevel: "World", Active: 1, Holder1: "w1", HolderName1: "Roderick Strong", Defences: 2, Reign_Began: "12/01/2018", Last_Defence: "12/29/2018" }],
      TV_Shows: [{ CompanyUID: "1", Company_Name: "Pro Wrestling League", Name: "PWL Power Hour", Length: 60, Brand: "Power Hour", Showday: "Wednesday", Currently_On_Air: 1, Dormant: 0 }],
      Tag_Teams: [{ UID: "team-1", Name: "Technical Flight", CompanyUID: "1", CompanyName: "Pro Wrestling League", Worker1: "w1", WorkerName1: "Roderick Strong", Worker2: "w2", WorkerName2: "Ricochet", Active: 1, Experience: 70, Finisher: "End of Heartache" }],
      Stables: [{ CompanyUID: "1", CompanyName: "Pro Wrestling League", Name: "PWL Originals", Active: 1, Member1: "w1", MemberName1: "Roderick Strong", Role1: "Leader", Member2: "w2", MemberName2: "Ricochet", Role2: "Member" }],
      Worker_Relationships: [{ WorkerUID1: "w1", Worker1_Name: "Roderick Strong", WorkerUID2: "w2", Worker2_Name: "Trevor Mann", Family_Relationship: "Cousins" }],
    },
  };
}

function emptyActivationData() {
  return {
    matchEngine: emptyMatchEngineUniverse(),
    workers: emptyWorkerUniverse(),
    profiles: emptyProfileLibraryUniverse(),
    championships: emptyChampionshipUniverse(),
    schedule: emptyPromotionScheduleUniverse(),
    vault: emptySnapshotVaultUniverse(),
    activation: emptyStartingUniverseActivationState(),
  };
}

describe("Phase 6B9 quick universe loading", () => {
  test("automatically prepares imported company data without review acknowledgements", () => {
    const universe = createStartingUniverse(importedWorld());

    expect(universe.playableCompanyId).toBe("1");
    expect(universe.companies.map((company) => company.name)).toEqual(["Other Wrestling", "Pro Wrestling League"]);
    expect(universe.companies.find((company) => company.id === "1")?.profile).toContain("promotional biography");
    expect(universe.review.roster).toHaveLength(2);
    expect(universe.review.roster.every((worker) => worker.included && worker.rosterClass === "Wrestler")).toBe(true);
    expect(universe.review.tagTeams[0]).toMatchObject({ selectedVariantId: "company", gameName: "PWL Team", acknowledged: true });
    expect(universe.review).toMatchObject({ rosterAcknowledged: true, titlesAcknowledged: true, teamsAcknowledged: true });
    expect(confirmStartingUniverse(universe).status).toBe("Confirmed");
  });

  test("still blocks a universe that cannot stage a match", () => {
    const universe = createStartingUniverse({
      ...importedWorld(),
      tables: { ...importedWorld().tables, Contracts: [importedWorld().tables.Contracts![0]] },
    });

    expect(() => confirmStartingUniverse(universe)).toThrow("at least two included wrestlers");
  });
});

describe("Phase 6B10A canonical calculation foundation", () => {
  test("derives all sixteen imported formulas from the canonical approach catalog", () => {
    expect(IMPORTED_APPROACH_FORMULAS).toHaveLength(16);
    for (const formula of IMPORTED_APPROACH_FORMULAS) {
      const canonical = MATCH_APPROACHES.find((approach) => approach.id === formula.currentMatchEngineId);
      expect(canonical, formula.id).toBeDefined();
      expect(formula.terms).toEqual(canonical!.formula.map((term) => ({ source: term.skill, weight: term.weight })));
    }
  });

  test("uses the correct 12.6 popularity divisor", () => {
    const skills = Object.fromEntries(["Aerial", "Athleticism", "Basics", "Brawling", "Charisma", "Consistency", "Flashiness", "Hardcore", "Menace", "Power", "Psychology", "Puroresu", "Resilience", "Safety", "Selling", "Stamina", "Technical", "Toughness"].map((skill) => [skill, 50]));
    const popularity = Object.fromEntries(["Great_Lakes", "Mid_Atlantic", "Mid_South", "Mid_West", "New_England", "North_West", "South_East", "South_West", "Tri_State", "Puerto_Rico", "Hawaii"].map((region) => [region, 50]));
    const worker = { skills, popularity, starQuality: 50, experience: 50, looks: 50, reputation: 50, respect: 50, physical: { head: 100, body: 100, arms: 100, legs: 100 } } as unknown as StartingUniverseWorker;
    const contract = { gimmickRating: 50, perception: "Well Known" } as StartingUniverseContract;
    expect(calculateWorkbookMetrics(worker, contract).popularityRating).toBe(50);
  });
});

describe("Phase 6B12 complete Starting Universe activation", () => {
  test("activates company, date, roster, profiles, titles, television, teams, stables, and relationships", () => {
    const record = confirmStartingUniverse(createStartingUniverse(activationWorld()));
    const result = activateStartingUniverseData(record, emptyActivationData());

    expect(result.activation).toMatchObject({ activeUniverseId: record.id, activeCompanyId: "1", activeCompanyName: "Pro Wrestling League", gameDate: "2019-01-02" });
    expect(result.vault.promotion).toMatchObject({ status: "Completed", promotionName: "Pro Wrestling League", abbreviation: "PWL", defaultWeeklyShow: "PWL Power Hour", calendarStartDate: "2019-01-02" });
    expect(result.matchEngine.profiles).toHaveLength(2);
    expect(result.matchEngine.profiles.find((profile) => profile.workerId === "w2")).toMatchObject({ workerName: "Ricochet", momentum: 81 });
    expect(result.workers.profiles).toHaveLength(3);
    expect(result.workers.profiles.find((profile) => profile.linkedTewWorkerId === "w2")).toMatchObject({ displayName: "Ricochet", alignment: "Face", brand: "Power Hour", gimmickSummary: "One and only" });
    expect(result.profiles.records).toHaveLength(2);
    expect(result.profiles.records.every((profile) => profile.identity.status === "Confirmed")).toBe(true);
    expect(result.championships.championships[0]).toMatchObject({ name: "PWL World Championship", status: "Active", defenses: 2, dateWon: "2018-12-01" });
    expect(result.championships.championships[0].currentChampions[0].name).toBe("Roderick Strong");
    expect(result.schedule.series[0]).toMatchObject({ name: "PWL Power Hour", company: "Pro Wrestling League", defaultMinutes: 60, defaultDayOfWeek: 3, startDate: "2019-01-02" });
    expect(result.workers.relationships.some((relationship) => relationship.type === "Tag Partner" && relationship.publicDescription === "Technical Flight")).toBe(true);
    expect(result.workers.relationships.some((relationship) => relationship.type === "Stable Member" && relationship.publicDescription === "PWL Originals")).toBe(true);
    expect(result.workers.relationships.some((relationship) => relationship.type === "Family")).toBe(true);
  });

  test("repeat activation is duplicate-safe and preserves later user edits", () => {
    const record = confirmStartingUniverse(createStartingUniverse(activationWorld()));
    const first = activateStartingUniverseData(record, emptyActivationData());
    const edited = {
      ...first,
      workers: { ...first.workers, profiles: first.workers.profiles.map((profile, index) => index === 0 ? { ...profile, displayName: "My Custom Name" } : profile) },
      championships: { championships: first.championships.championships.map((title) => ({ ...title, name: "My Custom Championship" })) },
    };
    const second = activateStartingUniverseData(record, edited);

    expect(second.workers.profiles).toHaveLength(3);
    expect(second.matchEngine.profiles).toHaveLength(2);
    expect(second.championships.championships).toHaveLength(1);
    expect(second.schedule.series).toHaveLength(1);
    expect(second.workers.profiles[0].displayName).toBe("My Custom Name");
    expect(second.championships.championships[0].name).toBe("My Custom Championship");
    expect(second.report.categories["Worker Hub"].created).toBe(0);
    expect(second.report.categories["Championships"].preserved).toBe(1);
  });

  test("updates an untouched imported record when its reviewed source value changes", () => {
    const record = confirmStartingUniverse(createStartingUniverse(activationWorld()));
    const first = activateStartingUniverseData(record, emptyActivationData());
    const changed = { ...record, review: { ...record.review, titles: record.review.titles.map((title) => ({ ...title, gameName: "PWL Crown Championship" })) } };
    const second = activateStartingUniverseData(changed, first);

    expect(second.championships.championships[0].name).toBe("PWL Crown Championship");
    expect(second.report.categories["Championships"].updated).toBe(1);
  });
});

describe("Phase 6B13 playable first day", () => {
  test("creates one blank episode on the imported weekday and preserves it on repeat activation", () => {
    const record = confirmStartingUniverse(createStartingUniverse(activationWorld()));
    const activated = activateStartingUniverseData(record, emptyActivationData());
    const first = ensurePlayableFirstDay(activated.activation, activated.schedule, []);

    expect(first.created).toBe(true);
    expect(first.shows).toHaveLength(1);
    expect(first.nextShow).toMatchObject({ name: "PWL Power Hour #1", date: "2019-01-02", company: "Pro Wrestling League", showType: "Television", expectedMinutes: 60, segments: [] });
    expect(first.schedule.links[0]).toMatchObject({ showId: first.nextShow!.id, seriesId: activated.schedule.series[0].id, episodeNumber: 1, originalDate: "2019-01-02" });
    expect(firstDayReadiness(first.nextShow)).toEqual({ ready: false, blockers: ["Add at least one match or angle to the card."] });

    const editedShows = first.shows.map((show) => ({ ...show, name: "My Edited Power Hour", notes: "Manual booking notes" }));
    const repeated = ensurePlayableFirstDay(activated.activation, first.schedule, editedShows);
    expect(repeated.created).toBe(false);
    expect(repeated.shows).toHaveLength(1);
    expect(repeated.nextShow).toMatchObject({ name: "My Edited Power Hour", notes: "Manual booking notes" });
  });

  test("moves the first episode forward to the imported television weekday", () => {
    const record = confirmStartingUniverse(createStartingUniverse({
      ...activationWorld(),
      tables: { ...activationWorld().tables, Save_Game_Info: [{ Current_Date: "01/03/2019" }] },
    }));
    const activated = activateStartingUniverseData(record, emptyActivationData());
    const result = ensurePlayableFirstDay(activated.activation, activated.schedule, []);
    expect(result.nextShow?.date).toBe("2019-01-09");
  });
});
