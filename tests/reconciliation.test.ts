import { describe, expect, test } from "vitest";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import {
  finalizeReconciliation,
  linkPlannedShow,
  rankMatchCandidates,
  rankShowCandidates,
  reopenReconciliation,
  setSegmentActualMatch,
  unlinkPlannedShow,
} from "../src/planner/reconciliation";
import type { MatchRecord, ShowRecord } from "../src/tew/types";

function actualMatch(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id: "match-1",
    showId: "show-1",
    description: "Bret Hart defeated Shawn Michaels by submission",
    rating: 88,
    winner: "Side 1",
    matchTime: "22:14",
    notes: "Owen Hart interfered.",
    placement: "Main Show",
    workers: [
      { id: "1", name: "Bret Hart", role: "Wrestler", side: "Side 1" },
      { id: "2", name: "Shawn Michaels", role: "Wrestler", side: "Side 2" },
    ],
    ...overrides,
  };
}

function actualShow(overrides: Partial<ShowRecord> = {}): ShowRecord {
  return {
    id: "show-1",
    name: "Monday Night Wrestling",
    date: "2026-08-01T00:00:00.000Z",
    rating: 84,
    attendance: 15000,
    venue: "Civic Arena",
    company: "WWE",
    broadcast: "USA Network",
    matches: [actualMatch()],
    ...overrides,
  };
}

describe("post-show reconciliation", () => {
  test("ranks the matching TEW show above unrelated history", () => {
    const planned = createPlannedShow(1);
    planned.name = "Monday Night Wrestling";
    planned.date = "2026-08-01";
    planned.company = "WWE";
    planned.segments = [createPlannedSegment("match")];

    const unrelated = actualShow({ id: "old", name: "Saturday Event", date: "2025-01-01" });
    const ranked = rankShowCandidates(planned, [unrelated, actualShow()]);

    expect(ranked[0].item.id).toBe("show-1");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  test("uses participants and placement to suggest the correct match", () => {
    const segment = createPlannedSegment("match");
    segment.title = "Bret Hart vs Shawn Michaels";
    segment.workers = [
      { id: "1", name: "Bret Hart", role: "Wrestler", side: "Side 1", source: "tew" },
      { id: "2", name: "Shawn Michaels", role: "Wrestler", side: "Side 2", source: "tew" },
    ];

    const wrong = actualMatch({ id: "wrong", description: "Undertaker defeated Kane", workers: [] });
    const ranked = rankMatchCandidates(segment, [wrong, actualMatch()], 0);

    expect(ranked[0].item.id).toBe("match-1");
    expect(ranked[0].score).toBeGreaterThan(50);
  });

  test("links actual results while preserving the original plan", () => {
    const planned = createPlannedShow(1);
    const match = createPlannedSegment("match");
    match.matchStory = "The original planned story remains unchanged.";
    match.workers = [
      { id: "1", name: "Bret Hart", role: "Wrestler", side: "Side 1", source: "tew" },
      { id: "2", name: "Shawn Michaels", role: "Wrestler", side: "Side 2", source: "tew" },
    ];
    const angle = createPlannedSegment("angle");
    angle.segmentOutput = "The planned interview output.";
    planned.segments = [match, angle];

    const linked = linkPlannedShow(planned, actualShow(), "TEW9.mdb");

    expect(linked.reconciliation?.linkedShowId).toBe("show-1");
    expect(linked.segments[0].matchStory).toBe("The original planned story remains unchanged.");
    expect(linked.segments[0].reconciliation.actualMatch?.rating).toBe(88);
    expect(linked.segments[1].reconciliation.finalNarrative).toBe("The planned interview output.");
  });

  test("supports manual match overrides and final enhanced history", () => {
    const planned = createPlannedShow(1);
    planned.segments = [createPlannedSegment("match")];
    const linked = linkPlannedShow(planned, actualShow(), "TEW9.mdb");
    const replacement = actualMatch({ id: "replacement", rating: 74 });
    linked.segments[0] = setSegmentActualMatch(linked.segments[0], replacement);
    linked.segments[0].reconciliation.changes = "The finish changed during booking.";

    const finalized = finalizeReconciliation(linked);

    expect(finalized.status).toBe("Reconciled");
    expect(finalized.segments[0].workflowStatus).toBe("Reconciled");
    expect(finalized.segments[0].reconciliation.actualMatch?.id).toBe("replacement");
    expect(finalized.segments[0].reconciliation.changes).toContain("finish changed");
    expect(finalized.reconciliation?.completedAt).not.toBe("");

    const reopened = reopenReconciliation(finalized);
    expect(reopened.status).toBe("Completed");
    expect(reopened.segments[0].reconciliation.actualMatch?.id).toBe("replacement");
  });

  test("can unlink actual data without deleting the planned card", () => {
    const planned = createPlannedShow(1);
    const segment = createPlannedSegment("match");
    segment.matchStory = "Keep this story.";
    planned.segments = [segment];

    const unlinked = unlinkPlannedShow(linkPlannedShow(planned, actualShow(), "TEW9.mdb"));

    expect(unlinked.reconciliation).toBeNull();
    expect(unlinked.segments[0].reconciliation.actualMatch).toBeNull();
    expect(unlinked.segments[0].matchStory).toBe("Keep this story.");
  });
});
