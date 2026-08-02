# Phase 5J — TEW Companion Home, Persistent Snapshot Vault, and Guided Promotion Onboarding

## Purpose

Phase 5J makes the companion usable as a continuing workspace for a real TEW save.

Before this phase, a parsed TEW snapshot lived only in React memory. Refreshing the browser removed it and forced another MDB selection before history-dependent work could continue.

Phase 5J introduces:

- A Companion Home at the beginning of Show Session
- Persistent parsed TEW snapshots in IndexedDB
- Explicit active-snapshot control
- Read-only supported-history comparison
- Promotion onboarding
- Worker and storyline identity review
- A global Data and Backup Center
- Complete companion backup format version 21
- A separate Snapshot Vault package for larger parsed history records

TEW remains authoritative for actual winners, match ratings, contracts, finances, company simulation, and the wider wrestling world.

## Companion Home

Companion Home answers four questions immediately:

1. Which TEW snapshot is active?
2. Which planned show is current?
3. What unfinished action comes next?
4. Is the complete companion data protected by a recent backup?

The home view displays:

- Active snapshot file name, role, import time, and mapping confidence
- Current planned show
- Next scheduled show
- Current Show Session step
- Promotion identity
- Shows awaiting TEW results
- Shows awaiting reconciliation
- Shows with Post-Show Wrap-Up pending
- Deferred obligations
- Unresolved title decisions
- Unresolved competition results
- Snapshot safety warnings
- Latest snapshot comparison
- Complete-backup time
- Snapshot-package time
- Snapshot Vault storage estimate

Primary actions are deliberately limited to the daily TEW companion workflow:

- Continue Current Show
- Import Updated TEW Snapshot
- Review New TEW Results
- Finish Post-Show Wrap-Up
- Open Promotion Calendar
- Export Complete Backup

## IndexedDB Snapshot Vault

Parsed TEW snapshots are stored in IndexedDB because they can be substantially larger than the tracker’s normal localStorage records.

The IndexedDB database is:

`tew-story-tracker-snapshot-vault`

The object store is:

`snapshots`

Each record contains:

- Snapshot ID
- Snapshot manifest
- Parsed `TewSnapshot`

The normal creative backup does not embed every parsed snapshot. This avoids making routine backup files excessively large.

## Snapshot manifest

The manifest remains in localStorage and is also included in the version 21 complete backup.

Each manifest record stores:

- ID
- Supported-content fingerprint
- File name
- Original file size
- Database-created date when available
- Import time
- Role
- User notes
- Total table count
- Mapped-table count
- Worker count
- Historical show count
- Historical match count
- Storyline count
- Mapping-warning count
- Mapping-confidence summary
- Estimated parsed size
- Created, updated, and last-activated times

## Snapshot roles

Roles are descriptive and do not alter the imported data.

Supported roles:

- Current TEW Save
- Baseline
- Before Show
- After Show
- Historical Reference
- Unclassified

The vault separately remembers:

- Active snapshot
- Baseline snapshot
- Most recent post-show snapshot
- Most recent reconciliation snapshot
- Most recent comparison

## Fingerprinting and duplicate detection

The fingerprint is calculated from supported parsed content, including:

- Database-created date
- Table metadata
- Workers
- Historical shows
- Historical matches
- Storylines
- Matched table mapping
- Import diagnostics

The fingerprint intentionally excludes volatile file metadata such as:

- File name
- File size
- Import timestamp

Two copies of the same supported TEW content therefore resolve to one vault record even when the copied MDB has a different file name.

Duplicate import behavior:

- Existing snapshot ID is retained
- Parsed content may be refreshed
- Role and notes may be updated
- No duplicate comparison is created
- Active snapshot state is updated deliberately

## Retention

The user can configure the maximum number of stored parsed snapshots.

Retention never automatically removes protected records:

- Active snapshot
- Baseline snapshot
- Most recent post-show snapshot
- Most recent reconciliation snapshot

Unprotected older records are considered first.

## Read-only snapshot comparison

Comparison is limited to fields the current reader actually supports.

### Historical shows

Detected differences include:

- New show
- Removed show
- Rating change
- Attendance change
- Venue change
- Company change
- Broadcast change

### Matches

Detected differences include:

- New match
- Removed match
- Winner change
- Rating change
- Duration change
- Description change
- Notes change

### Workers

Detected differences include:

- New worker identity
- Worker no longer detected

A missing worker never deletes a tracker profile.

### Storylines

Detected differences include:

- New storyline
- Storyline no longer detected
- Name change
- Description change
- Status change
- Heat change
- Participant-reference change

A missing storyline never deletes a tracker storyline.

### Mapper and warning changes

Detected differences include:

- Supported table mapping changed
- Import warning added
- Import warning resolved

### Explicit unsupported scope

Comparison does not claim to synchronize:

- Contracts
- Finances
- Morale
- Company-roster membership
- Championship ownership
- Worker development
- TEW booking settings not exposed by the current reader

## Stale-data safeguards

The companion warns when:

- No active snapshot exists
- The active snapshot contains no supported historical shows
- The active snapshot contains import warnings
- The active snapshot predates a planned show being reconciled
- A show was reconciled from a different snapshot file
- A later comparison indicates that previously detected match history changed
- Parsed snapshot size exceeds the configured warning threshold

Warnings are informational, important, or blocking. They do not mutate tracker records.

## Promotion onboarding

Promotion onboarding has three controlled sections.

### Promotion identity

The user confirms:

- Promotion name
- Abbreviation
- Default brand
- Default weekly show
- Default show length
- Calendar start date
- Active snapshot

Companies detected in historical show records are suggestions only.

### Worker identities

Worker matching evidence can include:

