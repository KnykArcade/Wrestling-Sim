import { describe, expect, test } from "vitest";
import {
  canCompleteLiveCard,
  completeAngleCorrection,
  completeAngleSegment,
  completeLiveCard,
  createLiveCardSession,
  insertGroundedAngle,
  lockMatchResult,
  liveCardReadiness,
  nextUnfinishedMatchId,
  nextUnfinishedSegmentId,
  openSegmentCorrection,
  selectLiveCardSegment,
  startLiveCardSession,
  synchronizeLiveCardSession,
} from "../src/liveCard/model";
import { emptyLiveCardUniverse } from "../src/liveCard/model";
import { parseLiveCardUniverse, upsertLiveCardSession } from "../src/liveCard/storage";
import type { MatchResolutionRecord, MatchResolutionUniverse } from "../src/matchResolution/types";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";

function acceptedResolution(showId: string, segmentId: string): MatchResolutionRecord {
  return {
    id: "resolution-1",
    showId,
    showName: "PWL Power Hour",
    segmentId,
    segmentTitle: "Jay White vs PAC",
    setup: {
      showId,
      showName: "PWL Power Hour",
      showDate: "2019-01-08",
      segmentId,
      segmentTitle: "Jay White vs PAC",
      matchType: "1 vs. 1",
      durationMinutes: 18,
      aimId: "competitive-tv-match",
      importance: "Feature",
      championship: "",
      competitionRound: "",
      chemistry: 0,
      volatility: 8,
      workers: [],
    },
    attempts: [{
      id: "attempt-1",
      number: 1,
      seed: "live-card",
      setupFingerprint: "fingerprint",
      setupChangeReason: "",
      calculationVersion: "test",
      generatedAt: "2019-01-08T20:00:00.000Z",
      status: "Accepted",
      workerResults: [],
      engineResult: {
        winnerKey: "tew:pac",
        winnerName: "PAC",
        loserKey: "tew:white",
        loserName: "Jay White",
        finishType: "Submission",
        finishDescription: "PAC countered the Blade Runner into the Brutalizer and forced Jay White to submit.",
        actualDurationMinutes: 18.7,
        matchScore: 86,
        starRating: 4.25,
        performanceLeaderKey: "tew:pac",
        performanceLeaderName: "PAC",
        winnerProbability: 0.57,
        resultRoll: 0.42,
        confidenceLabel: "Moderate",
        upset: false,
        decisiveFactors: [],
        matchFacts: [],
      },
      finalResult: {
        winnerKey: "tew:pac",
        winnerName: "PAC",
        loserKey: "tew:white",
        loserName: "Jay White",
        finishType: "Submission",
        finishDescription: "PAC countered the Blade Runner into the Brutalizer and forced Jay White to submit.",
        actualDurationMinutes: 18.7,
        matchScore: 86,
        starRating: 4.25,
        acceptedEngineResult: true,
        overrideReason: "",
        finalizedAt: "2019-01-08T20:20:00.000Z",
      },
    }],
    activeAttemptId: "attempt-1",
    status: "Accepted",
    createdAt: "2019-01-08T20:00:00.000Z",
    updatedAt: "2019-01-08T20:20:00.000Z",
  };
}

function card() {
  const show = createPlannedShow(1);
  show.id = "show-1";
  show.name = "PWL Power Hour";
  show.date = "2019-01-08";
  const opening = createPlannedSegment("angle");
  opening.id = "angle-1";
  opening.title = "Opening Statement";
  const match = createPlannedSegment("match");
  match.id = "match-1";
  match.title = "Jay White vs PAC";
  match.durationMinutes = 18;
  match.workers = [
    { id: "white", name: "Jay White", role: "Competitor", side: "Side 1", source: "tew" },
    { id: "pac", name: "PAC", role: "Competitor", side: "Side 2", source: "tew" },
  ];
  const mainEvent = createPlannedSegment("match");
  mainEvent.id = "match-2";
  mainEvent.title = "Brian Cage vs Bobby Lashley";
  mainEvent.workers = [
    { id: "cage", name: "Brian Cage", role: "Competitor", side: "Side 1", source: "tew" },
    { id: "lashley", name: "Bobby Lashley", role: "Competitor", side: "Side 2", source: "tew" },
  ];
  show.segments = [opening, match, mainEvent];
  return { show, opening, match, mainEvent };
}

