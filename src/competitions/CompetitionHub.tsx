import { useEffect, useMemo, useState } from "react";
import { loadPlannedShows, savePlannedShows } from "../planner/storage";
import type { PlannedShow } from "../planner/types";
import type { TewSnapshot } from "../tew/types";
import {
  addFixtureToPlannedShow,
  buildCompetitionStandings,
  competitionWarnings,
  createCompetition,
  createCompetitionParticipant,
  createCompetitionTemplate,
  fixtureDisplayName,
  generateCompetitionStructure,
  recordCompetitionResult,
  recordCompetitionCommitteeDecision,
  resetCompetitionResult,
  syncCompetitionFromPlannedShows,
  touchCompetition,
} from "./model";
import { loadCompetitionUniverse, saveCompetitionUniverse } from "./storage";
import type {
  Competition,
  CompetitionFixture,
  CompetitionFormat,
  CompetitionKind,
  CompetitionParticipantType,
  CompetitionStatus,
  CompetitionUniverse,
} from "./types";

type CompetitionTab = "Overview" | "Participants" | "Bracket and Schedule" | "Standings";

function participantName(competition: Competition, id: string): string {
  return competition.participants.find((participant) => participant.id === id)?.name ?? "TBD";
}

function formatDate(value: string): string {
  if (!value) return "Date not set";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function CompetitionHub({
  snapshot,
  onOpenShow,
}: {
  snapshot: TewSnapshot | null;
  onOpenShow: (showId: string, segmentId: string) => void;
}) {
  const [universe, setUniverse] = useState<CompetitionUniverse>(() => loadCompetitionUniverse(window.localStorage));
  const [shows, setShows] = useState<PlannedShow[]>(() => loadPlannedShows(window.localStorage));
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<CompetitionTab>("Overview");
  const [manualName, setManualName] = useState("");
  const [manualMembers, setManualMembers] = useState("");
  const [manualSeed, setManualSeed] = useState(0);
  const [tewWorkerId, setTewWorkerId] = useState("");
  const [targetShows, setTargetShows] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const selected = useMemo(
    () => universe.competitions.find((competition) => competition.id === selectedId) ?? universe.competitions[0] ?? null,
    [selectedId, universe.competitions],
  );

  useEffect(() => {
    if (!selectedId && universe.competitions[0]) setSelectedId(universe.competitions[0].id);
  }, [selectedId, universe.competitions]);

  useEffect(() => {
    saveCompetitionUniverse(window.localStorage, universe);
  }, [universe]);

  useEffect(() => {
    savePlannedShows(window.localStorage, shows);
  }, [shows]);

  function updateCompetition(competitionId: string, updater: (competition: Competition) => Competition): void {
    setUniverse((current) => ({
      competitions: current.competitions.map((competition) => competition.id === competitionId ? touchCompetition(updater(competition)) : competition),
    }));
  }

  function createBlank(): void {
    const competition = createCompetition(universe.competitions.length + 1);
    setUniverse((current) => ({ competitions: [competition, ...current.competitions] }));
    setSelectedId(competition.id);
    setTab("Overview");
    setNotice("Blank competition created.");
  }

  function createFromTemplate(template: "world-classic" | "world-tag-classic" | "league"): void {
    const competition = createCompetitionTemplate(template, universe.competitions.length + 1);
    setUniverse((current) => ({ competitions: [competition, ...current.competitions] }));
    setSelectedId(competition.id);
    setTab("Participants");
    setNotice(`${competition.name} template created. Add participants, then generate its structure.`);
  }

  function deleteSelected(): void {
    if (!selected || !window.confirm(`Delete ${selected.name}? Planned matches already created from it will remain on their shows.`)) return;
    const remaining = universe.competitions.filter((competition) => competition.id !== selected.id);
    setUniverse({ competitions: remaining });
    setSelectedId(remaining[0]?.id ?? "");
    setNotice("Competition deleted. Existing planned matches were not removed.");
  }

  function addManualParticipant(): void {
    if (!selected || !manualName.trim()) return;
    const memberNames = manualMembers.split(",").map((name) => name.trim()).filter(Boolean);
    const participant = createCompetitionParticipant(manualName, selected.participantType, {
      memberNames: memberNames.length > 0 ? memberNames : undefined,
      seed: manualSeed,
    });
    updateCompetition(selected.id, (competition) => ({ ...competition, participants: [...competition.participants, participant] }));
    setManualName("");
    setManualMembers("");
    setManualSeed(0);
  }

  function addTewWorker(): void {
    if (!selected || !snapshot || !tewWorkerId) return;
    const worker = snapshot.workers.find((item) => item.id === tewWorkerId);
    if (!worker) return;
    if (selected.participants.some((participant) => participant.sourceWorkerIds.includes(worker.id))) { setTewWorkerId(""); return; }
    const participant = createCompetitionParticipant(worker.name, "Singles", {
      memberNames: [worker.name],
      source: "tew",
      sourceWorkerIds: [worker.id],
      seed: selected.participants.length + 1,
    });
    updateCompetition(selected.id, (competition) => ({ ...competition, participants: [...competition.participants, participant] }));
    setTewWorkerId("");
  }

  function generateStructure(): void {
    if (!selected) return;
    updateCompetition(selected.id, (competition) => generateCompetitionStructure(competition));
    setTab("Bracket and Schedule");
    setNotice(`${selected.format} structure generated. Existing fixtures were replaced.`);
  }

  function recordWinner(fixture: CompetitionFixture, winnerId: string): void {
    if (!selected || !winnerId) return;
    updateCompetition(selected.id, (competition) => recordCompetitionResult(competition, fixture.id, "Decision", winnerId, fixture.scoreText, { winnerSubmissions: fixture.submissionWinnerCount, loserSubmissions: fixture.submissionLoserCount }));
  }

  function recordDraw(fixture: CompetitionFixture): void {
    if (!selected || selected.format === "Single Elimination") return;
    updateCompetition(selected.id, (competition) => recordCompetitionResult(competition, fixture.id, "Draw", "", fixture.scoreText, { winnerSubmissions: fixture.submissionWinnerCount, loserSubmissions: fixture.submissionLoserCount }));
  }

  function recordNeutral(fixture: CompetitionFixture, resultType: "No Contest" | "Cancelled"): void {
    if (!selected) return;
    updateCompetition(selected.id, (competition) => recordCompetitionResult(competition, fixture.id, resultType, "", fixture.scoreText));
  }

  function addToShow(fixture: CompetitionFixture): void {
    if (!selected) return;
    const showId = targetShows[fixture.id] || fixture.scheduledShowId;
    if (!showId) return;
    const result = addFixtureToPlannedShow(selected, fixture.id, showId, shows);
    setShows(result.shows);
    setUniverse((current) => ({ competitions: current.competitions.map((competition) => competition.id === selected.id ? result.competition : competition) }));
    setNotice(result.created ? "Competition match added to the planned show." : "That fixture is already linked or is not ready to schedule.");
  }

  function syncResults(): void {
    if (!selected) return;
    const result = syncCompetitionFromPlannedShows(selected, shows);
    setUniverse((current) => ({ competitions: current.competitions.map((competition) => competition.id === selected.id ? result.competition : competition) }));
    setNotice(result.synced > 0 ? `Synced ${result.synced} reconciled TEW result${result.synced === 1 ? "" : "s"}.` : "No new reconciled TEW results were ready to sync.");
  }

  const standings = selected ? buildCompetitionStandings(selected) : [];
  const warnings = selected ? competitionWarnings(selected, shows) : [];
  const completedFixtures = selected?.fixtures.filter((fixture) => fixture.status === "Completed" || fixture.status === "Bye").length ?? 0;
  const champion = selected ? participantName(selected, selected.championParticipantId) : "";

  return <section className="competition-hub">
    <header className="competition-toolbar">
      <div>
        <p className="eyebrow">PHASE 4D · COMPETITION MANAGEMENT</p>
        <h2>Tournaments, Cups, Leagues, and Classics</h2>
        <p>Build the structure here, add each fixture to a planned show, run it in TEW, and sync the reconciled result back into the bracket or standings.</p>
      </div>
      <div className="competition-toolbar__actions">
        <button className="primary-button" type="button" onClick={createBlank}>Create Competition</button>
        <button className="secondary-button" type="button" onClick={() => createFromTemplate("world-classic")}>PWL World Classic</button>
        <button className="secondary-button" type="button" onClick={() => createFromTemplate("world-tag-classic")}>PWL World Tag Classic</button>
        <button className="secondary-button" type="button" onClick={() => createFromTemplate("league")}>PWL League</button>
      </div>
    </header>

    {notice && <div className="status-banner competition-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <div className="competition-layout">
      <aside className="competition-list">
        <div className="panel-heading"><span>Competitions</span><strong>{universe.competitions.length}</strong></div>
        {universe.competitions.length === 0 ? <div className="empty-state compact">Create a tournament, Cup, league, or Classic to begin.</div> : universe.competitions.map((competition) => <button type="button" className={selected?.id === competition.id ? "selected" : ""} key={competition.id} onClick={() => { setSelectedId(competition.id); setTab("Overview"); }}>
          <strong>{competition.name}</strong>
          <span>{competition.kind} · {competition.format}</span>
          <small>{competition.participants.length} participants · {competition.status}</small>
          {competition.championParticipantId && <em>Winner: {participantName(competition, competition.championParticipantId)}</em>}
        </button>)}
      </aside>

      {!selected ? <section className="competition-empty"><h3>Create the first competition</h3><p>The competition hub supports elimination brackets, round-robin schedules, league standings, TEW show assignment, and result synchronization.</p><button className="primary-button" type="button" onClick={createBlank}>Create Competition</button></section> : <div className="competition-workspace">
        <section className="competition-hero">
          <div><p className="eyebrow">{selected.kind.toUpperCase()}</p><h3>{selected.name}</h3><p>{selected.editionLabel || `${formatDate(selected.startDate)}${selected.endDate ? ` – ${formatDate(selected.endDate)}` : ""}`}</p></div>
          <div className="competition-metrics">
            <div><span>Participants</span><strong>{selected.participants.length}</strong></div>
            <div><span>Fixtures</span><strong>{selected.fixtures.length}</strong></div>
            <div><span>Completed</span><strong>{completedFixtures}</strong></div>
            <div><span>Winner</span><strong>{selected.championParticipantId ? champion : "TBD"}</strong></div>
          </div>
        </section>

        <nav className="competition-tabs" aria-label="Competition sections">
          {(["Overview", "Participants", "Bracket and Schedule", "Standings"] as CompetitionTab[]).map((item) => <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
        </nav>

        {warnings.length > 0 && <section className="competition-warning-list" aria-label="Competition warnings">
          {warnings.map((warning) => <div key={warning.id} className={`competition-warning competition-warning--${warning.severity.toLowerCase()}`}><strong>{warning.severity}</strong><span>{warning.message}</span></div>)}
        </section>}

        {tab === "Overview" && <section className="competition-panel">
          <header><div><h4>Competition identity and rules</h4><p>The competition structure remains tracker-side companion data. TEW still runs every scheduled match.</p></div><button className="danger-button" type="button" onClick={deleteSelected}>Delete Competition</button></header>
          <div className="competition-form-grid">
            <label className="field field--wide"><span>Competition name</span><input aria-label="Competition name" value={selected.name} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, name: event.target.value }))} /></label>
            <label className="field"><span>Type</span><select aria-label="Competition type" value={selected.kind} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, kind: event.target.value as CompetitionKind }))}><option>Tournament</option><option>Cup</option><option>League</option><option>Classic</option><option>Custom</option></select></label>
            <label className="field"><span>Format</span><select aria-label="Competition format" value={selected.format} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, format: event.target.value as CompetitionFormat }))}><option>Single Elimination</option><option>Round Robin</option><option>Double Round Robin</option><option>Round Robin + Final</option></select></label>
            <label className="field"><span>Division</span><select aria-label="Competition participant type" value={selected.participantType} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, participantType: event.target.value as CompetitionParticipantType }))}><option>Singles</option><option>Tag Team</option><option>Trios</option><option>Custom</option></select></label>
            <label className="field"><span>Status</span><select aria-label="Competition status" value={selected.status} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, status: event.target.value as CompetitionStatus }))}><option>Planning</option><option>Active</option><option>Completed</option><option>Archived</option></select></label>
            <label className="field"><span>Approved field size</span><input aria-label="Competition expected participant count" type="number" min="0" value={selected.expectedParticipantCount} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, expectedParticipantCount: Math.max(0, Number(event.target.value) || 0) }))} /></label>
            <label className="field"><span>Company</span><input value={selected.company} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, company: event.target.value }))} /></label>
            <label className="field"><span>Brand</span><input value={selected.brand} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, brand: event.target.value }))} /></label>
            <label className="field"><span>Start date</span><input type="date" value={selected.startDate} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, startDate: event.target.value }))} /></label>
            <label className="field"><span>End date</span><input type="date" value={selected.endDate} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, endDate: event.target.value }))} /></label>
            <label className="field field--wide"><span>Edition label</span><input placeholder="2019 edition, inaugural tournament…" value={selected.editionLabel} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, editionLabel: event.target.value }))} /></label>
            <label className="field field--wide"><span>Prize or stakes</span><textarea rows={3} value={selected.prize} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, prize: event.target.value }))} /></label>
            <label className="field field--wide"><span>Trophy or award name</span><input value={selected.trophyName} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, trophyName: event.target.value }))} /></label>
            <label className="field field--full"><span>Traditions and recurring presentation</span><textarea rows={4} value={selected.traditions} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, traditions: event.target.value }))} /></label>
            <label className="field field--full"><span>Winner presentation</span><textarea rows={3} value={selected.championPresentation} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, championPresentation: event.target.value }))} /></label>
            <label className="field"><span>Win points</span><input type="number" value={selected.pointsRules.win} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, pointsRules: { ...competition.pointsRules, win: Number(event.target.value) || 0 } }))} /></label>
            <label className="field"><span>Draw points</span><input type="number" value={selected.pointsRules.draw} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, pointsRules: { ...competition.pointsRules, draw: Number(event.target.value) || 0 } }))} /></label>
            <label className="field"><span>Loss points</span><input type="number" value={selected.pointsRules.loss} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, pointsRules: { ...competition.pointsRules, loss: Number(event.target.value) || 0 } }))} /></label>
            <label className="field"><span>No-contest points</span><input type="number" value={selected.pointsRules.noContest} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, pointsRules: { ...competition.pointsRules, noContest: Number(event.target.value) || 0 } }))} /></label>
            <label className="field"><span>Submission tiebreak</span><select aria-label="Competition submission tiebreak" value={selected.submissionTiebreak} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, submissionTiebreak: event.target.value as typeof competition.submissionTiebreak }))}><option>Unresolved</option><option>Submission Differential</option><option>Disabled</option></select></label>
            <label className="field"><span>Committee tie decision</span><select aria-label="Competition committee tie decision" value={selected.committeeDecisionParticipantId} onChange={(event) => updateCompetition(selected.id, (competition) => recordCompetitionCommitteeDecision(competition, event.target.value))}><option value="">No decision recorded</option>{selected.participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label>
            <label className="field field--full"><span>Private competition notes</span><textarea rows={4} value={selected.notes} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, notes: event.target.value }))} /></label>
          </div>
        </section>}

        {tab === "Participants" && <section className="competition-panel">
          <header><div><h4>Competition field</h4><p>Add singles wrestlers directly from the loaded TEW snapshot or create manual teams and custom entries.</p></div><button className="primary-button" type="button" disabled={selected.participants.length < 2} onClick={generateStructure}>Generate {selected.format === "Single Elimination" ? "Bracket" : "Schedule"}</button></header>
          <div className="competition-participant-add">
            <label className="field"><span>Participant or team name</span><input aria-label="Manual competition participant" value={manualName} onChange={(event) => setManualName(event.target.value)} /></label>
            <label className="field"><span>Members, comma separated</span><input aria-label="Competition participant members" value={manualMembers} placeholder={selected.participantType === "Singles" ? "Optional for singles" : "Worker One, Worker Two"} onChange={(event) => setManualMembers(event.target.value)} /></label>
            <label className="field"><span>Seed</span><input aria-label="Competition participant seed" type="number" min={0} value={manualSeed} onChange={(event) => setManualSeed(Math.max(0, Number(event.target.value) || 0))} /></label>
            <button className="secondary-button" type="button" disabled={!manualName.trim()} onClick={addManualParticipant}>Add Participant</button>
          </div>
          {selected.participantType === "Singles" && <div className="competition-tew-add">
            <label className="field"><span>Imported TEW wrestler</span><select aria-label="Imported TEW competition participant" disabled={!snapshot} value={tewWorkerId} onChange={(event) => setTewWorkerId(event.target.value)}><option value="">{snapshot ? "Select a TEW worker" : "Load a TEW snapshot first"}</option>{snapshot?.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label>
            <button className="secondary-button" type="button" disabled={!tewWorkerId} onClick={addTewWorker}>Add TEW Wrestler</button>
          </div>}
          {selected.participants.length === 0 ? <div className="empty-state">No participants have been added.</div> : <div className="competition-participant-list">
            {selected.participants.map((participant) => <article key={participant.id}>
              <div><strong>{participant.name}</strong><span>{participant.memberNames.join(" · ") || selected.participantType}</span><small>{participant.source === "tew" ? "Linked to TEW worker" : "Manual tracker entry"}</small></div>
              <label className="field"><span>Seed</span><input aria-label={`${participant.name} seed`} type="number" min={0} value={participant.seed} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, participants: competition.participants.map((item) => item.id === participant.id ? { ...item, seed: Math.max(0, Number(event.target.value) || 0) } : item) }))} /></label>
              <label className="field"><span>Status</span><select aria-label={`${participant.name} status`} value={participant.status} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, participants: competition.participants.map((item) => item.id === participant.id ? { ...item, status: event.target.value as typeof participant.status } : item) }))}><option>Active</option><option>Eliminated</option><option>Withdrawn</option><option>Champion</option></select></label>
              <button className="danger-button compact-button" type="button" onClick={() => updateCompetition(selected.id, (competition) => ({ ...competition, participants: competition.participants.filter((item) => item.id !== participant.id) }))}>Remove</button>
            </article>)}
          </div>}
        </section>}

        {tab === "Bracket and Schedule" && <section className="competition-panel">
          <header><div><h4>{selected.format === "Single Elimination" ? "Bracket" : "Match schedule"}</h4><p>Schedule matches onto planned shows, then sync completed TEW results after reconciliation.</p></div><div className="competition-header-actions"><button className="secondary-button" type="button" onClick={generateStructure} disabled={selected.participants.length < 2}>Regenerate Structure</button><button className="primary-button" type="button" onClick={syncResults}>Sync Reconciled Results</button></div></header>
          {selected.fixtures.length === 0 ? <div className="empty-state">Add at least two participants and generate the competition structure.</div> : <div className="competition-rounds">
            {Array.from(new Set(selected.fixtures.map((fixture) => fixture.roundNumber))).map((roundNumber) => {
              const fixtures = selected.fixtures.filter((fixture) => fixture.roundNumber === roundNumber);
              return <section className="competition-round" key={roundNumber}><header><h5>{fixtures[0]?.roundLabel}</h5><span>{fixtures.length} match{fixtures.length === 1 ? "" : "es"}</span></header><div>
                {fixtures.map((fixture) => <article className={`competition-fixture competition-fixture--${fixture.status.toLowerCase()}`} key={fixture.id} data-fixture-id={fixture.id}>
                  <div className="competition-fixture__identity"><span>#{fixture.bracketPosition}</span><strong>{fixtureDisplayName(selected, fixture)}</strong><small>{fixture.status}{fixture.resultType ? ` · ${fixture.resultType}` : ""}</small>{fixture.resultType ? <details><summary>Structured result ledger</summary><small>Winner ID: {fixture.winnerId || "None"}</small><small>Loser ID: {fixture.loserId || "None"}</small><small>Submissions: {fixture.submissionWinnerCount}-{fixture.submissionLoserCount}</small><small>Source result: {fixture.sourceResultId || "Manual competition entry"}</small></details> : null}</div>
                  <div className="competition-fixture__result">
                    <label className="field"><span>Result note / time</span><input aria-label={`${fixture.roundLabel} ${fixture.bracketPosition} result note`} value={fixture.scoreText} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, fixtures: competition.fixtures.map((item) => item.id === fixture.id ? { ...item, scoreText: event.target.value } : item) }))} /></label>
                    <label className="field"><span>Winner submissions</span><input aria-label={`${fixture.roundLabel} ${fixture.bracketPosition} winner submissions`} type="number" min="0" value={fixture.submissionWinnerCount} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, fixtures: competition.fixtures.map((item) => item.id === fixture.id ? { ...item, submissionWinnerCount: Math.max(0, Number(event.target.value) || 0) } : item) }))} /></label>
                    <label className="field"><span>Loser submissions</span><input aria-label={`${fixture.roundLabel} ${fixture.bracketPosition} loser submissions`} type="number" min="0" value={fixture.submissionLoserCount} onChange={(event) => updateCompetition(selected.id, (competition) => ({ ...competition, fixtures: competition.fixtures.map((item) => item.id === fixture.id ? { ...item, submissionLoserCount: Math.max(0, Number(event.target.value) || 0) } : item) }))} /></label>
                    <select aria-label={`${fixture.roundLabel} ${fixture.bracketPosition} winner`} value={fixture.winnerId} disabled={!fixture.participantAId || !fixture.participantBId || fixture.status === "Bye"} onChange={(event) => recordWinner(fixture, event.target.value)}><option value="">Select winner</option>{[fixture.participantAId, fixture.participantBId].filter(Boolean).map((participantId) => <option key={participantId} value={participantId}>{participantName(selected, participantId)}</option>)}</select>
                    {selected.format !== "Single Elimination" && <button className="secondary-button compact-button" type="button" disabled={!fixture.participantAId || !fixture.participantBId} onClick={() => recordDraw(fixture)}>Record Draw</button>}
                    <button className="secondary-button compact-button" type="button" disabled={!fixture.participantAId || !fixture.participantBId} onClick={() => recordNeutral(fixture, "No Contest")}>Record No Contest</button>
                    <button className="secondary-button compact-button" type="button" disabled={!fixture.participantAId || !fixture.participantBId} onClick={() => recordNeutral(fixture, "Cancelled")}>Cancel Fixture</button>
                    <button className="secondary-button compact-button" type="button" disabled={!fixture.resultType} onClick={() => updateCompetition(selected.id, (competition) => resetCompetitionResult(competition, fixture.id))}>Reset Result</button>
                  </div>
                  <div className="competition-fixture__schedule">
                    <select aria-label={`${fixture.roundLabel} ${fixture.bracketPosition} target show`} value={targetShows[fixture.id] ?? fixture.scheduledShowId} disabled={Boolean(fixture.plannedSegmentId)} onChange={(event) => setTargetShows((current) => ({ ...current, [fixture.id]: event.target.value }))}><option value="">Select planned show</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name} · {show.date}</option>)}</select>
                    {fixture.plannedSegmentId ? <button className="primary-button compact-button" type="button" onClick={() => onOpenShow(fixture.scheduledShowId, fixture.plannedSegmentId)}>Open Planned Match</button> : <button className="primary-button compact-button" type="button" disabled={!fixture.participantAId || !fixture.participantBId || !(targetShows[fixture.id] || fixture.scheduledShowId)} onClick={() => addToShow(fixture)}>Add to Planned Show</button>}
                  </div>
                </article>)}
              </div></section>;
            })}
          </div>}
        </section>}

        {tab === "Standings" && <section className="competition-panel">
          <header><div><h4>Competition standings</h4><p>Points are recalculated from structured results. Head-to-head is the first tiebreak; unresolved ties require a Committee decision or playoff and are never decided alphabetically.</p></div></header>
          {selected.unresolvedTieParticipantIds.length > 0 && <div className="status-banner" role="status"><span>Advancement or the competition winner is blocked by an unresolved mathematical tie.</span></div>}
          {standings.length === 0 ? <div className="empty-state">Add participants to create the standings table.</div> : <div className="competition-standings">
            <div className="competition-standing competition-standing--header"><span>Rank</span><span>Participant</span><span>P</span><span>W</span><span>D</span><span>L</span><span>NC</span><span>Pts</span></div>
            {standings.map((standing) => <div className="competition-standing" key={standing.participantId}><strong>{standing.tied ? `T${standing.rank}` : standing.rank}</strong><strong>{standing.participantName}<details><summary>Points and tiebreak ledger</summary>{standing.tiebreakExplanation.map((line) => <small key={line}>{line}</small>)}</details></strong><span>{standing.played}</span><span>{standing.wins}</span><span>{standing.draws}</span><span>{standing.losses}</span><span>{standing.noContests}</span><strong>{standing.points}</strong></div>)}
          </div>}
          {selected.championParticipantId && <div className="competition-presentation"><span>Competition winner</span><strong>{champion}</strong><p>{selected.championPresentation || selected.prize || "Winner presentation has not been defined."}</p></div>}
        </section>}
      </div>}
    </div>

    <footer className="competition-boundary"><strong>TEW companion boundary</strong><span>The tracker controls brackets, schedules, standings, traditions, and handoff links. TEW remains authoritative for the actual match result and rating.</span></footer>
  </section>;
}
