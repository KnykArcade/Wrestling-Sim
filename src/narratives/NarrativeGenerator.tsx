import { useState } from "react";
import type { MatchEngineUniverse } from "../matchEngine/types";
import type { PlannedSegment } from "../planner/types";
import {
  generateAngleNarrative,
  generateMatchNarrative,
  type GeneratedNarrativeDraft,
  type NarrativeDetail,
  type NarrativeTone,
} from "./generator";

type CopyState = "" | "Copied" | "Copy failed";

async function copyText(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function appendText(existing: string, addition: string): string {
  const left = existing.trim();
  const right = addition.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left}\n\n${right}`;
}

export default function NarrativeGenerator({
  segment,
  universe,
  onChange,
}: {
  segment: PlannedSegment;
  universe: MatchEngineUniverse;
  onChange: (segment: PlannedSegment) => void;
}) {
  const [tone, setTone] = useState<NarrativeTone>("sports");
  const [detail, setDetail] = useState<NarrativeDetail>("standard");
  const [usePerformancePreview, setUsePerformancePreview] = useState(true);
  const [draft, setDraft] = useState<GeneratedNarrativeDraft | null>(null);
  const [editableOutput, setEditableOutput] = useState("");
  const [copyState, setCopyState] = useState<CopyState>("");

  function generate(): void {
    const options = { tone, detail, usePerformancePreview };
    const next = segment.type === "match"
      ? generateMatchNarrative(segment, universe, options)
      : generateAngleNarrative(segment, options);
    setDraft(next);
    setEditableOutput(next.fullOutput);
  }

  function replacePrimaryOutput(): void {
    if (!draft || !editableOutput.trim()) return;
    const existing = segment.type === "match" ? segment.matchStory : segment.segmentOutput;
    if (existing.trim() && !window.confirm(`Replace the existing ${segment.type === "match" ? "Match Story" : "Segment Output"} with this generated draft?`)) return;
    if (segment.type === "match") {
      onChange({ ...segment, matchStory: editableOutput, keyMoments: draft.keyMoments });
    } else {
      onChange({ ...segment, segmentOutput: editableOutput });
    }
  }

  function appendPrimaryOutput(): void {
    if (!draft || !editableOutput.trim()) return;
    if (segment.type === "match") {
      onChange({
        ...segment,
        matchStory: appendText(segment.matchStory, editableOutput),
        keyMoments: appendText(segment.keyMoments, draft.keyMoments),
      });
    } else {
      onChange({ ...segment, segmentOutput: appendText(segment.segmentOutput, editableOutput) });
    }
  }

  function applyKeyMoments(): void {
    if (!draft || segment.type !== "match") return;
    onChange({ ...segment, keyMoments: draft.keyMoments });
  }

  async function handleCopy(): Promise<void> {
    const copied = await copyText(editableOutput);
    setCopyState(copied ? "Copied" : "Copy failed");
    window.setTimeout(() => setCopyState(""), 1600);
  }

  return <section className="narrative-generator" aria-label={`${segment.type === "match" ? "Match Story" : "Angle Segment Output"} generator`}>
    <header className="narrative-generator__header">
      <div>
        <p className="eyebrow">PHASE 4C4 · EDITABLE OUTPUT ASSISTANT</p>
        <h4>{segment.type === "match" ? "Generate a Match Story from the selected approaches" : "Generate an Angle Segment Output from the planned story beats"}</h4>
        <p>{segment.type === "match"
          ? "The draft uses approach phrases, match aim, stamina, pace, the planned finish, and the optional performance preview. It does not change TEW or choose a winner that you did not book."
          : "The draft uses only the workers, roles, location, purpose, consequences, follow-up, and audience takeaway already entered in this tracker."}</p>
      </div>
      <button className="primary-button" type="button" onClick={generate}>Generate Editable Draft</button>
    </header>

    <div className="narrative-generator__settings">
      <label className="field"><span>Presentation tone</span><select aria-label={`${segment.type} narrative tone`} value={tone} onChange={(event) => setTone(event.target.value as NarrativeTone)}><option value="sports">Sports presentation</option><option value="dramatic">Dramatic presentation</option><option value="road-agent">Road-agent direction</option></select></label>
      <label className="field"><span>Detail level</span><select aria-label={`${segment.type} narrative detail`} value={detail} onChange={(event) => setDetail(event.target.value as NarrativeDetail)}><option value="concise">Concise</option><option value="standard">Standard</option><option value="detailed">Detailed with approach map</option></select></label>
      {segment.type === "match" && <label className="narrative-generator__check"><input type="checkbox" checked={usePerformancePreview} onChange={(event) => setUsePerformancePreview(event.target.checked)} /><span>Use the saved advisory performance preview when available</span></label>}
    </div>

    {draft ? <div className="narrative-generator__draft">
      <div className="narrative-generator__phase-grid">
        <article><span>Opening</span><p>{draft.opening}</p></article>
        <article><span>Middle</span><p>{draft.middle}</p></article>
        <article><span>Turning point</span><p>{draft.turningPoint}</p></article>
        <article><span>Finish</span><p>{draft.finish}</p></article>
        <article><span>Aftermath</span><p>{draft.aftermath}</p></article>
      </div>

      <label className="field narrative-generator__output"><span>Editable generated {segment.type === "match" ? "Match Story" : "Segment Output"}</span><textarea aria-label={`Generated ${segment.type} narrative`} rows={14} value={editableOutput} onChange={(event) => setEditableOutput(event.target.value)} /></label>

      <div className="narrative-generator__actions">
        <button className="primary-button" type="button" onClick={replacePrimaryOutput}>Replace Current Output</button>
        <button className="secondary-button" type="button" onClick={appendPrimaryOutput}>Append to Current Output</button>
        {segment.type === "match" && <button className="secondary-button" type="button" onClick={applyKeyMoments}>Apply Phase Map to Key Moments</button>}
        <button className="secondary-button" type="button" onClick={() => void handleCopy()}>Copy Draft</button>
        {copyState && <span className={`copy-state copy-state--${copyState === "Copied" ? "ok" : "error"}`}>{copyState}</span>}
      </div>

      {draft.warnings.length > 0 && <div className="narrative-generator__warnings"><strong>Draft warnings</strong>{draft.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
      <details className="narrative-generator__provenance"><summary>What this draft is based on</summary>{draft.provenance.map((line) => <p key={line}>{line}</p>)}</details>
    </div> : <div className="narrative-generator__empty">Generate a draft after the participants and core story fields are entered. The result stays editable before it is applied to the permanent Match Story or Segment Output.</div>}
  </section>;
}