describe("Phase 6B2 reactive live card runner", () => {
  test("blocks an incomplete card and clearly identifies what must be fixed", () => {
    const show = createPlannedShow(1);
    expect(liveCardReadiness(show)).toMatchObject({ ready: false, blockers: ["Add at least one match or angle to the card."] });
    const match = createPlannedSegment("match");
    match.title = "Opening Match";
    show.segments = [match];
    expect(liveCardReadiness(show)).toMatchObject({ ready: false });
    expect(liveCardReadiness(show).blockers[0]).toContain("Add 2 more");
    match.workers = [
      { id: "one", name: "One", role: "Competitor", side: "Side 1", source: "manual" },
      { id: "two", name: "Two", role: "Competitor", side: "Side 2", source: "manual" },
    ];
    expect(liveCardReadiness(show)).toEqual({ ready: true, blockers: [] });
  });

  test("starts at the first segment and resumes the exact selected position", () => {
    const { show, opening, match } = card();
    let session = createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } });
    session = startLiveCardSession(session);
    expect(session).toMatchObject({ status: "In Progress", currentSegmentId: opening.id, crowdStart: 50, currentCrowd: 50 });
    expect(session.progress.find((item) => item.segmentId === opening.id)?.status).toBe("Current");
    session = selectLiveCardSegment(session, match.id);
    expect(session.currentSegmentId).toBe(match.id);
    expect(session.progress.find((item) => item.segmentId === match.id)?.status).toBe("Result Pending");
    const parsed = parseLiveCardUniverse(JSON.parse(JSON.stringify(upsertLiveCardSession(emptyLiveCardUniverse(), session))) as unknown);
    expect(parsed.sessions[0].currentSegmentId).toBe(match.id);
    expect(parsed.sessions[0].status).toBe("In Progress");
  });

  test("locks only a finalized match result and prevents silent replacement", () => {
    const { show, match } = card();
    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }));
    session = selectLiveCardSegment(session, match.id);
    const unresolved = { ...acceptedResolution(show.id, match.id), status: "Calculated" as const, attempts: acceptedResolution(show.id, match.id).attempts.map((attempt) => ({ ...attempt, status: "Calculated" as const, finalResult: null })) };
    expect(() => lockMatchResult(session, unresolved)).toThrow("Accept or explicitly override");
    const record = acceptedResolution(show.id, match.id);
    session = lockMatchResult(session, record);
    expect(session.progress.find((item) => item.segmentId === match.id)).toMatchObject({ status: "Completed", result: { status: "Accepted", finalResult: { performanceRating: 86, matchScore: 75.2 } }, audience: { performanceRating: 86, anticipation: 50, crowdBefore: 50, crowdResponse: 59, finalRating: 75.2, crowdAfter: 53 } });
    expect(session.currentCrowd).toBe(53);
    expect(() => lockMatchResult(session, record)).toThrow("already locked");
  });

  test("inserts a grounded follow-up angle without inventing its creative output", () => {
    const { show, match } = card();
    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }));
    session = selectLiveCardSegment(session, match.id);
    session = lockMatchResult(session, acceptedResolution(show.id, match.id));
    const result = insertGroundedAngle(show, session, match.id, {
      title: "Jay White Reacts",
      purpose: "Show Jay White's response to the official loss.",
      location: "Backstage",
      contentType: "Serious",
      mode: "Follow-Up Angle",
    });
    expect(result.show.segments.map((segment) => segment.id)).toEqual(["angle-1", "match-1", result.segment.id, "match-2"]);
    expect(result.segment).toMatchObject({
      title: "Jay White Reacts",
      segmentOutput: "",
      angleLocation: "Backstage",
      purpose: "Show Jay White's response to the official loss.",
    });
    expect(result.segment.notes).toContain("PAC defeated Jay White");
    expect(result.segment.privateNotes).toContain("No dialogue, attack, challenge, turn");
    expect(result.session.currentSegmentId).toBe(result.segment.id);
    expect(result.session.progress.find((item) => item.segmentId === result.segment.id)).toMatchObject({ status: "Current", insertedDuringShow: true, sourceSegmentId: match.id });
  });

  test("completes an angle then preserves its original output through correction history", () => {
    const { show, opening } = card();
    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }));
    session = completeAngleSegment(session, opening.id, "Jay White promises to control the league.", "PAC objects.", "A match is discussed.");
    expect(session.progress.find((item) => item.segmentId === opening.id)).toMatchObject({ status: "Completed", finalAngleOutput: "Jay White promises to control the league." });
    session = openSegmentCorrection(session, opening.id, "The final wording was recorded incorrectly.");
    expect(session.progress.find((item) => item.segmentId === opening.id)?.status).toBe("Correction");
    session = completeAngleCorrection(session, opening.id, "Jay White claims the league belongs to him; PAC rejects the claim.");
    const progress = session.progress.find((item) => item.segmentId === opening.id)!;
    expect(progress.status).toBe("Completed");
    expect(progress.finalAngleOutput).toContain("PAC rejects");
    expect(progress.corrections[0]).toMatchObject({
      reason: "The final wording was recorded incorrectly.",
      beforeOutput: "Jay White promises to control the league.",
      afterOutput: "Jay White claims the league belongs to him; PAC rejects the claim.",
    });
  });

  test("finds the next unfinished segment and match in running-order sequence", () => {
    const { show, opening, match, mainEvent } = card();
    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }));
    session = completeAngleSegment(session, opening.id, "Opening complete.", "", "");
    expect(nextUnfinishedSegmentId(session, opening.id)).toBe(match.id);
    expect(nextUnfinishedMatchId(session, opening.id)).toBe(match.id);
    session = selectLiveCardSegment(session, match.id);
    session = lockMatchResult(session, acceptedResolution(show.id, match.id));
    expect(nextUnfinishedMatchId(session, match.id)).toBe(mainEvent.id);
  });

  test("completes the show only after every segment is finalized or skipped", () => {
    const { show, opening, match, mainEvent } = card();
    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }));
    expect(canCompleteLiveCard(session)).toBe(false);
    session = completeAngleSegment(session, opening.id, "Opening complete.", "", "");
    session = selectLiveCardSegment(session, match.id);
    session = lockMatchResult(session, acceptedResolution(show.id, match.id));
    session = selectLiveCardSegment(session, mainEvent.id);
    const second = { ...acceptedResolution(show.id, mainEvent.id), id: "resolution-2", segmentId: mainEvent.id, segmentTitle: mainEvent.title, activeAttemptId: "attempt-2", attempts: acceptedResolution(show.id, mainEvent.id).attempts.map((attempt) => ({ ...attempt, id: "attempt-2" })) };
    session = lockMatchResult(session, second);
    expect(canCompleteLiveCard(session)).toBe(true);
    session = completeLiveCard(session);
    expect(session.status).toBe("Completed");
    expect(session.completedAt).toBeTruthy();
    expect(session.audit[0].action).toBe("Show Completed");
  });

  test("synchronizes inserted or newly edited card segments without losing completed history", () => {
    const { show, opening, match } = card();
    const resolutions: MatchResolutionUniverse = { records: [acceptedResolution(show.id, match.id)], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } };
    let session = startLiveCardSession(createLiveCardSession(show, resolutions));
    session = completeAngleSegment(session, opening.id, "Final opening output.", "", "");
    const newAngle = createPlannedSegment("angle");
    newAngle.id = "angle-new";
    newAngle.title = "New Result-Dependent Angle";
    const editedShow = { ...show, segments: [...show.segments, newAngle], updatedAt: new Date().toISOString() };
    session = synchronizeLiveCardSession(editedShow, resolutions, session);
    expect(session.progress.find((item) => item.segmentId === opening.id)).toMatchObject({ status: "Completed", finalAngleOutput: "Final opening output." });
    expect(session.progress.find((item) => item.segmentId === newAngle.id)).toMatchObject({ status: "Planned", title: "New Result-Dependent Angle" });
  });
});
