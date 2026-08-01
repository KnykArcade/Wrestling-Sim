# TEW IX Story Tracker

A focused companion for **Total Extreme Wrestling IX** that preserves match stories, angle outputs, planned-versus-actual show history, and long-term storyline continuity without changing TEW's simulation, executable, or save files.

## Phase 3A status

Phase 3A adds the **Storyline Hub and Timeline**. The tracker can now organize individual planned and reconciled segments into long-running stories.

### Storyline Hub

Every tracker storyline stores:

- Status: Idea, Planned, Active, Paused, Completed, or Abandoned
- Start date and planned ending
- Current creative phase
- Linked championship
- Premise and central conflict
- Character motivations
- Planned beginning, climax, ending, and aftermath
- Private booking notes
- Participants and their storyline roles
- Milestones and payoff plans

Tracker storylines exist independently of TEW. Imported TEW storylines can be attached as references without writing anything back to the database.

### Automatic timeline

The hub finds planned and reconciled segments through their storyline references and builds a chronological timeline containing:

- Show and date
- Match or angle title
- Planned narrative
- Final reconciled narrative
- TEW result and rating when available
- Consequences and follow-up
- Workflow and reconciliation status

A timeline entry can open its related planned show and scroll directly to the segment.

### Participants and references

- Add participants from the current TEW snapshot or enter them manually.
- Assign roles such as Protagonist, Antagonist, Ally, Manager, or Authority figure.
- Attach imported TEW storyline records.
- Attach manual or TEW storyline references already used on planned-show segments.
- Exact-name storyline references are detected automatically.

### Milestones and continuity health

Milestones can represent an inciting incident, escalation, betrayal, reveal, match, title change, turn, climax, aftermath, or another creative beat. Each milestone can be unassigned, assigned to a show, completed, delayed, or cancelled.

Continuity warnings identify:

- Active stories with no future follow-up
- Overdue milestones
- Assigned participants who disappear from the story
- Completed stories with no aftermath
- Previously linked segments that were deleted
- Milestones assigned to deleted shows
- Completed stories with unfinished payoff matches or climaxes

Warnings never change TEW or block booking decisions.

## Phase 2C reconciliation

After running a show in TEW, the tracker can connect the planned card to the completed TEW show, suggest match links, preserve planned-versus-actual differences, record final angle details, and finalize enhanced show history.

The finalized record retains original plans, final narratives, TEW ratings and results, attendance, consequences, follow-ups, and the source MDB filename. It remains available after the TEW snapshot is closed.

## Planned-show workspace

- Create, rename, duplicate, and delete shows.
- Add matches and angles in running order.
- Write full Match Stories and Segment Outputs.
- Link workers and storylines.
- Track workflow status from Planned through Reconciled.
- Reconcile completed TEW results.
- Open a related segment directly from the Storyline Hub.
- Save automatically in browser storage.

## Backups

Version 4 full backups contain:

- Planned shows
- Reconciled enhanced history
- Tracker storylines
- Participants
- Reference links
- Milestones
- Timeline-link memory used for deleted-segment warnings

Version 1, 2, and 3 backups remain importable. They restore their show data with an empty storyline universe.

## TEW read-only import

The importer opens `.mdb` and `.accdb` snapshots in browser memory, inventories tables, reads previous shows, matches, participants, workers, and storylines, and exposes the mapped records to the planner and Storyline Hub.

It never writes to the selected database and never uploads it to an application server.

## Open in GitHub Codespaces

1. Open this repository in GitHub.
2. Choose **Code → Codespaces → Create codespace on the current branch**.
3. Wait for dependency installation to finish.
4. Run `npm run dev`.
5. Open the forwarded **TEW Story Tracker Preview** port.

No TEW database should be committed to GitHub. `.mdb` and `.accdb` files are excluded by `.gitignore`.

Browser storage belongs to the current preview origin. Export a full tracker backup before deleting a Codespace or moving to another Codespace URL.

## Verification commands

```bash
npm test
npm run build
npm run test:browser
```

GitHub Actions runs all three checks for every pull request.
