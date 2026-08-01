# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for planning cards, writing Match Stories and Angle Segment Outputs, selecting match approaches, preparing TEW handoff packages, and preserving creative history. TEW remains the game and the authority for running the show.

## Phase 4C2: Match Setup and Approach AI

Every planned match now includes an approach setup panel directly inside the Planned Show Workspace.

### TEW companion boundary

Phase 4C2 does not replace TEW. It does not decide the winner, calculate a star rating, or write to the TEW database. It adds the creative and strategic material that TEW does not currently store in the form required by this tracker:

- Match aim
- Wrestler-selected approaches
- Stamina budgeting
- Match Story
- Angle Segment Output
- Road-agent and approach notes
- Copy-ready TEW handoff details

### Wrestler match profiles

Each TEW-linked or manual wrestler can have one tracker-side match profile containing:

- One of fifteen source-derived wrestler styles
- Overall, health, popularity, experience, fan reaction, and gimmick
- The eighteen skills used by the uploaded approach formulas
- Notes and a reusable TEW worker link

Profiles remain in browser storage and never modify TEW.

### Duration-based approach selection

The approved slot rules remain authoritative:

- 5 minutes or less: 1 approach per wrestler
- 6–15 minutes: 2 approaches per wrestler
- 16–24 minutes: 3 approaches per wrestler
- 25 minutes or longer: 4 approaches per wrestler

### Approach AI

The AI evaluates complete combinations rather than simply selecting the highest raw numbers. Its visible inputs are:

- Weighted approach rating
- Wrestler-style boost
- Transparent match-aim compatibility hint
- Fit with the selected ideal pace
- Stamina cost and available stamina
- Combination pacing and diversity
- Manually locked approaches

The selected plan displays its approach ratings, stamina use, estimated pace, and explanation. The user can run the AI, lock any choice, add or remove approaches manually, and rerun the remaining slots.

### Workbook stamina parity

The tracker reproduces the uploaded stamina-rating formula using Selling, Stamina, Resilience, Experience, Athleticism, and Toughness. It also preserves the source capacity bands from 1 through 9 available stamina.

### TEW handoff integration

The copy-ready TEW summary now includes:

- Match aim and ideal pace
- Selected approaches for every wrestler
- Approach and road-agent notes
- Existing championship, winner, finish, storyline, and Match Story details

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

## Next match-engine phases

- **Phase 4C3:** Optional simulation preview, outcome analysis, and rating model while preserving TEW-authoritative workflows
- **Phase 4C4:** Generated narratives and integration with worker, championship, storyline, and history systems

## Backups

Version 9 backups include:

- Planned and reconciled shows
- Match approach setup for every planned match
- Reusable tracker-side wrestler match profiles
- Storylines, workers, relationships, booking ideas, and championships
- TEW handoff versions, mappings, checklists, and entry progress

Backup versions 1 through 8 remain importable.

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
- Match profiles and approach selections are tracker-side companion data.
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
