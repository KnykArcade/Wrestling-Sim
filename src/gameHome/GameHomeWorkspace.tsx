import { loadChampionshipUniverse } from "../championships/storage";
import { loadPlannedShows } from "../planner/storage";
import { loadPromotionScheduleUniverse } from "../schedule/storage";
import { loadStartingUniverseActivationState } from "../startingUniverse/activation";
import { firstDayReadiness } from "../startingUniverse/quickStart";
import { loadWorkerUniverse } from "../workers/storage";

interface GameHomeWorkspaceProps {
  onBookShow: (showId: string) => void;
  onOpenCalendar: () => void;
  onOpenRoster: () => void;
  onOpenChampionships: () => void;
  onOpenUniverse: () => void;
}

function displayDate(value: string): string {
  if (!value) return "Game date unavailable";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export default function GameHomeWorkspace({ onBookShow, onOpenCalendar, onOpenRoster, onOpenChampionships, onOpenUniverse }: GameHomeWorkspaceProps) {
  const activation = loadStartingUniverseActivationState(window.localStorage);
  const shows = loadPlannedShows(window.localStorage);
  const schedule = loadPromotionScheduleUniverse(window.localStorage);
  const workers = loadWorkerUniverse(window.localStorage);
  const championships = loadChampionshipUniverse(window.localStorage);
  const nextShow = shows.find((show) => show.id === activation.nextShowId)
    ?? schedule.links.map((link) => shows.find((show) => show.id === link.showId)).find((show) => show && show.date >= activation.gameDate && show.status !== "Reconciled")
    ?? null;
  const readiness = firstDayReadiness(nextShow);
  const rosterCount = workers.profiles.filter((profile) => profile.currentRole === "Wrestler" || profile.currentRole === "Occasional Wrestler").length;
  const activeTitles = championships.championships.filter((title) => title.status === "Active" || title.status === "Vacant").length;

  if (!activation.activeUniverseId) return <section className="game-home game-home--empty"><p className="eyebrow">GAME HOME</p><h2>No universe is active</h2><p>Load a Starting Universe to create the first playable day.</p><button className="primary-button" type="button" onClick={onOpenUniverse}>Open Starting Universe</button></section>;

  return <section className="game-home" aria-label="Game Home">
    <header className="game-home__hero"><div><p className="eyebrow">GAME HOME · PLAYABLE FIRST DAY</p><h2>{activation.activeCompanyName}</h2><p>{displayDate(activation.gameDate)}</p></div><span className={readiness.ready ? "ready" : "needs-booking"}>{readiness.ready ? "Ready to run" : "Booking required"}</span></header>
    <div className="game-home__facts" aria-label="Active game summary">
      <article><span>Current game date</span><strong>{activation.gameDate}</strong></article>
      <article><span>Roster</span><strong>{rosterCount}</strong></article>
      <article><span>Championships</span><strong>{activeTitles}</strong></article>
      <article><span>Television series</span><strong>{schedule.series.filter((series) => series.status === "Active").length}</strong></article>
    </div>
    <section className="game-home__next" aria-label="Next show quick start">
      <header><div><p className="eyebrow">NEXT SHOW</p><h3>{nextShow?.name ?? "No weekly show available"}</h3><p>{nextShow ? `${displayDate(nextShow.date)} · ${nextShow.company} · ${nextShow.expectedMinutes} minutes` : "Return to Starting Universe and activate an on-air weekly television show."}</p></div>{nextShow && <strong>{nextShow.segments.length} segment{nextShow.segments.length === 1 ? "" : "s"}</strong>}</header>
      <div className="game-home__readiness"><h4>{readiness.ready ? "The show can run" : "Complete before this show can run"}</h4>{readiness.blockers.length ? <ul>{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p>Every required booking item is complete.</p>}</div>
      <div className="game-home__actions"><button className="primary-button" type="button" disabled={!nextShow} onClick={() => nextShow && onBookShow(nextShow.id)}>Book Next Show</button><button className="secondary-button" type="button" onClick={onOpenCalendar}>Open Calendar</button><button className="secondary-button" type="button" onClick={onOpenRoster}>View Roster</button><button className="secondary-button" type="button" onClick={onOpenChampionships}>View Championships</button></div>
    </section>
  </section>;
}
