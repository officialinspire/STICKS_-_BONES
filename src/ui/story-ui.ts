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
import { assetUrl } from '../assets';
import { warm } from '../assets/warm';
import type { KeyValueStore } from '../app/storage';
import type { Block, Scene } from '../story/parse';
import { clearStory, newProgress, readStory, TEXT_SCALES, writeStory, type SceneId, type StoryProgress } from '../story/progress';
import { wordmarkHtml } from './brand';
import { wrapTab } from './focus-trap';
import { esc } from './svg';

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
const captionText = (raw: string) => (raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw);

export function dialoguePanelHtml(b: Block): string {
  if (b.kind === 'line') {
    return `<article class="dialogue-panel" data-kind="line">${speakerLabelHtml(b.speaker!)}<p class="dialogue-text">${esc(b.text!)}</p></article>`;
  }
  return `<article class="dialogue-panel is-caption" data-kind="direction"><p class="caption-text">${esc(captionText(b.raw))}</p></article>`;
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

export interface StoryDeps {
  readonly root: HTMLElement;
  readonly store: KeyValueStore | null;
  onBack(): void;
  reduceMotion(): boolean;
  /** Storage refused a write: show persistent feedback (never claim it saved). */
  onSaveFailed(): void;
}

/** Write progress; on refusal, report it (persistent banner) and return false. */
function save(d: StoryDeps, p: StoryProgress): boolean {
  const ok = writeStory(d.store, p);
  if (!ok) d.onSaveFailed();
  return ok;
}

const SCENE_ENV: Partial<Record<SceneId, 'env.cave-waterfall' | 'env.neighborhood-patio'>> = { prologue: 'env.cave-waterfall' };

// ---- case file (Story home) --------------------------------------------------------
export async function renderStoryHome(d: StoryDeps, notice?: string): Promise<void> {
  const { root } = d;
  void warm(['env.cave-waterfall']);
  const script = await loadScript();
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
        ${wordmarkHtml({ story: true, level: 'h1', className: 'is-story' })}
        <p class="story-promise">A dominoes mystery in Puerto Rico.</p>
      </header>
      ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
      <section class="case-actions panel-dark" aria-label="Case">
        ${
          p
            ? `<button type="button" class="btn primary" data-act="story-continue">Continue Case</button>
               <p class="case-where">${where ? esc(`${where.number === null ? where.heading.split(' — ')[0] : `Chapter ${where.number}`} — ${where.title}`) : ''}</p>
               <button type="button" class="btn-ghost" data-act="story-new">New Case…</button>`
            : `<button type="button" class="btn primary" data-act="story-new">New Case</button>
               <p class="case-where">Seven chapters, seven hands. Every win, loss or blocked tie moves the case forward.</p>`
        }
        <p class="stage-note"><strong>In this build:</strong> the Prologue plays in full. Chapter scenes and their hands arrive in the next build stage.</p>
      </section>
      <section class="chapter-select" aria-labelledby="chapters-h">
        <h2 id="chapters-h" class="section-h">Chapters</h2>
        <p class="note-dark">Completed chapters can be replayed here once chapter play is available.</p>
        <ol class="chapter-list">${chapters.map((s) => `<li>${chapterCardHtml(s, status(s), { compact: true })}${status(s) === 'completed' ? `<button type="button" class="btn-ghost small" disabled>Replay — next stage</button>` : ''}</li>`).join('')}</ol>
      </section>
      <section class="notebook" aria-labelledby="notebook-h">
        <h2 id="notebook-h" class="section-h">Case notebook</h2>
        ${completedChapters.length ? `<ol class="notebook-list">${completedChapters.map(notebookEntryHtml).join('')}</ol>` : `<p class="notebook-empty">Nothing written yet. Each completed chapter adds Roberto’s notes here.</p>`}
        ${evidencePanelHtml('Evidence', [], 'No evidence collected yet.')}
      </section>
    </div>`;
  const on = (act: string, fn: () => void) => root.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
  on('story-home', () => d.onBack());
  on('story-continue', () => void renderStoryPlayer(d));
  const newBtn = root.querySelector<HTMLButtonElement>('[data-act="story-new"]');
  newBtn?.addEventListener('click', () => {
    // With a case in progress, the first tap only arms (no accidental reset).
    if (p && newBtn.dataset.armed !== '1') {
      newBtn.dataset.armed = '1';
      newBtn.textContent = 'Tap again to start over (story progress only)';
      return;
    }
    clearStory(d.store);
    save(d, newProgress(Date.now()));
    void renderStoryPlayer(d);
  });
  (root.querySelector('[data-act="story-continue"], [data-act="story-new"]') as HTMLElement | null)?.focus();
}

// ---- scene player -------------------------------------------------------------------
export async function renderStoryPlayer(d: StoryDeps): Promise<void> {
  const { root } = d;
  const script = await loadScript();
  let p = readStory(d.store).value ?? newProgress(Date.now());
  let saved = true;
  const scene = script.scenes.find((s) => s.id === p.sceneId) ?? script.scenes[0]!;
  const blocks = playable(scene);
  const env = SCENE_ENV[scene.id as SceneId];
  const envUrl = env ? assetUrl(env) : null;
  if (env) void warm([env], { front: true });
  root.className = 'is-story is-playing';
  root.style.setProperty('--scene-image', envUrl ? `url("${envUrl}")` : 'none');
  root.dataset.scene = scene.id;
  const draw = () => {
    const atEnd = p.index >= blocks.length;
    const block = blocks[Math.min(p.index, blocks.length - 1)];
    root.style.setProperty('--story-scale', String(p.textScale));
    root.innerHTML = `
      <div class="story-stage" data-scene="${esc(scene.id)}">
        <header class="story-bar">
          <button type="button" class="btn-ghost back" data-act="story-file">← Case file</button>
          <h1 class="story-bar-title"><span class="chapter-num">${esc(scene.number === null ? scene.heading.split(' — ')[0]! : `Chapter ${scene.number}`)}</span> ${esc(scene.title)}</h1>
        </header>
        <section class="story-main" aria-label="Scene">
          ${
            atEnd
              ? endCardHtml(script, scene, saved)
              : `${p.index === 0 ? chapterCardHtml(scene, 'reading') : ''}<div class="dialogue-slot" aria-live="polite">${dialoguePanelHtml(block!)}</div>`
          }
        </section>
        ${cinematicControlsHtml({ canBack: p.index > 0, atEnd, position: atEnd ? 'End of scene' : `${p.index + 1} / ${blocks.length}` })}
        <dialog class="sheet transcript" aria-labelledby="transcript-h"></dialog>
      </div>`;
    if (!d.reduceMotion()) root.querySelector('.dialogue-panel')?.classList.add('is-entering');
    (root.querySelector('[data-act="story-next"]') as HTMLElement).focus({ preventScroll: true });
  };
  const go = (index: number) => {
    p = { ...p, index: Math.max(0, Math.min(index, blocks.length)) };
    if (p.index >= blocks.length && !p.completed.includes(scene.id as SceneId) && scene.id === 'prologue') p = { ...p, completed: [...p.completed, 'prologue'] };
    saved = save(d, p);
    draw();
  };
  const transcript = () => {
    const dlg = root.querySelector<HTMLDialogElement>('dialog.transcript')!;
    const seen = blocks.slice(0, Math.min(p.index + 1, blocks.length));
    dlg.innerHTML = `<h2 id="transcript-h">Transcript</h2><p class="note">${esc(scene.heading)} — everything shown so far.</p><ol class="transcript-list">${seen
      .map((b) => `<li>${b.kind === 'line' ? `<strong>${esc(speakerOf(b.speaker!).label)}${speakerOf(b.speaker!).qualifier ? ` (${esc(speakerOf(b.speaker!).qualifier!)})` : ''}:</strong> ${esc(b.text!)}` : `<em>${esc(captionText(b.raw))}</em>`}</li>`)
      .join('')}</ol><div class="sheet-actions"><button type="button" class="btn" data-act="transcript-close">Close</button></div>`;
    dlg.showModal();
    (dlg.querySelector('[data-act="transcript-close"]') as HTMLElement).focus();
  };
  root.onclick = (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'story-next') {
      if (p.index >= blocks.length) void renderStoryHome(d);
      else go(p.index + 1);
    } else if (act === 'story-back') go(p.index - 1);
    else if (act === 'story-skip') go(blocks.length);
    else if (act === 'story-file') void renderStoryHome(d);
    else if (act === 'story-text') {
      const i = TEXT_SCALES.indexOf(p.textScale);
      p = { ...p, textScale: TEXT_SCALES[(i + 1) % TEXT_SCALES.length]! };
      save(d, p);
      draw();
      (root.querySelector('[data-act="story-text"]') as HTMLElement).focus();
    } else if (act === 'story-transcript') transcript();
    else if (act === 'transcript-close') {
      root.querySelector<HTMLDialogElement>('dialog.transcript')?.close();
      (root.querySelector('[data-act="story-transcript"]') as HTMLElement).focus();
    }
  };
  root.onkeydown = (e) => {
    const dlg = root.querySelector<HTMLDialogElement>('dialog.transcript[open]');
    if (dlg) {
      wrapTab(e, dlg);
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest('button:not([data-act="story-next"])')) return; // let focused buttons handle their own keys
    if (e.key === 'ArrowRight' || ((e.key === 'Enter' || e.key === ' ') && !t.closest('button'))) {
      e.preventDefault();
      (root.querySelector('[data-act="story-next"]') as HTMLElement).click();
    } else if (e.key === 'ArrowLeft' && p.index > 0) {
      e.preventDefault();
      go(p.index - 1);
    }
  };
  draw();
}

function endCardHtml(script: ScriptJson, scene: Scene, saved: boolean): string {
  const idx = script.scenes.findIndex((s) => s.id === scene.id);
  const next = script.scenes[idx + 1];
  return `<section class="end-card" aria-labelledby="end-h">
    <h2 id="end-h" class="section-h">End of ${esc(scene.number === null ? scene.heading.split(' — ')[0]! : `Chapter ${scene.number}`)}</h2>
    ${next ? chapterCardHtml(next, 'next') : ''}
    <p class="stage-note"><strong>Not playable yet:</strong> ${next ? esc(`${next.number === null ? 'The epilogue' : `Chapter ${next.number}`}`) : 'The next scene'}’s scenes and its domino hand arrive in the next build stage. ${saved ? 'Your place in the case is saved on this device.' : '<strong>Your place could not be saved</strong> — this browser refused storage.'}</p>
  </section>`;
}
