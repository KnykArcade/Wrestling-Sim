import { describe, expect, test } from "vitest";
import {
  createPlannedSegment,
  createPlannedShow,
  duplicatePlannedShow,
  movePlannedSegment,
  totalPlannedMinutes,
} from "../src/planner/model";
import {
  createPlannerBackup,
  loadPlannedShows,
  parsePlannerBackup,
  savePlannedShows,
} from "../src/planner/storage";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("planned show workspace", () => {
  test("creates a show and calculates planned card time", () => {
    const show = createPlannedShow(1);
    const match = createPlannedSegment("match");
    const angle = createPlannedSegment("angle");

    show.segments = [match, angle];

    expect(show.name).toBe("Untitled Show 1");
    expect(match.title).toBe("Untitled Match");
    expect(angle.title).toBe("Untitled Angle");
    expect(totalPlannedMinutes(show)).toBe(17);
  });

  test("moves segments without allowing them outside the card", () => {
    const first = createPlannedSegment("angle");
    const second = createPlannedSegment("match");
    const original = [first, second];

    expect(movePlannedSegment(original, second.id, -1).map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(movePlannedSegment(original, first.id, -1)).toBe(original);
  });

  test("duplicates shows and all segment identifiers", () => {
    const show = createPlannedShow(1);
    show.segments = [createPlannedSegment("match"), createPlannedSegment("angle")];

    const duplicate = duplicatePlannedShow(show);

    expect(duplicate.id).not.toBe(show.id);
    expect(duplicate.name).toBe(`${show.name} Copy`);
    expect(duplicate.segments.map((item) => item.id)).not.toEqual(
      show.segments.map((item) => item.id),
    );
  });

  test("saves, loads, exports, and imports planned shows", () => {
    const storage = new MemoryStorage();
    const show = createPlannedShow(1);
    show.segments = [createPlannedSegment("match")];

    savePlannedShows(storage, [show]);
    expect(loadPlannedShows(storage)).toEqual([show]);

    const backup = createPlannerBackup([show]);
    expect(parsePlannerBackup(JSON.stringify(backup))).toEqual([show]);
  });

  test("rejects unsupported backup files", () => {
    expect(() => parsePlannerBackup('{"version":2,"shows":[]}')).toThrow(
      "not a supported TEW Story Tracker backup",
    );
  });
});