- Exact TEW worker ID
- Exact normalized name
- Multiple possible name matches
- No existing tracker profile

Available decisions include:

- Confirm Existing Link
- Link Existing Profile
- Create Identity-Only Profile
- Ignore
- Mark Ambiguous or Unresolved
- Preserve Tracker Name
- Update TEW Display Name

An identity-only profile:

- Uses the confirmed TEW worker ID and name
- Is reusable in planned cards
- Retains visible baseline placeholder values
- Is classified as Ratings Incomplete
- Does not receive invented ratings

Existing workbook values, field provenance, and manual overrides remain intact when a TEW identity is linked.

### Storyline identities

Storyline matching evidence can include:

- Existing TEW reference link
- Exact normalized tracker name
- Multiple possible tracker storylines
- No existing tracker storyline

Available decisions include:

- Link Existing Storyline
- Create Tracker Storyline
- Update Imported Fields Only
- Historical Only
- Ignore
- Preserve Tracker Details
- Mark Ambiguous or Unresolved

When a tracker storyline is created, Phase 5J copies only supported imported fields:

- Name
- Description
- Mapped status
- Heat as a source note
- Participant references
- TEW reference link

It does not invent:

- Premise expansion
- Central conflict
- Motivations
- Beginning
- Climax
- Ending
- Aftermath
- Milestones
- Turns
- Betrayals

When imported fields are refreshed, tracker-written creative fields remain unchanged.

## Incremental synchronization principles

Later snapshots can introduce new workers or storylines and can change supported imported fields.

The companion follows these rules:

- No worker profile is deleted because a worker is absent from a later snapshot.
- No tracker storyline is deleted because an imported storyline is absent.
- Manual wrestler ratings are not overwritten.
- Workbook provenance is not overwritten.
- Tracker creative details remain separate from imported TEW status and heat.
- Historical TEW shows are evidence, not automatically created planned shows.
- Reconciliation remains confirmation-based.

## Data and Backup Center

The Data Center is accessible from Companion Home rather than being buried in an advanced card editor.

It provides:

- Export Complete Companion Backup
- Preview Backup Before Restore
- Confirm Restore
- Automatic local pre-restore safety point
- Export Snapshot Vault Package
- Import Snapshot Vault Package
- Snapshot retention settings
- Snapshot storage warning threshold
- Clear Snapshot Vault Only
- Clear Creative Tracker Data Only

Clearing creative tracker data preserves Snapshot Vault contents.

Clearing Snapshot Vault contents preserves:

- Planned shows
- Match approaches
- Match Stories
- Angle Outputs
- Output Library
- Promotion Calendar
- Championships
- Competitions
- Storylines
- Wrestler profiles
- Post-Show Wrap-Up

## Complete backup version 21

Version 21 adds:

- Snapshot Vault manifest
- Active snapshot ID
- Baseline and post-show references
- Snapshot roles and notes
- Snapshot comparison history
- Promotion onboarding state
- Worker identity decisions
- Storyline identity decisions
- Companion Home state
- Data Center settings

It also preserves all version 20 data:

- Planned shows
- Reconciliation
- Match Engine
- Profile Library
- Output Library
- TEW handoff and transfer
- Show Operations
- Show Session
- Promotion Calendar
- Championships
- Competitions
- Storylines
- Worker creative profiles
- Post-Show Wrap-Up
- Closure reports
- Audits and amendments

Versions 1 through 20 remain importable.

Older backups migrate with:

- Empty Snapshot Vault manifest
- No active snapshot
- Onboarding Not Reviewed
- Existing creative tracker records unchanged

## Separate Snapshot Vault package

The Snapshot Vault package format is independent from the normal creative backup.

Package identity:

- Product: `TEW IX Snapshot Vault`
- Version: `1`

It contains:

- Snapshot Vault universe
- Parsed snapshot records present in IndexedDB

The package can be moved to another Codespaces preview origin and restored without re-importing every source MDB.

The original MDB files are not embedded or altered; the package stores the parsed read-only representation.

## Daily workflow

### Before booking

1. Open the cloud preview.
2. IndexedDB restores the active parsed snapshot.
3. Companion Home identifies the next action.
4. Open the current or next scheduled show.
5. Plan the card.
6. Select approaches.
7. Complete Match Stories and Angle Outputs.
8. Prepare and enter the card in TEW.

### After running TEW

1. Import the updated MDB snapshot.
2. The vault fingerprints and stores supported history.
3. Review the automatic comparison with the previous active snapshot.
4. Confirm completed-show and match links.
5. Reconcile TEW winners and ratings.
6. Complete Post-Show Wrap-Up.
7. Roll grounded follow-ups into a later show.
8. Continue to the next scheduled card.

## Security and scope boundary

Phase 5J does not add:

- MDB or ACCDB writing
- Live save mutation
- Executable modification
- Automatic booking
- Invented matches or angles
- Invented winners or finishes
- Invented dialogue
- Invented wrestler ratings
- Contract synchronization
- Financial synchronization
- Morale synchronization
- Automatic title changes
- Automatic competition advancement
- AI-controlled promotions
- A replacement wrestling simulation

TEW remains authoritative for actual winners and ratings.

## Verification requirements

The phase is not complete until these pass:

```bash
npm test
npm run build
npm run test:browser
```

Required coverage includes:

- Fingerprint stability
- Duplicate detection
- IndexedDB-compatible serialization
- Active snapshot restoration
- Supported-history comparison
- Worker and storyline identity matching
- Stale-data warnings
- Snapshot package round trip
- Version 20-to-21 migration
- Version 21 complete-backup round trip
- Browser refresh persistence
- Promotion onboarding
- Separate Data Center restore paths
