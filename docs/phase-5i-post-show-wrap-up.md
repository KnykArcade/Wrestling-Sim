# Phase 5I — Post-Show Consequence Center and Continuity Rollforward

Phase 5I adds a sixth step to the unified TEW companion workflow:

**Setup → Approaches & Output → Production Package → TEW Entry → Result → Post-Show Wrap-Up**

Total Extreme Wrestling IX remains authoritative for actual match winners and ratings. The companion does not write to MDB or ACCDB files and does not apply a championship, competition, storyline, booking-idea, character-arc, or follow-up consequence until the user explicitly confirms it.

## Opening Wrap-Up

A show becomes eligible for Wrap-Up after its completed TEW show has been linked and reconciled. The Show Session calendar bridge then displays the current Wrap-Up status:

- Wrap-Up Not Reviewed
- In Progress
- Closed
- Amendment Open

A reconciled show with an unfinished Wrap-Up displays **Finish Post-Show Wrap-Up** instead of silently moving to the next card.

## Final segment records

Every planned segment receives a permanent post-show review.

### Matches

The review displays the linked TEW result, including the actual winner, duration, rating, result description, notes, and participants when available. The user records:

- Yes, Partially, No, or Unresolved for whether the match happened as planned
- Final Match Story
- Changes from the original plan
- Actual consequences
- Final follow-up
- Private correction notes

A planned match without a confident TEW result cannot be completed unless the user deliberately marks it unresolved. The tracker never invents a result.

### Angles

Because the imported TEW show history does not retain the companion's full Angle Output, the user records:

- Yes, Partially, No, or Unresolved
- Optional actual angle rating
- Final Angle Segment Output
- Changes from the original plan
- Actual consequences
- Final follow-up
- Private correction notes

The original planned Angle Output remains preserved beside the final record.

## Reconciled Actual Versions

After a final record is reviewed, the user can create a permanent **Reconciled Actual Version** in the Output Library. The version includes:

- TEW result details for matches
- Manually reviewed actual details for angles
- Planned-versus-actual outcome
- Final narrative
- Changes
- Actual consequences
- Final follow-up
- Reconciliation timestamp
- Source TEW snapshot

Earlier plan, draft, applied, Ready for TEW, and entered-in-TEW versions remain intact. Identical actual versions are not duplicated. A later correction creates another permanent actual version rather than replacing history.

## Championship decision queue

Every unconfirmed reconciled title match is presented with:

- Championship
- Champion entering
- Challenger
- Actual TEW winner
- Suggested result
- Suggestion explanation
- Current champion
- Proposed lineage effect

The available decisions are:

- Retained
- Changed Hands
- Vacated
- Unresolved
- Deferred

Nothing changes until **Confirm Championship Decision** is selected. A title change previews the old champion, new champion, reign start date, source show and match, and defense changes. Tag-team and trios title changes remain blocked until all new champion names are explicitly resolved.

## Competition-result queue

A linked Cup, League, tournament, or Classic fixture displays:

- Competition and round
- Scheduled participants
- Actual TEW winner
- Proposed competition participant
- Proposed result type
- Bracket advancement or standings preview

The user confirms Decision, Draw, No Contest, Cancelled, or Deferred. Single-elimination draws cannot advance. Missing or ambiguous wrestler identity blocks a decision rather than guessing.

For league competition, the preview shows updated points, wins, draws, losses, and position before confirmation.

## Continuity review

### Storyline milestones

Milestones assigned to the completed show can be recorded as:

- Completed
- Delayed
- Cancelled
- Reassigned
- Unchanged

The user may also explicitly update the storyline phase, status, aftermath, and review note. No turn, betrayal, climax, payoff, or conclusion is inferred.

### Booking ideas

Open booking ideas linked to the show can be:

- Completed
- Delayed
- Kept active
- Reassigned
- Archived

### Character arcs

Character arcs targeted to the show can record:

- Progress
- Turning point
- Resolution
- Delay
- Keep active

Progress, turning-point, and resolution decisions require a written explanation of what occurred.

## Follow-up rollforward

Final follow-ups retain their source show and segment. Each can be sent to:

- Promotion Calendar inbox
- Existing future segment
- New grounded match placeholder
- New grounded angle placeholder
- Dismissed with a reason
- Left open deliberately

A grounded placeholder retains the entered follow-up, relevant storyline, championship, competition, and source information. It does not select wrestlers, winner, finish, dialogue, rating, or a new creative development.

Existing continuity decisions are reused to prevent duplicate inbox records.

## Show Closure

The closure checklist requires:

- Every final segment record reviewed
- Every Reconciled Actual Version linked
- Every match result linked or deliberately unresolved
- Every championship decision confirmed or deferred
- Every competition decision confirmed or deferred
- Every assigned milestone reviewed
- Every linked booking idea reviewed
- Every targeted character arc reviewed
- Every final follow-up assigned, dismissed, or deliberately left open

Closing generates a permanent Show Closure Report containing:

- TEW show identity
- Attendance and overall rating when available
- Complete running order
- Winners, durations, ratings, and final narratives
- Planned-versus-actual changes
- Championship and competition decisions
- Milestone, booking-idea, and character-arc decisions
- Follow-up destinations
- Outstanding decisions
- Output Library actual-version identifiers

The report can be copied as text or exported as structured JSON.

## Recovery, undo, and amendments

Before the first consequence is applied, the companion saves a complete pre-Wrap-Up snapshot of:

- Planned shows
- Championships
- Competitions
- Storylines
- Booking ideas
- Worker creative profiles and arcs
- Promotion Calendar
- Output Library

Before closure, the latest applied consequence can be undone, or the entire pre-Wrap-Up snapshot can be restored. Every reversal remains in audit history.

After closure, the user can open a correction amendment. Amendments preserve the original closure report and decision audit rather than rewriting history.

## Backup version 20

Version 20 preserves:

- Wrap-Up sessions and status
- Final segment reviews
- Detailed planned-outcome values
- Championship and competition decisions
- Storyline, booking-idea, and character-arc decisions
- Follow-up rollforward records
- Output Library actual-version links
- Closure reports
- Audit records
- Recovery snapshots
- Rollbacks and amendments
- All existing version 19 Promotion Calendar data

Versions 1 through 19 remain importable. Older reconciled shows migrate as **Wrap-Up Not Reviewed**, with no automatic downstream changes.

## Safety boundary

Phase 5I does not add:

- MDB or ACCDB writing
- Live TEW save modification
- Automatic title changes
- Automatic bracket or standings changes
- Automatic storyline progression
- Automatic character-arc progression
- Invented match or angle results
- Invented winners, finishes, dialogue, turns, betrayals, or title outcomes
- Contracts, finances, morale, worker development, AI-controlled promotions, or replacement simulation
