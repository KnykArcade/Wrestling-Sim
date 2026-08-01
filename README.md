# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for planning cards, writing Match Stories and Angle Segment Outputs, selecting match approaches, preparing TEW handoff packages, and preserving creative history. TEW remains the game and the final authority for running every show.

## Phase 4C3: Advisory Match Performance Preview

Every planned match can now produce an optional tracker-side preview after its wrestlers and approaches are configured.

### TEW remains authoritative

The default mode is **TEW authoritative**. In this mode the tracker:

- Evaluates each wrestler’s likely performance
- Rolls mental state, luck, consistency variance, and rare performance swings
- Shows stamina and pace effects
- Produces an advisory 0–100 match score and star-rating preview
- Identifies the strongest projected individual performance
- Does **not** select a winner

The actual winner and rating still come from TEW and can be reconciled into the tracker afterward.

Two optional modes are also available:

- **Booker-selected winner:** the winner already entered on the card remains fixed while the tracker previews execution and match quality.
- **Competitive preview:** the tracker shows an advisory projected winner and probability without changing the planned winner or the eventual TEW result.

### Mental state and night-to-night variation

The preview preserves the uploaded five-state structure:

- Hot Night: +5
- Focused: +2.5
- Neutral: 0
- Distracted: -5
- Off Night: -10

The source mental-state score continues to use health, popularity, experience, fan reaction, gimmick, overall ability, luck, and a rare performance swing. Wrestler Consistency controls the size of ordinary execution variance, so reliable wrestlers fluctuate less while inconsistent wrestlers have a wider range of nights.

### Transparent performance preview

Each wrestler’s preview displays:

- Average selected-approach rating
- Approach execution
- Presentation score
- Mental-state score and modifier
- Luck and rare swing
- Consistency variance
- Pace status
- Stamina status
- Final advisory performance score
- Win probability only when Competitive Preview is selected

The source workbook exposes final in-ring, booking, probability, score, and star outputs, but its final macro calculation is not preserved as a static worksheet formula. The tracker therefore keeps its additional presentation and star conversion formulas visible, deterministic, and explicitly advisory rather than presenting them as exact recovered workbook logic.

### Reproducible nights

- **Roll New Night** creates a new seed and new luck, mental-state, and consistency results.
- **Recalculate Same Night** reuses the saved seed, allowing ratings or approaches to be adjusted without silently changing the random night.
- Saved previews persist with the planned match.
- Duplicating a show retains the creative approach setup but clears the old rolled preview.

### TEW handoff integration

The TEW Entry Summary can include the advisory preview, clearly labeled as tracker-only, alongside:

- Match aim and ideal pace
- Selected approaches for every wrestler
- Approach and road-agent notes
- Championship, winner, finish, storyline, and Match Story details

Nothing is written into TEW automatically.

## Phase 4C2: Match Setup and Approach AI

Every planned match includes:

- One of nineteen match aims
- Duration-controlled approach slots
- Reusable tracker-side wrestler ratings
- Fifteen source-derived wrestler styles
- Eighteen approach skills
- Exact workbook stamina-rating and capacity bands
- Combination-level approach AI
- Manual approach selection and locks

The approved slot rules remain authoritative:

- 5 minutes or less: 1 approach per wrestler
- 6–15 minutes: 2 approaches per wrestler
- 16–24 minutes: 3 approaches per wrestler
- 25 minutes or longer: 4 approaches per wrestler

## Phase 4C1 foundation

The Match Engine reference workspace retains:

- Fifteen canonical approaches and weighted formulas
- Nineteen match aims
- Pace modifiers
- Stamina penalties
- Mental-state definitions
- Source aliases and unresolved legacy names
- Workbook reconciliation notes

## Existing systems

- Planned shows with ordered matches and angles
- Full Match Story and Angle Segment Output editors
- TEW Show Handoff and guided Entry Assistant
- Read-only MDB/ACCDB snapshot import
- Planned-versus-actual reconciliation
- Storyline Hub and timelines
- Worker creative profiles and relationships
- Championship lineage, rankings, and programs
- Creative Control Center and Future Booking Board

## Next match-engine phase

**Phase 4C4** will turn selected approaches and preview results into generated opening, middle, turning-point, finish, and follow-up text. Generated text will remain editable and will feed Match Stories, Angle Segment Outputs, TEW handoff, reconciliation, and permanent creative history.

## Backups

Version 10 backups include:

- Planned and reconciled shows
- Match approach setup for every planned match
- Reusable tracker-side wrestler match profiles
- Performance-preview settings and saved rolled nights
- Storylines, workers, relationships, booking ideas, and championships
- TEW handoff versions, mappings, checklists, and entry progress

Backup versions 1 through 9 remain importable.

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
- Match profiles, approaches, and previews are tracker-side companion data.
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
