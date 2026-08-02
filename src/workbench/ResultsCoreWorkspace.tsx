import { useState } from "react";
import { createShowOperationsRecord } from "../operations/model";
import ShowOperationsWorkspace from "../operations/ShowOperationsWorkspace";
import { loadShowOperationsUniverse, saveShowOperationsUniverse } from "../operations/storage";
import { loadPlannedShows } from "../planner/storage";
import type { TewSnapshot } from "../tew/types";

export default function ResultsCoreWorkspace({
  snapshot,
  onOpenShow,
  onOpenHandoff,
  onOpenTransfer,
}: {
  snapshot: TewSnapshot | null;
  onOpenShow: (showId: string, segmentId: string) => void;
  onOpenHandoff: (showId: string) => void;
  onOpenTransfer: (showId: string) => void;
}) {
  useState(() => {
    const shows = loadPlannedShows(window.localStorage);
    const universe = loadShowOperationsUniverse(window.localStorage);
    const records = shows.map((show) => {
      const existing = universe.records.find((record) => record.showId === show.id) ?? createShowOperationsRecord(show.id);
      return { ...existing, lastViewedTab: "results" as const, updatedAt: new Date().toISOString() };
    });
    const unrelated = universe.records.filter((record) => !shows.some((show) => show.id === record.showId));
    saveShowOperationsUniverse(window.localStorage, { records: [...records, ...unrelated] });
    return true;
  });

  return <ShowOperationsWorkspace snapshot={snapshot} onOpenShow={onOpenShow} onOpenHandoff={onOpenHandoff} onOpenTransfer={onOpenTransfer} />;
}
