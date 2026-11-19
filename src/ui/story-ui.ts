/**
 * Story UI: reusable components (speaker label, dialogue/caption panel,
 * chapter card, evidence panel, notebook entry, cinematic controls) and the
 * two Story screens — the case file (New Case / Continue Case, chapter
 * selection, notebook) and the scene player.
 *
 * All text comes verbatim from the approved script (src/story/script.json,
 * built from docs/STORY_SCRIPT.md). Nothing here writes or paraphrases
 * dialogue. Routes that need chapter hand play (next stage) are labelled as
 * such instead of pretending to work.
 */
import { warm } from '../assets/warm';
import { bindLoadFailure, retryable } from './lazy';
import type { KeyValueStore } from '../app/storage';
import type { Block, Scene } from '../story/parse';
import { clearStory, newProgress, readStory, writeStory, type SceneId, type StoryHand, type StoryProgress } from '../story/progress';
import type { HandSetup } from '../story/chapters';
import { STAGING } from '../story/staging';
import { reachedEvidence, type ReachedEvidence } from '../story/evidence';
import { assetUrl } from '../assets';
import type { StoryCue } from '../audio/manager';
import { renderStoryRun } from './story-player';
import type { Outcome } from '../story/chapters';
import { sceneAssets } from './story-assets';
import { envKey } from '../assets/env';
import type { RuntimeAssetId } from '../assets';
import { wordmarkHtml } from './brand';
import { esc } from './svg';
import { confirmSheet } from './confirm';
import { menuPages } from './menu-pages';
import { reachedTranscript, type TranscriptEntry } from '../story/transcript';

// ---- speakers -----------------------------------------------------------------------
const NAMES: Record<string, { label: string; tone: string }> = {
  COUSIN: { label: 'Cousin', tone: 'cousin' },
  MARISOL: { label: 'Marisol', tone: 'marisol' },
  RAFA: { label: 'Rafa', tone: 'rafa' },
  VALE: { label: 'Vale', tone: 'vale' },
  LUZ: { label: 'Luz', tone: 'luz' },
};
/** Display label for a script speaker tag; the tag's own qualifier (e.g. "narration") is kept. */
export function speakerOf(tag: string): { label: string; qualifier: string | null; tone: string } {
  const [who, ...rest] = tag.split(',');
  const base = NAMES[who!.trim()] ?? { label: who!.trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()), tone: 'other' };
  return { ...base, qualifier: rest.join(',').trim() || null };
}

export function speakerLabelHtml(tag: string): string {
  const s = speakerOf(tag);
  return `<p class="speaker speaker-${s.tone}"><span class="speaker-name">${esc(s.label)}</span>${s.qualifier ? `<span class="speaker-q">${esc(s.qualifier)}</span>` : ''}</p>`;
}

export type ChapterStatus = 'completed' | 'next' | 'locked' | 'reading';
export function chapterCardHtml(s: Scene, status: ChapterStatus, opts: { compact?: boolean } = {}): string {
  const num = s.number === null ? (s.id === 'prologue' ? 'Prologue' : 'Epilogue') : `Chapter ${s.number}`;
  const badge = { completed: 'Completed', next: 'Up next', locked: 'Not reached yet', reading: 'In progress' }[status];
  return `<article class="chapter-card${opts.compact ? ' is-compact' : ''}" data-chapter="${esc(s.id)}" data-status="${status}">
    <p class="chapter-num">${esc(num)}</p>
    <h3 class="chapter-title">${esc(s.title)}</h3>
    ${s.location ? `<p class="chapter-meta"><span class="sr-only">Location: </span>${esc(s.location)}</p>` : ''}
    ${s.hand ? `<p class="chapter-hand"><span class="chapter-hand-label">Hand</span> ${esc(s.hand)}</p>` : ''}
    <p class="chapter-badge">${badge}</p>
  </article>`;
}

const chapterLabel = (id: SceneId): string => (id.startsWith('chapter-') ? `Chapter ${id.slice(8)}` : id === 'prologue' ? 'Prologue' : 'Epilogue');

/**
 * Reached evidence as inspection cards (Case file → Evidence), one card per item, paginated by menu-pages.
 * The excerpt is the approved caption exactly as the player saw it, rendered as text by code over the blank
 * card art (`prop.evidence-card`); the exhibit number and chapter are interface labels. No item beyond the
 * case's saved position (reachedEvidence), and nothing here writes state.
 */
