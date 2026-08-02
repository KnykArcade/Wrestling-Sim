import { useState } from "react";
import { loadPlannedShows } from "../planner/storage";
import { loadWorkbenchUniverse } from "../workbench/storage";
import { saveSegmentToOutputLibrary } from "./model";
import { loadOutputLibraryUniverse, saveOutputLibraryUniverse } from "./storage";

export default function WorkbenchOutputLibraryBridge({ onOpenOutputLibrary }: { onOpenOutputLibrary: () => void }) {
  const [notice, setNotice] = useState("");

  function saveCurrentSegment(): void {
    const workbench = loadWorkbenchUniverse(window.localStorage);
    const plannedShows = loadPlannedShows(window.localStorage);
    const mode = workbench.settings.defaultMode;
    const library = loadOutputLibraryUniverse(window.localStorage);

    if (mode === "planned-show") {
      const show = plannedShows.find((candidate) => candidate.id === workbench.settings.lastPlannedShowId) ?? plannedShows[0];
      const segment = show?.segments.find((candidate) => candidate.id === workbench.settings.lastPlannedSegmentId) ?? show?.segments[0];
      if (!show || !segment) {
        setNotice("Choose a planned-show segment in the Workbench before saving it to the Output Library.");
        return;
      }
      const result = saveSegmentToOutputLibrary(library, { segment, show, sourceKind: "Planned Show" });
      saveOutputLibraryUniverse(window.localStorage, result.universe);
      setNotice(result.createdVersion ? `${segment.title} saved with a new output-lineage version.` : `${segment.title} already matches the saved output; its production package was refreshed.`);
      return;
    }

    const quick = workbench.quickSegments.find((record) => record.id === workbench.settings.lastQuickSegmentId)
      ?? workbench.quickSegments.find((record) => record.type === (mode === "quick-angle" ? "angle" : "match"));
    if (!quick) {
      setNotice("Create or select a Quick Match or Quick Angle before saving it to the Output Library.");
      return;
    }
    const result = saveSegmentToOutputLibrary(library, {
      segment: quick.segment,
      sourceKind: "Quick Segment",
      quickSegmentId: quick.id,
      draftHistory: quick.draftHistory,
    });
    saveOutputLibraryUniverse(window.localStorage, result.universe);
    setNotice(result.createdVersion ? `${quick.segment.title} saved with its draft history and production package.` : `${quick.segment.title} already matches the saved output; its production package was refreshed.`);
  }

  return <section className="workbench-output-library-bridge">
    <div><p className="eyebrow">OUTPUT LIBRARY</p><strong>Preserve this segment beyond the current draft</strong><span>Save the current plan, generated drafts, applied output, TEW-entry version, and reconciled result as one permanent lineage.</span></div>
    <div><button className="primary-button" type="button" onClick={saveCurrentSegment}>Save Current Segment to Output Library</button><button className="secondary-button" type="button" onClick={onOpenOutputLibrary}>Open Output Library</button></div>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
