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
import type { KeyValueStore } from '../app/storage';
import type { Block, Scene } from '../story/parse';
import { clearStory, newProgress, readStory, writeStory, type SceneId, type StoryHand, type StoryProgress } from '../story/progress';
import type { HandSetup } from '../story/chapters';
import { STAGING } from '../story/staging';
import type { StoryCue } from '../audio/manager';
import { renderStoryRun } from './story-player';
import { playerCaption } from '../story/captions';
import type { Outcome } from '../story/chapters';
import { sceneAssets } from './story-assets';
import { envKey } from '../assets/env';
import { wordmarkHtml } from './brand';
import { esc } from './svg';
import { confirmSheet } from './confirm';

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

/** Stage directions are shown as descriptive captions (the script's square brackets are its own markup). */
/** Player-facing caption (implementation notes omitted; see src/story/captions.ts). Empty string = a silent beat. */
/** A caption panel; a writer's-note bracket becomes a silent beat (visually empty, "Silence." for screen readers). */
export function captionPanelHtml(raw: string, attrs: string): string {
  const t = playerCaption(raw);
  return t === null
    ? `<article class="dialogue-panel is-caption is-silent" data-kind="direction"${attrs}><p class="caption-text"><span class="sr-only">Silence.</span></p></article>`
    : `<article class="dialogue-panel is-caption" data-kind="direction"${attrs}><p class="caption-text">${esc(t)}</p></article>`;
}
export const captionText = (raw: string) => playerCaption(raw) ?? '';