export function evidenceCardsHtml(items: readonly ReachedEvidence[]): string {
  if (!items.length) return '<li class="evidence-empty">No evidence collected yet. It appears here as the case uncovers it.</li>';
  return items
    .map((e, i) => `<li class="evidence-card" data-evidence="${esc(e.id)}"><article class="evidence-card-paper" aria-label="Exhibit ${i + 1} of ${items.length}, ${esc(chapterLabel(e.scene))}"><p class="evidence-card-kicker">Exhibit ${i + 1} <span aria-hidden="true">·</span> ${esc(chapterLabel(e.scene))}</p><p class="evidence-card-text">${esc(e.text)}</p></article></li>`)
    .join('');
}

const RESULT_WORDS: Record<Outcome, string> = { win: 'Cousin’s side won the hand', loss: 'Cousin’s side lost the hand', tie: 'Blocked tie' };
/** The reached-only transcript as list items: verbatim lines, player captions, each hand's actual result. */
export function transcriptHtml(scenes: readonly Scene[], entries: readonly TranscriptEntry[]): string {
  if (!entries.length) return '<li class="evidence-empty">Nothing yet. Lines appear here as you read them.</li>';
  const out: string[] = [];
  let scene: string | null = null;
  for (const e of entries) {
    if (e.scene !== scene) {
      scene = e.scene;
      const sc = scenes.find((x) => x.id === e.scene);
      out.push(`<li class="transcript-scene notebook-chapter">${esc(chapterLabel(e.scene))}${sc ? ` · ${esc(sc.title)}` : ''}</li>`);
    }
    if (e.kind === 'line') out.push(`<li class="transcript-line"><strong>${esc(speakerOf(e.speaker).label)}:</strong> ${esc(e.text)}</li>`);
    else if (e.kind === 'caption') out.push(`<li class="transcript-caption">${esc(e.text)}</li>`);
    else out.push(`<li class="transcript-result">${e.outcome ? esc(RESULT_WORDS[e.outcome]) : 'Hand result not recorded on this device (played before results were kept)'}${e.assisted ? ' · finished with AI assistance' : ''}</li>`);
  }
  return out.join('');
}

export function notebookEntryHtml(s: Scene): string {
  const entry = s.blocks.find((b) => b.kind === 'notebook');
  if (!entry) return '';
  return `<li class="notebook-entry"><p class="notebook-chapter">Chapter ${s.number} · ${esc(s.title)}</p><p class="notebook-text">${esc(entry.raw.replace(/^Notebook:\s*/, ''))}</p></li>`;
}

// ---- data ---------------------------------------------------------------------------
interface ScriptJson {
  readonly scenes: readonly Scene[];
}
/** The script is a separate chunk, loaded only when Story opens (and precached for offline play). */
// A failed load is forgotten (never cached), so Retry really fetches the script again.
const scriptLoader = retryable(() => import('../story/script.json').then((m) => (m.default ?? m) as unknown as ScriptJson));
export const loadScript = (): Promise<ScriptJson> => scriptLoader.get();

/** Blocks the player shows in this stage: spoken lines and descriptive captions. */
export const playable = (s: Scene): Block[] => s.blocks.filter((b) => b.kind === 'line' || b.kind === 'direction');

export interface StoryHandRequest {
  readonly sceneId: SceneId;
  readonly setup: HandSetup;
  /** Resume this exact hand (refresh mid-hand); null deals a new one. */
  readonly restore: StoryHand | null;
  readonly replay: boolean;
  /** The table's own container (the story stage stays mounted beside it, hidden). */
  readonly host: HTMLElement;
  /** Compact cast portraits by seat (CSS background for a square face crop); seats without art keep their badges. */
  readonly faces?: Readonly<Partial<Record<number, string>>>;
  /** The hand's explicit backdrop (STAGING handEnv); null = drawn, no photo. */
  readonly env: RuntimeAssetId | null;
  onSnapshot(h: StoryHand): void;
  /** The hand resolved (any result advances the story). `assisted`: the AI finished some of Cousin's moves. */
  onResolved(winnerTeam: number | null, playerTeam: number, assisted: boolean): void;
  /** "Continue the case" on the results sheet. */
  onContinue(): void;
  /** Left the table from the pause sheet (the hand is kept for Continue Case). */
  onLeave(): void;
}

