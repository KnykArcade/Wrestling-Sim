# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for planning cards, selecting match approaches, writing Match Stories and Angle Segment Outputs, preparing TEW handoff packages, and preserving creative history. TEW remains the game and the final authority for running every show.

## Phase 4C4: Generated Match Stories and Angle Outputs

Every planned match and angle now includes an editable output assistant inside the Planned Show Workspace.

### Generated Match Story drafts

A match draft can use:

- The selected match aim and ideal pace
- Each wrestler’s chosen approaches
- Source-derived approach phrases from the uploaded phrase library
- Stamina usage and pace evaluation
- The optional saved performance preview
- Mental state and projected execution differences
- The booker-entered winner and finish
- Interference, post-match events, consequences, and follow-up

The draft is divided into:

- Opening
- Middle
- Turning point
- Finish
- Aftermath

The complete draft remains editable before it is applied. It can replace or append to the existing Match Story, and its phase map can be copied into Key Moments.

The generator never promotes an advisory projected winner into the booking. When no planned winner is entered, the finish deliberately remains unresolved for TEW or later booking.

### Generated Angle Segment Outputs

Angle drafts use only information already entered in the tracker:

- Workers and roles
- Location
- Content type
- Story purpose
- Storyline consequences
- Planned follow-up
- Intended audience takeaway

No unsupplied dialogue or detailed action is presented as source material. The generator supplies editable structural connector text around the facts entered by the user.

### Source transparency

The output assistant distinguishes between:

- Source-derived approach wording
- Existing tracker facts
- Editable tracker template sentences

When an approach has no dedicated phrase-library row, its source summary is used and a warning is displayed. Nothing is silently treated as recovered TEW text.

### Applying an output

Generated drafts can be:

- Edited directly in the preview
- Copied to the clipboard
- Used to replace the permanent Match Story or Segment Output
- Appended to existing writing
- Applied to the match Key Moments phase map

Once applied, the normal tracker systems already carry the output into:

- TEW handoff packages
- Storyline timelines
- Worker appearance histories
- Planned-versus-actual reconciliation
- Permanent enhanced show history

## Phase 4C3: Advisory Performance Preview

The optional preview evaluates approaches, mental state, luck, consistency, pace, and stamina. It produces an advisory match score and star preview while TEW remains authoritative by default.

Available result modes:

- **TEW authoritative:** no winner is selected in the tracker.
- **Booker-selected winner:** the booked winner remains fixed.
- **Competitive preview:** an advisory probability is shown without changing the booking or TEW result.

## Phase 4C2: Match Setup and Approach AI

Every planned match supports:

- Nineteen match aims
- Duration-controlled approach slots
- Tracker-side wrestler ratings and styles
- Eighteen approach skills
- Workbook stamina-rating and capacity bands
- Combination-level approach selection
- Manual approach choices and locks

Approach slots remain:

- 5 minutes or less: 1 approach per wrestler
- 6–15 minutes: 2 approaches per wrestler
- 16–24 minutes: 3 approaches per wrestler
- 25 minutes or longer: 4 approaches per wrestler

## Existing systems

- Planned shows with ordered matches and angles
- TEW Show Handoff and guided Entry Assistant
- Read-only MDB/ACCDB snapshot import
- Planned-versus-actual reconciliation
- Storyline Hub and timelines
- Worker creative profiles and relationships
- Championship lineage, rankings, and programs
- Creative Control Center and Future Booking Board

## Backups

Version 10 backups continue to include planned and reconciled shows, applied Match Stories and Segment Outputs, approach setup, wrestler match profiles, saved performance previews, storylines, workers, relationships, booking ideas, championships, and TEW handoff data.

Generated drafts are temporary until the user applies them. Applied text is stored in the existing Match Story, Key Moments, or Segment Output fields, so no new backup format is required for Phase 4C4.

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
- Generated text is editable companion data.
- Advisory previews never overwrite TEW results.
- Browser data saves automatically to the current preview origin.

## Open in GitHub Codespaces

1. Open this repository in GitHub.
2. Choose **Code → Codespaces → Create codespace on the current branch**.
3. Wait for dependency installation to finish.
4. Run `npm run dev`.
5. Open the forwarded **TEW Story Tracker Preview** port.

Export a full backup before deleting a Codespace or moving to another Codespaces URL. Never commit a TEW `.mdb` or `.accdb` file to GitHub.

## Verification

```bash
npm test
npm run build
npm run test:browser
```

GitHub Actions runs all three checks for every pull request.
