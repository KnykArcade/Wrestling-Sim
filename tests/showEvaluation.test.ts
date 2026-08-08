import { describe, expect, test } from "vitest";
import { completeAngleSegment, completeLiveCard, createLiveCardSession, startLiveCardSession } from "../src/liveCard/model";
import { calculateLiveAngleAudience } from "../src/crowd/model";
import { createPlannedSegment, createPlannedShow } from "../src/planner/model";
import { createMatchEngineProfile } from "../src/matchEngine/model";
import {
  applyAngleEvaluation,
  angleEvaluationFingerprint,
  calculateAngleEvaluation,
  createShowExpectationSnapshot,
  emptyShowEvaluationUniverse,
  evaluateCompletedShow,
  finalizeAngleEvaluation,
  isAngleEvaluationCurrent,
} from "../src/showEvaluation/model";
import { parseShowEvaluationUniverse } from "../src/showEvaluation/storage";
import type { StartingUniverseCompany } from "../src/startingUniverse/types";

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
    expect(calculated.factors.map((factor) => factor.label)).toEqual(["Participant execution", "Angle structure", "Raw performance", "Anticipation", "Crowd response", "Official rating"]);
    expect(calculated).toMatchObject({ rawPerformance: 54.2, anticipation: 55.4, crowdBefore: 50, crowdResponse: 52.5, calculatedScore: 53.5 });
    expect(calculated.calculationLedger?.structure.terms.map((term) => term.contribution)).toEqual([50, 10, 10, -4, 5]);
    expect(() => finalizeAngleEvaluation(calculated, 82, "", { show, segment: angle, profiles: [] })).toThrow("explain why");
    expect(finalizeAngleEvaluation(calculated, 82, "The live crowd response was stronger than the calculated baseline.", { show, segment: angle, profiles: [] })).toMatchObject({ status: "Overridden", finalScore: 82 });
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

  test("applies speaking, physical, reaction, and reduced presence participation weights", () => {
    const { show, angle } = angleShow();
    angle.workers = [
      { id: "speaker", name: "Speaker", role: "Speaking", side: "", source: "manual" },
      { id: "physical", name: "Physical", role: "Physical", side: "", source: "manual" },
      { id: "reaction", name: "Reaction", role: "Reaction", side: "", source: "manual" },
      { id: "presence", name: "Presence", role: "Presence", side: "", source: "manual" },
    ];
    const profiles = angle.workers.map((worker, index) => {
      const profile = createMatchEngineProfile({ id: worker.id, name: worker.name, source: worker.source });
      profile.popularity = 40 + index * 15;
      profile.skills.Charisma = 45 + index * 15;
      profile.skills.Menace = 50 + index * 12;
      profile.skills.Brawling = 55 + index * 10;
      profile.skills.Selling = 60 + index * 8;
      return profile;
    });
    const calculated = calculateAngleEvaluation(show, angle, profiles);
    expect(calculated.participants.map((participant) => participant.role)).toEqual(["Speaking", "Physical", "Reaction", "Presence"]);
    const scores = calculated.participants.map((participant) => participant.rolePerformance);
    const weightedAverage = (scores[0] + scores[1] + scores[2] + scores[3] * .6) / 3.6;
    expect(calculated.calculationLedger?.participantExecution.terms[0].input).toBeCloseTo(weightedAverage, 5);
    expect(calculated.calculationLedger?.participantExecution.result).toBeCloseTo(weightedAverage * .7 + Math.max(...scores) * .3, 1);
  });

  test("applies participant effects and final show consequences exactly once", () => {
    const { show, angle } = angleShow();
    const finalized = finalizeAngleEvaluation(calculateAngleEvaluation(show, angle, []), undefined, "", { show, segment: angle, profiles: [] });
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

  test("uses canonical profile keys for multiword manual wrestlers and completes their angle once", () => {
    const { show, angle } = angleShow();
    const profiles = angle.workers.map((worker) => createMatchEngineProfile({ id: worker.id, name: worker.name, source: worker.source }));
    profiles[1].momentum = 63;
    profiles[1].popularity = 58;

    const calculated = calculateAngleEvaluation(show, angle, profiles);
    expect(calculated.participants.map((participant) => participant.workerKey)).toEqual(profiles.map((profile) => profile.workerKey));

    const finalized = finalizeAngleEvaluation(calculated, undefined, "", { show, segment: angle, profiles });
    const applied = applyAngleEvaluation(emptyShowEvaluationUniverse(), finalized, profiles);
    const appliedAgain = applyAngleEvaluation(applied.universe, finalized, applied.profiles);
    expect(applied.profiles).toHaveLength(profiles.length);
    expect(new Set(applied.profiles.map((profile) => profile.workerKey)).size).toBe(profiles.length);
    expect(appliedAgain.profiles).toEqual(applied.profiles);
    expect(appliedAgain.universe.workerImpacts).toEqual(applied.universe.workerImpacts);

    const session = completeAngleSegment(
      startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } })),
      angle.id,
      angle.segmentOutput,
      "",
      "",
      finalized.rawPerformance,
      finalized.anticipation,
      finalized.finalScore,
      finalized.calculationLedger?.finalRating,
    );
    expect(session.progress.find((item) => item.segmentId === angle.id)?.status).toBe("Completed");
  });

  test("loads older storage safely with neutral defaults", () => {
    expect(parseShowEvaluationUniverse({ angleEvaluations: [] })).toEqual({ angleEvaluations: [], workerImpacts: [], showReports: [], promotionPopularity: 50, promotionPopularitySeeded: false });
    const legacy = parseShowEvaluationUniverse({
      angleEvaluations: [{ id: "legacy-angle", showId: "show", segmentId: "angle", calculatedScore: 64, finalScore: 66, participants: [], appliedAt: "2019-01-01" }],
      showReports: [{ id: "legacy-show", showId: "show", overallScore: 70, estimatedAttendance: 500, segments: [{ segmentId: "angle", score: 66, importanceWeight: 1 }], appliedAt: "2019-01-01" }],
    });
    expect(legacy.angleEvaluations[0]).toMatchObject({ calculationVersion: "legacy-unversioned", calculatedScore: 64, finalScore: 66, rawPerformance: 64 });
    expect(legacy.angleEvaluations[0].calculationLedger).toBeUndefined();
    expect(legacy.showReports[0]).toMatchObject({ calculationVersion: "legacy-unversioned", overallScore: 70, estimatedAttendance: 500 });
    expect(legacy.showReports[0].calculationLedger).toBeUndefined();
  });

  test("uses imported strength, the real main event, crowd carryover, expectations, and venue capacity", () => {
    const { show, angle } = angleShow();
    const second = { ...createPlannedSegment("angle"), id: "main-event", title: "Main Event Celebration", segmentOutput: angle.segmentOutput, purpose: angle.purpose, workers: angle.workers };
    const post = { ...createPlannedSegment("angle"), id: "post-show", title: "Post Show Interview", section: "Post-Show" as const, segmentOutput: angle.segmentOutput, purpose: angle.purpose, workers: angle.workers };
    show.segments = [angle, second, post];
    show.venueCapacity = 600;
    show.marketDemand = 90;
    const company: StartingUniverseCompany = { id: "pwl", name: "Pro Wrestling League", initials: "PWL", profile: "", active: true, userControlled: true, basedIn: "USA", size: "Small", prestige: 35, ranking: 0, momentum: 40, money: 0, ownerName: "", headBookerName: "", styleName: "", productBase: "" };
    let evaluations = emptyShowEvaluationUniverse();
    let profiles = [createMatchEngineProfile({ id: "pac", name: "PAC", source: "manual" }), createMatchEngineProfile({ id: "white", name: "Jay White", source: "manual" })];
    for (const segment of show.segments) {
      const finalized = finalizeAngleEvaluation(calculateAngleEvaluation(show, segment, profiles), 60, "Fixed score for a golden show calculation.", { show, segment, profiles });
      const applied = applyAngleEvaluation(evaluations, finalized, profiles);
      evaluations = applied.universe;
      profiles = applied.profiles;
    }
    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }));
    for (const segment of show.segments) session = completeAngleSegment(session, segment.id, segment.segmentOutput, "", "", 60);
    session = completeLiveCard(session);
    const evaluated = evaluateCompletedShow(evaluations, show, session, { company, profiles });
    const report = evaluated.showReports[0];
    expect(report.promotionStrength).toMatchObject({ source: "Imported Company", companyName: "Pro Wrestling League", companySize: "Small" });
    expect(report.promotionPopularityBefore).not.toBe(50);
    expect(report.segments.find((item) => item.segmentId === "main-event")).toMatchObject({ mainEvent: true, sectionWeight: 1, durationWeight: .75, mainEventWeight: 1.4, importanceWeight: 1.05 });
    expect(report.segments.find((item) => item.segmentId === "post-show")).toMatchObject({ mainEvent: false, sectionWeight: .5, durationWeight: .75, mainEventWeight: 1, importanceWeight: .375 });
    expect(report.segments[1].crowdModifier).not.toBe(report.segments[0].crowdModifier);
    expect(report.expectedShowScore).toBeLessThanOrEqual(60);
    expect(report.promotionPopularityDelta).toBe(-0.3);
    expect(report.estimatedAttendance).toBe(600);
    expect(report.attendanceCalculation).toMatchObject({ venueCapacity: 600, capacityLimited: true });
  });

  test("removes word-count and stacked-storyline bonuses while preserving exact structure rules", () => {
    const { show, angle } = angleShow();
    angle.audienceTakeaway = "PAC and Jay White are headed toward a title match.";
    const short = calculateAngleEvaluation(show, { ...angle, segmentOutput: "Faceoff." }, []);
    const long = calculateAngleEvaluation(show, { ...angle, segmentOutput: "Detailed output. ".repeat(40), storylines: [...angle.storylines, { id: "second", name: "Second Story", source: "manual" }] }, []);
    expect(short.rawPerformance).toBe(56.6);
    expect(long.rawPerformance).toBe(short.rawPerformance);
    expect(short.calculationLedger?.structure.result).toBe(83);
    expect(long.calculationLedger?.structure.result).toBe(83);
    expect(long.calculationLedger?.structure.notes.join(" ")).toContain("Additional storyline links do not stack");
  });

  test("uses genuine anticipation and the Phase 6B20C crowd response for angles", () => {
    const { show, angle } = angleShow();
    const coldProfiles = angle.workers.map((worker) => {
      const profile = createMatchEngineProfile({ id: worker.id, name: worker.name, source: worker.source });
      profile.momentum = 0;
      return profile;
    });
    const hotProfiles = coldProfiles.map((profile) => ({ ...profile, momentum: 100 }));
    const cold = calculateAngleEvaluation(show, angle, coldProfiles, 50);
    const hot = calculateAngleEvaluation(show, angle, hotProfiles, 50);
    expect(hot.anticipation - cold.anticipation).toBeCloseTo(25, 6);
    expect(calculateLiveAngleAudience(75, 70, 60)).toMatchObject({ crowdResponse: 66.8, finalRating: 71.7 });
    expect(calculateLiveAngleAudience(55, 80, 75)).toMatchObject({ crowdResponse: 67.8, finalRating: 60.1 });
    expect(calculateLiveAngleAudience(85, 45, 40)).toMatchObject({ crowdResponse: 52.8, finalRating: 72.1 });
  });

  test("invalidates unaccepted calculations after segment or profile changes", () => {
    const { show, angle } = angleShow();
    const profiles = angle.workers.map((worker) => createMatchEngineProfile({ id: worker.id, name: worker.name, source: worker.source }));
    const calculated = calculateAngleEvaluation(show, angle, profiles);
    expect(calculated.setupFingerprint).toBe(angleEvaluationFingerprint(show, angle, profiles));
    expect(isAngleEvaluationCurrent(calculated, show, angle, profiles)).toBe(true);
    const changedAngle = { ...angle, purpose: `${angle.purpose} The challenger demands an immediate answer.` };
    expect(isAngleEvaluationCurrent(calculated, show, changedAngle, profiles)).toBe(false);
    expect(() => finalizeAngleEvaluation(calculated, undefined, "", { show, segment: changedAngle, profiles })).toThrow("stale");
    const changedProfiles = profiles.map((profile, index) => index === 0 ? { ...profile, momentum: 90 } : profile);
    expect(isAngleEvaluationCurrent(calculated, show, angle, changedProfiles)).toBe(false);
  });

  test("recalculates raw performance and participant ledgers for an explained override", () => {
    const { show, angle } = angleShow();
    const profiles = angle.workers.map((worker) => createMatchEngineProfile({ id: worker.id, name: worker.name, source: worker.source }));
    const calculated = calculateAngleEvaluation(show, angle, profiles);
    const overridden = finalizeAngleEvaluation(calculated, 80, "The delivered performances were materially stronger than the modeled execution.", { show, segment: angle, profiles });
    expect(overridden).toMatchObject({ status: "Overridden", finalScore: 80 });
    expect(overridden.rawPerformance).toBeGreaterThan(calculated.rawPerformance);
    expect(overridden.participants[0].performanceScore).toBeGreaterThan(calculated.participants[0].performanceScore);
    expect(overridden.participants[0].calculationLedger?.momentum.formulaId).toBe("angle.consequence-momentum");
    expect(overridden.participants[0].momentumAfter).toBeCloseTo(overridden.participants[0].momentumBefore + overridden.participants[0].momentumDelta, 1);
    expect(overridden.calculationLedger?.rawPerformance.formulaId).toBe("angle.raw-performance-override");
    expect(overridden.calculationLedger?.rawPerformance.terms.reduce((total, term) => total + term.contribution, 0)).toBeCloseTo(overridden.rawPerformance, 1);
    expect(overridden.calculationLedger?.finalRating.terms.reduce((total, term) => total + term.contribution, 0)).toBeCloseTo(80, 1);
    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }));
    session = completeAngleSegment(session, angle.id, angle.segmentOutput, "", "", overridden.rawPerformance, overridden.anticipation, overridden.finalScore, overridden.calculationLedger?.finalRating);
    expect(session.progress[0].audience?.finalRating).toBe(80);
    expect(session.progress[0].audience?.calculationLedger?.finalRating.formulaId).toBe("crowd.angle-final-rating-override");
  });

  test("weights short angles, long matches, main events, and post-show segments by actual duration", () => {
    const show = createPlannedShow(1);
    show.id = "duration-show";
    const five = { ...createPlannedSegment("angle"), id: "five", title: "Five Minute Angle", durationMinutes: 5 };
    const fifteen = { ...createPlannedSegment("angle"), id: "fifteen", title: "Fifteen Minute Segment", durationMinutes: 15 };
    const twenty = { ...createPlannedSegment("angle"), id: "twenty", title: "Twenty Minute Main Event", durationMinutes: 20 };
    const post = { ...createPlannedSegment("angle"), id: "post", title: "Five Minute Post Show", durationMinutes: 5, section: "Post-Show" as const };
    show.segments = [five, fifteen, twenty, post];
    const evaluations = emptyShowEvaluationUniverse();
    const snapshot = createShowExpectationSnapshot(evaluations, show);
    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }), snapshot.crowdStart, snapshot);
    for (const segment of show.segments) session = completeAngleSegment(session, segment.id, "Completed angle.", "", "", 60, 60);
    session = completeLiveCard(session);
    const report = evaluateCompletedShow(evaluations, show, session).showReports[0];
    expect(report.segments.map((segment) => segment.importanceWeight)).toEqual([.75, 1.25, 2.1, .375]);
    expect(report.segments.map((segment) => segment.durationWeight)).toEqual([.75, 1.25, 1.5, .75]);
    expect(report.calculationLedger?.overallScore.terms.reduce((total, term) => total + term.contribution, 0)).toBeCloseTo(report.overallScore, 1);
  });

  test("freezes expectations and attendance before wrestler consequences can change the card", () => {
    const { show, angle } = angleShow();
    show.venueCapacity = 5000;
    const profiles = angle.workers.map((worker) => {
      const profile = createMatchEngineProfile({ id: worker.id, name: worker.name, source: worker.source });
      profile.overall = 90;
      profile.popularity = 90;
      profile.momentum = 90;
      profile.health = 100;
      return profile;
    });
    const evaluations = emptyShowEvaluationUniverse();
    const snapshot = createShowExpectationSnapshot(evaluations, show, { profiles });
    let session = startLiveCardSession(createLiveCardSession(show, { records: [], settings: { defaultImportance: "Television", defaultChemistry: 0, defaultVolatility: 8, requireOverrideReason: true, selectedShowId: "", selectedSegmentId: "" } }), snapshot.crowdStart, snapshot);
    session = completeAngleSegment(session, angle.id, angle.segmentOutput, "", "", 70, 70);
    session = completeLiveCard(session);
    const damagedProfiles = profiles.map((profile) => ({ ...profile, overall: 10, popularity: 10, momentum: 10, health: 10 }));
    const report = evaluateCompletedShow(evaluations, show, session, { profiles: damagedProfiles }).showReports[0];
    expect(report.estimatedAttendance).toBe(snapshot.estimatedAttendance);
    expect(report.expectedShowScore).toBe(snapshot.expectedShowScore);
    expect(report.attendanceCalculation.expectedCardStrength).toBe(snapshot.expectedCardStrength);
    expect(report.calculationVersion).toBe("wrestling-sim-shows-6b20e-v1");
    expect(report.calculationLedger?.attendanceDemand.terms.reduce((total, term) => total + term.contribution, 0)).toBeCloseTo(report.attendanceCalculation.unconstrainedDemand, 0);
  });
});