export interface StoryDeps {
  readonly root: HTMLElement;
  readonly store: KeyValueStore | null;
  onBack(): void;
  reduceMotion(): boolean;
  /** Story text preferences from Settings: text size (1, 1.15, 1.3) and instant text. */
  prefs?(): { textScale: number; instantText: boolean };
  /** Storage refused a write: show persistent feedback (never claim it saved). */
  onSaveFailed(): void;
  /** Per-record write health: every Story write's outcome, with a retry that writes that same progress. */
  onSaveResult?(ok: boolean, retry: () => boolean): void;
  /** Mount a chapter hand at the table (main.ts: GameSession + TableController + TableScreen in story mode). */
  playHand(req: StoryHandRequest): void;
  /** Tear the table down again (after Continue the case / leaving). */
  endHand(): void;
  /** Central audio manager's story cue hook (no second playback system). */
  cue(c: StoryCue): void;
  /** The story scene on screen (its audio profile), or null on the case file. */
  audioScene(id: SceneId | null): void;
  /** A new beat (or card) replaced the last one: cancel its unfinished cue sounds. */
  beat(): void;
  /** The epilogue's title reprise: the case-complete cue (AudioManager.caseComplete; silent if not supplied). */
  caseComplete?(): void;
  /** While a run is open: write its position now (true only if the write succeeded), and stop it (update). */
  registerRun?(hooks: { flush(): boolean; stop(): void } | null): void;
  /** One line on whether a scene is saved for offline play (null where offline isn't available). */
  offlineNote?(id: SceneId): string | null;
  /** A waiting app update (the case file shows "Update now"; the run's position is saved first). */
  readonly update?: { ready(): boolean; apply(): void };
  /** Story analytics (separate from Quick Play; disabled adapter until the owner's contract). Keys are local only. */
  readonly track?: {
    /** `assisted`: the hand was finished with AI help — it completes the chapter but isn't the player's own win. */
    chapterComplete(scene: SceneId, outcome: Outcome | 'none', replay: boolean, caseKey: string, assisted?: boolean): void;
    caseComplete(caseKey: string): void;
    resume(scene: SceneId, part: 'dialogue' | 'hand', via: 'continue' | 'update', positionKey: string): void;
    assist(scene: SceneId, key: string): void;
  };
  /** True once, right after an update reload that interrupted a story: reopen the saved scene without a tap. */
  takeAutoContinue?(): boolean;
  /** Dev/test: fast AI timings. */
  readonly fast?: boolean;
  /** False once the player has navigated away from the Story (a late load must not remount it). */
  isCurrent?(): boolean;
  /** Reload the app and come straight back to the Story (the browser keeps refusing a failed chunk). */
  reload?(): void;
}

/** The player has left the Story since this work started. */
export const storyGone = (d: StoryDeps): boolean => d.isCurrent?.() === false;

/** Write progress; on refusal, report it (persistent banner) and return false. */
export function save(d: StoryDeps, p: StoryProgress): boolean {
  const ok = writeStory(d.store, p);
  if (d.onSaveResult) d.onSaveResult(ok, () => writeStory(d.store, p));
  else if (!ok) d.onSaveFailed();
  return ok;
}