export function dialoguePanelHtml(b: Block): string {
  if (b.kind === 'line') {
    return `<article class="dialogue-panel" data-kind="line">${speakerLabelHtml(b.speaker!)}<p class="dialogue-text">${esc(b.text!)}</p></article>`;
  }
  return captionPanelHtml(b.raw, '');
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

export function evidencePanelHtml(title: string, items: readonly string[], empty: string): string {
  return `<section class="evidence-panel" aria-label="${esc(title)}"><h3 class="evidence-title">${esc(title)}</h3>${
    items.length ? `<ul class="evidence-list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p class="evidence-empty">${esc(empty)}</p>`
  }</section>`;
}

export function notebookEntryHtml(s: Scene): string {
  const entry = s.blocks.find((b) => b.kind === 'notebook');
  if (!entry) return '';
  return `<li class="notebook-entry"><p class="notebook-chapter">Chapter ${s.number} · ${esc(s.title)}</p><p class="notebook-text">${esc(entry.raw.replace(/^Notebook:\s*/, ''))}</p></li>`;
}

export function cinematicControlsHtml(o: { canBack: boolean; atEnd: boolean; position: string }): string {
  return `<nav class="cine-controls" aria-label="Scene controls">
    <button type="button" class="btn-ghost cine-btn" data-act="story-back" ${o.canBack ? '' : 'disabled'} aria-label="Back to the previous line">‹ Back</button>
    <button type="button" class="btn-ghost cine-btn" data-act="story-transcript">Transcript</button>
    <button type="button" class="btn-ghost cine-btn" data-act="story-text" aria-label="Aa: change text size">Aa</button>
    <button type="button" class="btn-ghost cine-btn" data-act="story-skip" ${o.atEnd ? 'disabled' : ''}>Skip scene</button>
    <span class="cine-pos" aria-live="off">${esc(o.position)}</span>
    <button type="button" class="btn primary cine-next" data-act="story-next">${o.atEnd ? 'Continue' : 'Next ›'}</button>
  </nav>`;
}

// ---- data ---------------------------------------------------------------------------
interface ScriptJson {
  readonly scenes: readonly Scene[];
}
let scriptPromise: Promise<ScriptJson> | null = null;
/** The script is a separate chunk, loaded only when Story opens (and precached for offline play). */
export const loadScript = (): Promise<ScriptJson> => (scriptPromise ??= import('../story/script.json').then((m) => (m.default ?? m) as unknown as ScriptJson));

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
  onSnapshot(h: StoryHand): void;
  /** The hand resolved (any result advances the story). */
  onResolved(winnerTeam: number | null, playerTeam: number): void;
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
  /** Storage refused a write: show persistent feedback (never claim it saved). */
  onSaveFailed(): void;
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
  /** While a run is open: write its position now (true only if the write succeeded), and stop it (update). */
  registerRun?(hooks: { flush(): boolean; stop(): void } | null): void;
  /** One line on whether a scene is saved for offline play (null where offline isn't available). */
  offlineNote?(id: SceneId): string | null;
  /** A waiting app update (the case file shows "Update now"; the run's position is saved first). */
  readonly update?: { ready(): boolean; apply(): void };
  /** Story analytics (separate from Quick Play; disabled adapter until the owner's contract). Keys are local only. */
  readonly track?: {
    chapterComplete(scene: SceneId, outcome: Outcome | 'none', replay: boolean, caseKey: string): void;
    caseComplete(caseKey: string): void;
    resume(scene: SceneId, part: 'dialogue' | 'hand', via: 'continue' | 'update', positionKey: string): void;
    assist(scene: SceneId, key: string): void;
    /** Opened a story tool (transcript): exploration achievements. */
    explore?(what: 'transcript'): void;
  };
  /** True once, right after an update reload that interrupted a story: reopen the saved scene without a tap. */
  takeAutoContinue?(): boolean;
  /** Dev/test: fast AI timings. */
  readonly fast?: boolean;
}

/** Write progress; on refusal, report it (persistent banner) and return false. */
export function save(d: StoryDeps, p: StoryProgress): boolean {
  const ok = writeStory(d.store, p);
  if (!ok) d.onSaveFailed();
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
  const script = await loadScript();
  const nextScene = script.scenes.find((x) => x.id === nextId);
  if (nextScene) void warm(sceneAssets(nextScene));
  const read = readStory(d.store);
  const p = read.value;
  const chapters = script.scenes.filter((s) => s.number !== null);
  const status = (s: Scene): ChapterStatus => (p?.completed.includes(s.id as SceneId) ? 'completed' : p?.sceneId === s.id ? 'reading' : s.number === 1 && p?.completed.includes('prologue') ? 'next' : 'locked');
  const where = p ? script.scenes.find((s) => s.id === p.sceneId) : null;
  const completedChapters = chapters.filter((s) => p?.completed.includes(s.id as SceneId));
  root.className = 'is-story';
  root.innerHTML = `
    <div class="story-shell">
      <header class="story-head">
        <button type="button" class="btn-ghost back" data-act="story-home">← Menu</button>
        ${d.update ? `<div class="update-banner" data-region="update" ${d.update.ready() ? '' : 'hidden'}><p><strong>Update available.</strong> Your place in the case is saved first, and you come straight back to it.</p><button type="button" class="btn" data-act="update-now">Update now</button></div>` : ''}
        ${wordmarkHtml({ story: true, level: 'h1', className: 'is-story' })}
        <p class="story-promise">A dominoes mystery in Puerto Rico.</p>
      </header>
      ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
      <section class="case-actions panel-dark" aria-label="Case">
        ${
          p
            ? `<button type="button" class="btn primary" data-act="story-continue">Continue Case</button>
               <p class="case-where">${where ? esc(`${where.number === null ? where.heading.split(' — ')[0] : `Chapter ${where.number}`} — ${where.title}`) : ''}</p>
               ${p && d.offlineNote?.(p.sceneId) ? `<p class="case-offline note">${esc(d.offlineNote(p.sceneId)!)}</p>` : ''}
               <button type="button" class="btn-ghost" data-act="story-new">New Case…</button>`
            : `<button type="button" class="btn primary" data-act="story-new">New Case</button>
               <p class="case-where">Seven chapters, seven hands. Every win, loss or blocked tie moves the case forward.</p>`
        }

      </section>
      <section class="chapter-select" aria-labelledby="chapters-h">
        <h2 id="chapters-h" class="section-h">Chapters</h2>
        <p class="note-dark">Replay any completed chapter. Replays never change your case progress.</p>
        <ol class="chapter-list">${chapters.map((s) => `<li>${chapterCardHtml(s, status(s), { compact: true })}${status(s) === 'completed' ? `<button type="button" class="btn-ghost small" data-act="story-replay" data-scene="${esc(s.id)}">Replay chapter ${s.number}</button>` : ''}</li>`).join('')}</ol>
      </section>
      <section class="notebook" aria-labelledby="notebook-h">
        <h2 id="notebook-h" class="section-h">Case notebook</h2>
        ${completedChapters.length ? `<ol class="notebook-list">${completedChapters.map(notebookEntryHtml).join('')}</ol>` : `<p class="notebook-empty">Nothing written yet. Each completed chapter adds Roberto’s notes here.</p>`}
        ${evidencePanelHtml('Evidence', [], 'No evidence collected yet.')}
      </section>
    </div>`;
  const on = (act: string, fn: () => void) => root.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
  on('story-home', () => d.onBack());
  // Escape on the case file is the same as ← Menu (never inside the confirm sheet).
  root.querySelector('.story-shell')?.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key === 'Escape' && !ev.defaultPrevented && !(ev.target as HTMLElement).closest('dialog')) d.onBack();
  });
  on('story-continue', () => void renderStoryRun(d, { replay: null }));
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

