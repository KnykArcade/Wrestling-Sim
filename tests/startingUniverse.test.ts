import { describe, expect, test } from "vitest";
import { confirmStartingUniverse, createStartingUniverse } from "../src/startingUniverse/model";
import type { ParsedTewExport } from "../src/startingUniverse/parser";

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
        { UID: "1", Initials: "PWL", Profile: "Pro Wrestling League", Currently_Open: 1, User_Controlled: 1 },
        { UID: "2", Initials: "OTHER", Profile: "Other Wrestling", Currently_Open: 1, User_Controlled: 0 },
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

describe("Phase 6B9 quick universe loading", () => {
  test("automatically prepares imported company data without review acknowledgements", () => {
    const universe = createStartingUniverse(importedWorld());

    expect(universe.playableCompanyId).toBe("1");
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
