import { describe, expect, test } from "vitest";
import { completeAngleSegment, completeLiveCard, createLiveCardSession, startLiveCardSession } from "../src/liveCard/model";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import { createMatchEngineProfile } from "../src/matchEngine/model";
import {
  applyAngleEvaluation,
  calculateAngleEvaluation,
  emptyShowEvaluationUniverse,
  evaluateCompletedShow,
  finalizeAngleEvaluation,
} from "../src/showEvaluation/model";
import { parseShowEvaluationUniverse } from "../src/showEvaluation/storage";

function angleShow() {
  const show = createPlannedShow(1);
  show.id = "show-angle-test";
  show.name = "PWL Power Hour";
  show.showType = "Television";
  const angle = createPlannedSegment("angle");
  angle.id = "angle-test";
  angle.title = "World Championship Faceoff";
  angle.durationMinutes = 7;
  angle.purpose = "Establish the next World Championship match.";
  angle.angleContentType = "Storyline Advancement";
  angle.segmentOutput = "PAC confronts Jay White in the ring and makes his championship intentions clear before both men stand their ground.";
  angle.storylines = [{ id: "world-title", name: "World Championship", source: "manual" }];
  angle.workers = [
    { id: "pac", name: "PAC", role: "Physical", side: "", source: "manual" },
    { id: "white", name: "Jay White", role: "Speaking", side: "", source: "manual" },
  ];
  show.segments = [angle];
  return { show, angle };
}

describe("Phase 6B7 angle resolution and show evaluation", () => {
  test("calculates an explained angle result and requires a reason for overrides", () => {
    const { show, angle } = angleShow();
    const calculated = calculateAngleEvaluation(show, angle, []);
    expect(calculated.status).toBe("Calculated");
    expect(calculated.calculatedScore).toBeGreaterThan(0);
    expect(calculated.participants).toHaveLength(2);
    expect(calculated.factors.map((factor) => factor.label)).toEqual(expect.arrayContaining(["Participant performance", "Duration", "Storyline heat"]));
    expect(() => finalizeAngleEvaluation(calculated, 82, "")).toThrow("explain why");
    expect(finalizeAngleEvaluation(calculated, 82, "The live crowd response was stronger than the calculated baseline.")).toMatchObject({ status: "Overridden", finalScore: 82 });
  });

  test("uses explicit roles and normalizes the 1–5 gimmick scale", () => {
    const { show, angle } = angleShow();
    const pac = createMatchEngineProfile({ id: "pac", name: "PAC", source: "manual" });
    const white = createMatchEngineProfile({ id: "white", name: "Jay White", source: "manual" });
    white.skills.Charisma = 100;
    white.skills.Psychology = 100;
    white.popularity = 100;
    white.gimmick = 5;
    const calculated = calculateAngleEvaluation(show, angle, [pac, white]);
    const speaker = calculated.participants.find((participant) => participant.workerName === "Jay White")!;
    expect(speaker.role).toBe("Speaking");
    expect(speaker.performanceScore).toBeGreaterThan(80);
    angle.workers[1].role = "Interviewer";
    expect(calculateAngleEvaluation(show, angle, [pac, white]).participants[1].role).toBe("Presence");
  });

  test("applies participant effects and final show consequences exactly once", () => {
    const { show, angle } = angleShow();
    const finalized = finalizeAngleEvaluation(calculateAngleEvaluation(show, angle, []));
    const applied = applyAngleEvaluation(emptyShowEvaluationUniverse(), finalized, []);
    const appliedAgain = applyAngleEvaluation(applied.universe, finalized, applied.profiles);
    expect(appliedAgain.universe.workerImpacts).toEqual(applied.universe.workerImpacts);
    expect(appliedAgain.profiles).toEqual(applied.profiles);
    expect(appliedAgain.universe.angleEvaluations[0].appliedAt).toBeTruthy();
    expect(applied.profiles.every((profile) => profile.momentum !== 0 || profile.popularity !== 50)).toBe(true);

    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }));
    session = completeAngleSegment(session, angle.id, angle.segmentOutput, "", "");
    session = completeLiveCard(session);
    const evaluated = evaluateCompletedShow(appliedAgain.universe, show, session);
    const reopened = evaluateCompletedShow(evaluated, show, session);
    expect(reopened.showReports).toHaveLength(1);
    expect(reopened.showReports[0]).toMatchObject({ showId: show.id, audienceReaction: expect.any(String), appliedAt: expect.any(String) });
    expect(reopened.showReports[0].estimatedAttendance).toBeGreaterThan(0);
    expect(reopened.promotionPopularity).toBe(evaluated.promotionPopularity);
  });

  test("loads older storage safely with neutral defaults", () => {
    expect(parseShowEvaluationUniverse({ angleEvaluations: [] })).toEqual({ angleEvaluations: [], workerImpacts: [], showReports: [], promotionPopularity: 50 });
  });
});
