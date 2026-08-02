# TEW IX Story Tracker

A browser-based **Total Extreme Wrestling IX companion** for planning cards, selecting match approaches, generating editable Match Stories and Angle Segment Outputs, managing competitions, preparing TEW handoff packages, and preserving creative history. TEW remains the game and the final authority for running every show.

## Phase 4D: Tournament, Cup, League, and Classic Management

The new **Competitions** workspace manages multi-match structures while keeping every actual match inside the existing TEW workflow.

### Supported competition types

- Tournament
- Cup
- League
- Classic
- Custom competition

Supported structures:

- Single elimination
- Round robin
- Double round robin
- Singles, tag-team, trios, or custom participant divisions

### PWL competition templates

The workspace includes ready-to-edit templates for:

- **PWL World Classic**
- **PWL World Tag Classic**
- **PWL League**

The Classic templates preserve the established presentation ideas:

- Permanent named trophy
- Ceremonial winner jacket
- Previous winner or winning team presenting the award
- A respectful handoff or an attack that launches the next rivalry
- Editable annual traditions and winner-presentation notes

### Participants and seeding

Competitions can use:

- Wrestlers linked from a loaded TEW snapshot
- Manual singles participants
- Manual tag teams or trios with member lists
- Seeds
- Active, eliminated, withdrawn, and champion statuses

### Brackets and league schedules

Single-elimination competitions generate the complete bracket, including automatic byes and later-round placeholders. Confirmed winners automatically advance through the bracket.

Round-robin competitions generate a balanced schedule. Double round robin creates the reverse fixtures as a second leg.

League tables calculate:

- Matches played
- Wins
- Draws
- Losses
- No contests
- Points
- Rank

Points for wins, draws, losses, and no contests remain editable. Ties are ordered transparently by points, wins, fewer losses, then name.

### Planned-show and TEW workflow

Every ready fixture can be added to an existing planned show. The generated match carries:

- Competition and fixture identifiers
- Round label
- Participants and teams
- Correct match-side assignments
- Competition purpose and advancement consequences
- Winner-presentation notes
- The existing match-approach, output-generator, handoff, and reconciliation tools

A fixture cannot be added twice accidentally. The Competition Hub can reopen its exact planned match.

After the show is run in TEW and reconciled, **Sync Reconciled Results** reads the actual recorded winner from the linked planned segment and updates the bracket or standings. TEW remains authoritative for the real winner and rating.

### Integrity warnings

The Competition Hub warns about:

- Too few participants
- A field without a generated structure
- Duplicate participant names
- Scheduled fixtures without a show
- Fixtures linked to deleted planned segments
- Completed decisions without a winner
- Completed competitions without a champion

### Backup version 11

Version 11 backups include:

- Competitions, participants, fixtures, brackets, standings rules, traditions, and winners
- Competition links on planned matches
- All previous planned shows, narratives, approaches, performance previews, storylines, workers, relationships, championships, booking ideas, and TEW handoff data

Backup versions 1 through 10 remain importable.

## Match approach and output workflow

Every planned match can still use:

- Nineteen match aims
- Duration-controlled approach slots
- Tracker-side wrestler ratings and styles
- Eighteen approach skills
- Combination-level approach AI
- Manual locks and stamina budgeting
- Optional advisory performance and star preview
- Editable opening, middle, turning-point, finish, and aftermath drafts

Approach slots remain:

- 5 minutes or less: 1 approach per wrestler
- 6–15 minutes: 2 approaches per wrestler
- 16–24 minutes: 3 approaches per wrestler
- 25 minutes or longer: 4 approaches per wrestler

The output generator never promotes an advisory projected winner into the booking. TEW-authoritative mode remains the default.

## Existing systems

- Planned shows with ordered matches and angles
- TEW Show Handoff and guided Entry Assistant
- Read-only MDB/ACCDB snapshot import
- Planned-versus-actual reconciliation
- Storyline Hub and timelines
- Worker creative profiles and relationships
- Championship lineage, rankings, and programs
- Creative Control Center and Future Booking Board

## Safety boundary

- TEW database access remains read-only.
- No database is uploaded to an application server.
- No TEW executable or live save-file mutation is performed.
- Brackets, standings, approaches, and generated text are editable companion data.
- Reconciled TEW results remain the authoritative competition result source.
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