// ---- case file (Story home) --------------------------------------------------------
export async function renderStoryHome(d: StoryDeps, notice?: string): Promise<void> {
  d.audioScene(null);
  const { root } = d;
  // Warm the scene the player will see next (its backdrop for this viewport, then its cast) on the bounded
  // queue. Only when the case file opens — never at startup.
  const nextId = (readStory(d.store).value?.sceneId ?? 'prologue') as SceneId;
  const nextEnv = STAGING[nextId].env;
  if (nextEnv) void warm([envKey(nextEnv)]);
  let script: ScriptJson;
  try {
    script = await loadScript();
  } catch {
    if (storyGone(d)) return;
    root.className = 'is-story';
    root.innerHTML = '<div class="story-shell" data-region="story-load"></div>';
    return bindLoadFailure(root.querySelector('[data-region="story-load"]') as HTMLElement, { title: 'The case file didn’t load', body: 'Check your connection and try again. Your place in the case is saved on this device.', back: 'Back to menu' }, { retry: () => void loadScript().then(() => renderStoryHome(d, notice), () => (d.reload ? d.reload() : void renderStoryHome(d, notice))), back: () => d.onBack() });
  }
  if (storyGone(d)) return; // the player left while the script loaded
  const nextScene = script.scenes.find((x) => x.id === nextId);
  if (nextScene) void warm(sceneAssets(nextScene));
  const read = readStory(d.store);
  const p = read.value;
  const chapters = script.scenes.filter((s) => s.number !== null);
  const status = (s: Scene): ChapterStatus => (p?.completed.includes(s.id as SceneId) ? 'completed' : p?.sceneId === s.id ? 'reading' : s.number === 1 && p?.completed.includes('prologue') ? 'next' : 'locked');
  const where = p ? script.scenes.find((s) => s.id === p.sceneId) : null;
  const completedChapters = chapters.filter((s) => p?.completed.includes(s.id as SceneId));
  const evidence = reachedEvidence(script.scenes, p);
  root.className = 'is-story';
  root.innerHTML = `
    <div class="story-shell case-menu">
      <header class="story-head">
        <button type="button" class="btn-ghost back" data-act="story-home">← Menu</button>
        ${wordmarkHtml({ story: true, level: 'h1', className: 'is-story' })}
      </header>
      ${menuPages('Case file', [
        { title: 'Case', layout: 'case-actions panel-dark', html: `
        ${
          p
            ? `<button type="button" class="btn primary" data-act="story-continue">Continue Case</button>
               <p class="case-where">${where ? esc(`${where.number === null ? where.heading.split(' — ')[0] : `Chapter ${where.number}`} — ${where.title}`) : ''}</p>
               ${p && d.offlineNote?.(p.sceneId) ? `<p class="case-offline note">${esc(d.offlineNote(p.sceneId)!)}</p>` : ''}
               <button type="button" class="btn-ghost" data-act="story-new">New Case…</button>`
            : `<button type="button" class="btn primary" data-act="story-new">New Case</button>
               <p class="case-where">Seven chapters, seven hands. Every win, loss or blocked tie moves the case forward.</p>`
        }

          ${d.update ? `<div class="update-banner" data-region="update" ${d.update.ready() ? '' : 'hidden'}><p><strong>Update available.</strong> Your place in the case is saved first, and you come straight back to it.</p><button type="button" class="btn" data-act="update-now">Update now</button></div>` : ''}
          ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
        ` },
        { title: 'Chapters', layout: 'chapter-list chapter-select', list: 'ol', html: '<li class="case-list-note note-dark">Replay completed chapters without changing your place in the case.</li>' + chapters.map((s) => `<li>${chapterCardHtml(s, status(s), { compact: true })}${status(s) === 'completed' ? `<button type="button" class="btn-ghost small" data-act="story-replay" data-scene="${esc(s.id)}">Replay chapter ${s.number}</button>` : ''}</li>`).join('') },
        { title: 'Case notebook', layout: 'notebook-list notebook', list: 'ol', html: completedChapters.length ? completedChapters.map(notebookEntryHtml).join('') : '<li class="notebook-empty">Nothing written yet. Each completed chapter adds Roberto’s notes here.</li>' },
        { title: 'Evidence', layout: 'evidence-cards', list: 'ol', html: evidenceCardsHtml(evidence) },
        { title: 'Transcript', layout: 'transcript-list evidence-panel', list: 'ol', html: transcriptHtml(script.scenes, reachedTranscript(script.scenes, p)) },
      ])}
    </div>`;
  const on = (act: string, fn: () => void) => root.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
  on('story-home', () => d.onBack());
  // Escape on the case file is the same as ← Menu (never inside the confirm sheet).
  root.querySelector('.story-shell')?.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key === 'Escape' && !ev.defaultPrevented && !(ev.target as HTMLElement).closest('dialog')) d.onBack();
  });
  on('story-continue', () => void renderStoryRun(d, { replay: null }));
  // The card art arrives through the one loader; until then (or if it never does) the cards are plain ivory paper.
  if (evidence.length)
    void warm(['prop.evidence-card']).then(([ok]) => {
      const list = root.querySelector<HTMLElement>('.evidence-cards');
      const url = assetUrl('prop.evidence-card');
      if (ok && url && list?.isConnected) list.style.setProperty('--evidence-card', `url("${url}")`);
    });
  on('update-now', () => d.update?.apply());
  // After an update reload in the middle of the case: straight back to the saved scene, line or hand (once).
  if (p && d.takeAutoContinue?.()) void renderStoryRun(d, { replay: null, via: 'update' });
  root.querySelectorAll<HTMLElement>('[data-act="story-replay"]').forEach((b) => b.addEventListener('click', () => void renderStoryRun(d, { replay: b.dataset.scene as SceneId })));
  const newBtn = root.querySelector<HTMLButtonElement>('[data-act="story-new"]');
  newBtn?.addEventListener('click', async () => {
    // With a case in progress, starting over asks first (Story progress only; Quick Play saves are kept).
    if (p && !(await confirmSheet(root, { title: 'Start the case over?', body: 'Your Story progress and notebook go back to the prologue. Quick Play saves, settings and statistics are kept.', yes: 'Start over', no: 'Keep my case' }))) return;
    clearStory(d.store);
    save(d, newProgress(Date.now()));
    void renderStoryRun(d, { replay: null });
  });
  (root.querySelector('[data-act="story-continue"], [data-act="story-new"]') as HTMLElement | null)?.focus();
}

