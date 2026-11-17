/**
 * The story scene player: a DOM StageView for the SceneDirector, and the run
 * controller that walks prologue → chapters (pre → hand → outcome insert →
 * continuation → notebook) → epilogue, saving progress at stable points.
 *
 * Layers (back to front): backdrop A/B (cross-faded only after the next image
 * is decoded), light grade, threshold glow, water, boundary line, warmth
 * vignette, Cousin's bust (HostView: same stage box for every expression, so
 * swaps never jump or double-face) or the speaking cast member's portrait (a
 * baseline-aligned cell of their cleaned sheet, shown only once decoded),
 * dialogue, controls, curtain (the coherent
 * colour scenes fade through). Every layer except the controls is
 * pointer-events: none. Presentation never decides a hand.
 */
import { urlFor, type RuntimeAssetId } from '../assets';
import { envKey, envPosition, onViewportShape } from '../assets/env';
import { warm, warmState } from '../assets/warm';
import { realScheduler } from '../app/session';
import { HANDS, insertLines, outcomeFor, segments, type Outcome } from '../story/chapters';
import { DEFAULT_TIMINGS, REDUCED_TIMINGS, SceneDirector, type DirectorState, type StageView } from '../story/director';
import type { Block, Scene } from '../story/parse';
import { newProgress, readStory, TEXT_SCALES, type Part, type SceneId, type StoryProgress } from '../story/progress';
import { cuesFor, STAGING, type Cue, type Light } from '../story/staging';
import { STATE_CUES } from '../audio/manager';
import { wrapTab } from './focus-trap';
import { HostView } from './host';
import { captionText, chapterCardHtml, loadScript, renderStoryHome, save, speakerLabelHtml, speakerOf, type StoryDeps } from './story-ui';
import { esc } from './svg';
import { castFrame, sceneAssets, sceneCast, speakerKey } from './story-assets';

interface Beat {
  readonly block: Block;
  readonly cues: readonly Cue[];
}

const SCENES_IN_ORDER: SceneId[] = ['prologue', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'chapter-5', 'chapter-6', 'chapter-7', 'epilogue'];
const label = (s: Scene) => (s.number === null ? s.heading.split(' — ')[0]! : `Chapter ${s.number}`);

// ---- the DOM stage ------------------------------------------------------------------
class DomStage implements StageView<Beat> {
  #root: HTMLElement;
  #host: HostView | null = null;
  #cousinIn = false;
  #front: 'a' | 'b' = 'a';
  #env: RuntimeAssetId | null = null;
  #prepared = false;
  /** Backdrop requested by cues replayed before prepare() (resume mid-scene): prepare honours it. */
  #intent: { env: RuntimeAssetId | null; focus: string } | null = null;
  #unshape: (() => void) | null = null;
  #speaker: RuntimeAssetId | null = null;
  #disposed = false;
  constructor(
    root: HTMLElement,
    private readonly sceneId: SceneId,
    private readonly reduce: () => boolean,
    private readonly cue: (c: Cue) => void,
  ) {
    this.#root = root;
  }
  q<T extends HTMLElement>(sel: string): T {
    return this.#root.querySelector(sel) as T;
  }
  async prepare(scene?: Scene): Promise<boolean> {
    const st = STAGING[this.sceneId];
    if (!this.#intent) this.light(st.light);
    const target = this.#intent ?? { env: st.env, focus: st.focus };
    this.#prepared = true;
    // Rotation / split screen: re-pick portrait crop vs full frame for the current backdrop (decoded first).
    this.#unshape ??= onViewportShape(() => void this.#reshape());
    // The speaking cast's portraits decode alongside (they never gate the reveal; a line shows its
    // portrait only once decoded, otherwise just the name tag).
    if (scene) void warm(sceneCast(scene), { front: true });
    if (!target.env) {
      this.#setBackdrop(null, target.focus, true);
      return true;
    }
    // Decode BEFORE revealing: the curtain stays closed until the image is ready (or the director times out).
    const [ok] = await warm([envKey(target.env)], { front: true });
    this.#setBackdrop(ok ? target.env : null, target.focus, true);
    return ok === true;
  }
  async #reshape(): Promise<void> {
    const env = this.#env;
    if (!env || this.#disposed) return;
    const [ok] = await warm([envKey(env)], { front: true });
    if (ok && env === this.#env && !this.#disposed) this.#setBackdrop(env, '50% 50%', true);
  }
  /** Remove listeners (the run controller calls this when the scene closes). */
  dispose(): void {
    this.#disposed = true;
    this.#unshape?.();
    this.#unshape = null;
  }
  #setBackdrop(env: RuntimeAssetId | null, focus: string, instant: boolean): void {
    const next = this.#front === 'a' ? 'b' : 'a';
    const el = this.q<HTMLElement>(`.st-bg-${next}`);
    const key = env ? envKey(env) : null;
    const url = key ? urlFor(key) : null;
    // No inline "none": a missing image falls back to the drawn gradient in the stylesheet (never blank).
    if (url) el.style.backgroundImage = `url("${url}")`;
    else el.style.removeProperty('background-image');
    // The focal point comes from src/assets/focal.ts (adjusted inside a portrait crop).
    el.style.backgroundPosition = key ? envPosition(key) : focus;
    el.dataset.variant = key?.endsWith('@portrait') ? 'portrait' : 'full';
    el.dataset.env = env ?? 'none';
    el.classList.toggle('is-instant', instant);
    el.classList.add('is-front');
    this.q<HTMLElement>(`.st-bg-${this.#front}`).classList.remove('is-front');
    this.#front = next;
    this.#env = env;
  }
  /** Mid-scene backdrop cut: only after the new image decoded; otherwise keep the current one and just change the light. */
  async cutTo(env: RuntimeAssetId | null, light: Light, focus = '50% 50%'): Promise<void> {
    this.light(light);
    if (!this.#prepared) {
      this.#intent = { env, focus };
      return;
    }
    if (env === this.#env) return;
    if (env === null) return this.#setBackdrop(null, focus, this.reduce());
    const [ok] = await warm([envKey(env)], { front: true });
    if (ok) this.#setBackdrop(env, focus, this.reduce());
  }
  light(l: Light): void {
    this.#root.dataset.light = l;
  }
  curtain(to: 'closed' | 'open', ms: number): void {
    const c = this.q<HTMLElement>('.st-curtain');
    c.style.transitionDuration = `${ms}ms`;
    c.classList.toggle('is-closed', to === 'closed');
  }
  establishing(ms: number): void {
    const move = STAGING[this.sceneId].establishing;
    if (move === 'none' || this.reduce()) return;
    const bg = this.q<HTMLElement>('.st-backdrop');
    bg.style.setProperty('--est-ms', `${ms}ms`);
    bg.dataset.move = move; // a single restrained push/pan that ends; never loops
  }
  showBeat(b: Beat, index: number, revealMs: number): void {
    for (const c of b.cues) this.apply(c);
    const slot = this.q<HTMLElement>('.dialogue-slot');
    const blk = b.block;
    slot.innerHTML =
      blk.kind === 'line'
        ? `<article class="dialogue-panel" data-kind="line" data-index="${index}">${speakerLabelHtml(blk.speaker!)}<p class="dialogue-text">${esc(blk.text!)}</p></article>`
        : `<article class="dialogue-panel is-caption" data-kind="direction" data-index="${index}"><p class="caption-text">${esc(captionText(blk.raw))}</p></article>`;
    const panel = slot.firstElementChild as HTMLElement;
    panel.style.setProperty('--reveal-ms', `${revealMs}ms`);
    panel.classList.toggle('is-revealing', revealMs > 0);
    const own = blk.kind === 'line' && speakerOf(blk.speaker!).label === 'Cousin';
    this.#showCast(blk.kind === 'line' ? speakerKey(blk.speaker!) : null);
    const reaction = blk.kind === 'direction' && b.cues.some((c) => c.kind === 'expr');
    this.#root.toggleAttribute('data-actor-visible', this.#cousinIn && (own || reaction));
    if (own && !this.#cousinIn) {
      this.apply({ kind: 'cousin', to: 'in' });
      this.#root.toggleAttribute('data-actor-visible', true);
    }
  }
  /** The speaker's portrait (default frame), only once its sheet is decoded; otherwise the name tag stands alone. */
  #showCast(id: RuntimeAssetId | null): void {
    this.#speaker = id;
    const box = this.q<HTMLElement>('.st-cast-art');
    const f = id ? castFrame(id) : null;
    if (!id || !f || !box) return void this.#root.removeAttribute('data-cast-visible');
    if (warmState(id) !== 'ready') {
      this.#root.removeAttribute('data-cast-visible');
      void warm([id], { front: true }).then(([ok]) => ok && this.#speaker === id && !this.#disposed && this.#showCast(id));
      return;
    }
    box.style.backgroundImage = `url("${urlFor(id)}")`;
    box.style.backgroundSize = `${(f.sheetW / f.w) * 100}% ${(f.sheetH / f.h) * 100}%`;
    box.style.backgroundPosition = `${(f.x / (f.sheetW - f.w)) * 100}% ${(f.y / (f.sheetH - f.h)) * 100}%`;
    box.style.aspectRatio = `${f.w} / ${f.h}`;
    box.dataset.cast = id;
    this.#root.setAttribute('data-cast-visible', '');
  }
  finishReveal(): void {
    this.q<HTMLElement>('.dialogue-panel')?.classList.remove('is-revealing');
  }
  setState(s: DirectorState): void {
    this.#root.dataset.director = s;
    const busy = s !== 'presenting';
    this.#root.querySelectorAll<HTMLButtonElement>('.cine-controls [data-busy-disable]').forEach((b) => (b.disabled = busy));
  }
  apply(c: Cue): void {
    switch (c.kind) {
      case 'light':
        return this.light(c.to);
      case 'backdrop':
        return void this.cutTo(c.env, c.light, c.focus);
      case 'threshold':
        this.#root.dataset.threshold = c.to;
        return;
      case 'water':
        this.#root.dataset.water = c.to;
        return;
      case 'boundary':
        this.#root.toggleAttribute('data-boundary', c.show);
        return;
      case 'warmth':
        this.#root.toggleAttribute('data-warmth', c.on);
        return;
      case 'pulse': {
        const t = this.q<HTMLElement>('.st-threshold');
        t.classList.remove('is-pulse');
        void t.offsetWidth;
        if (!this.reduce()) t.classList.add('is-pulse');
        return;
      }
      case 'cousin': {
        this.#cousinIn = c.to === 'in';
        this.#root.toggleAttribute('data-cousin', this.#cousinIn);
        return;
      }
      case 'expr':
        this.#host?.setMood(c.mood);
        return;
      case 'audio':
        return this.cue(c);
    }
  }
  mountActor(): void {
    this.#host = new HostView(this.q<HTMLElement>('.st-actor-art'), 'bust', { reduceMotion: this.reduce, animations: () => false });
  }
  cousinPresent(on: boolean): void {
    this.apply({ kind: 'cousin', to: on ? 'in' : 'out' });
  }
}

// ---- the run ------------------------------------------------------------------------
export interface RunOptions {
  /** Replay a completed chapter (memory only — never changes case progress). */
  readonly replay: SceneId | null;
  /** How this run was opened (analytics only): a tap on Continue, or the automatic return after an update. */
  readonly via?: 'continue' | 'update';
}

export async function renderStoryRun(d: StoryDeps, o: RunOptions): Promise<void> {
  const { root } = d;
  const script = await loadScript();
  let p: StoryProgress = o.replay ? { ...newProgress(Date.now()), sceneId: o.replay, completed: [] } : (readStory(d.store).value ?? newProgress(Date.now()));
  // Local analytics keys (never sent): this case, or this replay run.
  const caseKey = o.replay ? `replay:${o.replay}:${Date.now()}` : `case:${p.startedAt}`;
  let resumeTracked = false;
  const persist = (next: StoryProgress) => {
    p = next;
    if (!o.replay) save(d, p);
  };
  const reduce = () => d.reduceMotion();
  let director: SceneDirector<Beat> | null = null;
  let stage: DomStage | null = null;
  let disposed = false;

  const onVisibility = () => {
    if (document.hidden) director?.settle(); // never resume into a half-finished transition
  };
  document.addEventListener('visibilitychange', onVisibility);
  const dispose = () => {
    d.registerRun?.(null);
    disposed = true;
    director?.cancel();
    stage?.dispose();
    d.beat();
    document.removeEventListener('visibilitychange', onVisibility);
    root.onclick = null;
    root.onkeydown = null;
  };
  // The app's update flow asks the open run to write its exact position (the saved hand included) and stop.
  d.registerRun?.({ flush: () => (o.replay ? true : save(d, p)), stop: () => dispose() });

  const sceneOf = (id: SceneId) => script.scenes.find((s) => s.id === id)!;

  async function open(sceneId: SceneId): Promise<void> {
    director?.cancel(); // a new scene invalidates every callback of the previous one
    stage?.dispose();
    if (disposed) return;
    d.beat();
    d.audioScene(sceneId);
    const scene = sceneOf(sceneId);
    const seg = segments(scene);
    const st = STAGING[sceneId];
    const part: Part = p.sceneId === sceneId ? p.part : 'pre';
    root.className = 'is-story is-playing';
    root.dataset.scene = sceneId;
    root.style.setProperty('--story-scale', String(p.textScale));
    root.innerHTML = `
      <div class="story-stage" data-scene="${esc(sceneId)}">
        <div class="st-layers" aria-hidden="true">
          <div class="st-backdrop"><div class="st-bg st-bg-a"></div><div class="st-bg st-bg-b"></div></div>
          <div class="st-light"></div><div class="st-threshold"></div><div class="st-water"></div><div class="st-boundary"></div><div class="st-warmth"></div>
        </div>
        <header class="story-bar">
          <button type="button" class="btn-ghost back" data-act="story-file">← Case file</button>
          ${d.update ? `<button type="button" class="btn-ghost cine-btn story-update" data-region="update" data-act="update-now" ${d.update.ready() ? '' : 'hidden'} aria-label="Update the game now (your place is saved first)">Update</button>` : ''}
          <h1 class="story-bar-title"><span class="chapter-num">${esc(label(scene))}</span> ${esc(scene.title)}${o.replay ? ' <span class="replay-tag">Replay</span>' : ''}</h1>
        </header>
        <section class="story-main" aria-label="Scene">
          <div class="scene-card-slot"></div>
          <div class="st-actor" aria-hidden="true"><div class="st-actor-art"></div></div>
          <div class="st-cast" aria-hidden="true"><div class="st-cast-art"></div></div>
          <div class="dialogue-slot" aria-live="polite"></div>
        </section>
        <nav class="cine-controls" aria-label="Scene controls">
          <button type="button" class="btn-ghost cine-btn" data-act="story-back" data-busy-disable aria-label="Back to the previous line">‹ Back</button>
          <button type="button" class="btn-ghost cine-btn" data-act="story-transcript">Transcript</button>
          <button type="button" class="btn-ghost cine-btn" data-act="story-text" aria-label="Aa: change text size">Aa</button>
          <button type="button" class="btn-ghost cine-btn" data-act="story-skip">Skip</button>
          <span class="cine-pos" aria-live="off"></span>
          <button type="button" class="btn primary cine-next" data-act="story-next">Next ›</button>
        </nav>
        <dialog class="sheet transcript" aria-labelledby="transcript-h"></dialog>
        <div class="st-curtain is-closed" aria-hidden="true"></div>
      </div>
      <div class="story-table-host" hidden></div>`;
    // Resuming a saved position: the beat you land on shows its staging, but its one-shot sound (a knock)
    // is not replayed — only mix-state cues are. Cleared once that first beat is on screen.
    let quietOnce = false;
    stage = new DomStage(root.querySelector('.story-stage')!, sceneId, reduce, (c) => {
      if (c.kind === 'audio' && !(quietOnce && !STATE_CUES.has(c.cue))) d.cue(c.cue);
    });
    stage.mountActor();
    stage.cousinPresent(st.cousin);
    const s = stage;
    let prefetched = false;

    // Beats for the current part.
    const preBeats = seg.pre.map((b) => ({ block: b, cues: cuesFor(sceneId, b.raw) }));
    const afterBeats = (outcome: Outcome | null) => [...(outcome && seg.inserts[outcome] ? insertLines(seg.inserts[outcome]!) : []), ...seg.post].map((b) => ({ block: b, cues: cuesFor(sceneId, b.raw) }));
    let beats = part === 'pre' ? preBeats : afterBeats(p.outcome);
    // Replay all cues up to the resume point so light/water/expression match the saved position.
    const replayCues = (upto: number) => {
      const prior = part === 'pre' ? preBeats.slice(0, upto) : [...preBeats, ...afterBeats(p.outcome).slice(0, upto)];
      // One-shot sounds (knocks, accents) are never replayed on resume; mix-state cues (the bed going quiet) are.
      for (const b of prior) for (const c of b.cues) if (c.kind === 'audio' ? STATE_CUES.has(c.cue) : c.kind !== 'pulse') s.apply(c);
    };

    const pos = () => {
      const el = root.querySelector('.cine-pos');
      if (el) el.textContent = beats.length ? `${Math.min((director?.index ?? 0) + 1, beats.length)} / ${beats.length}` : '';
    };

    const showHandCard = () => {
      d.beat();
      const setup = HANDS[sceneId]!;
      const slot = root.querySelector<HTMLElement>('.scene-card-slot')!;
      root.querySelector<HTMLElement>('.dialogue-slot')!.innerHTML = '';
      slot.innerHTML = `<section class="hand-card" aria-labelledby="hand-h"><p class="chapter-num">${esc(label(scene))} · the hand</p><h2 id="hand-h" class="section-h">${esc(setup.label)}</h2>${st.handNote ? `<p class="hand-note">${esc(st.handNote)}</p>` : ''}<p class="hand-note">One hand. Win, lose or blocked tie — the case moves on either way.</p><button type="button" class="btn primary" data-act="story-deal">Deal the tiles</button></section>`;
      (slot.querySelector('[data-act="story-deal"]') as HTMLElement).focus({ preventScroll: true });
      root.querySelector<HTMLElement>('[data-act="story-next"]')!.hidden = true;
    };

    const showEndCard = () => {
      d.beat();
      const idx = SCENES_IN_ORDER.indexOf(sceneId);
      const next = o.replay ? null : SCENES_IN_ORDER[idx + 1] ?? null;
      const slot = root.querySelector<HTMLElement>('.scene-card-slot')!;
      root.querySelector<HTMLElement>('.dialogue-slot')!.innerHTML = '';
      const nb = seg.notebook ? `<div class="notebook is-inline"><p class="notebook-chapter">Notebook · ${esc(label(scene))}</p><p class="notebook-text">${esc(seg.notebook.raw.replace(/^Notebook:\s*/, ''))}</p></div>` : '';
      const fin = sceneId === 'epilogue' ? `<p class="case-complete">Case complete.</p>` : '';
      slot.innerHTML = `<section class="end-card" aria-labelledby="end-h"><h2 id="end-h" class="section-h">End of ${esc(label(scene))}</h2>${fin}${nb}${next ? chapterCardHtml(sceneOf(next), 'next') : ''}<button type="button" class="btn primary" data-act="story-onward">${next ? `Continue to ${esc(label(sceneOf(next)))}` : 'Back to the case file'}</button></section>`;
      (slot.querySelector('[data-act="story-onward"]') as HTMLElement).focus({ preventScroll: true });
      root.querySelector<HTMLElement>('[data-act="story-next"]')!.hidden = true;
      pos();
      if (sceneId === 'prologue' || sceneId === 'epilogue') d.track?.chapterComplete(sceneId, 'none', !!o.replay, caseKey);
      if (sceneId === 'epilogue' && !o.replay) d.track?.caseComplete(caseKey);
      if (!o.replay) persist({ ...p, sceneId, part: 'end', index: 0, hand: null, completed: sceneId === 'prologue' || sceneId === 'epilogue' ? [...new Set([...p.completed, sceneId])] : p.completed });
    };

    director = new SceneDirector<Beat>(
      {
        prepare: () => s.prepare(scene),
        curtain: (to, ms) => s.curtain(to, ms),
        establishing: (ms) => s.establishing(ms),
        showBeat: (b, i, ms) => {
          d.beat(); // the previous beat's knocks never trail into this one
          s.showBeat(b, i, ms);
          quietOnce = false;
          root.querySelector<HTMLElement>('.scene-card-slot')!.innerHTML = '';
          root.querySelector<HTMLElement>('[data-act="story-next"]')!.hidden = false;
          pos();
          persist({ ...p, sceneId, part: part === 'pre' && beats === preBeats ? 'pre' : 'post', index: i, hand: null });
        },
        finishReveal: () => s.finishReveal(),
        setState: (x) => {
          s.setState(x);
          // Once the scene is up, the primary control gets focus (unless the player is focused elsewhere in the stage).
          if (x === 'presenting' && !prefetched) {
            // The scene is up: fetch + decode the NEXT chapter's backdrop and cast in the background
            // (bounded warm queue, never ahead of anything the current scene asks for).
            prefetched = true;
            const nextId = SCENES_IN_ORDER[SCENES_IN_ORDER.indexOf(sceneId) + 1];
            if (nextId && !o.replay) void warm(sceneAssets(sceneOf(nextId)));
          }
          if (x === 'presenting') {
            const a = document.activeElement;
            if (!a || a === document.body || !root.contains(a) || a.closest('.st-curtain')) (root.querySelector('[data-act="story-next"]:not([hidden])') as HTMLElement | null)?.focus({ preventScroll: true });
          }
        },
      },
      {
        textOf: (b) => b.block.text ?? b.block.raw,
        now: () => performance.now(),
        onEnd: () => {
          if (beats === preBeats && seg.deal) showHandCard();
          else showEndCard();
        },
        onHandStart: () => startHand(null),
        onExit: () => {},
      },
      realScheduler,
      reduce() ? REDUCED_TIMINGS : DEFAULT_TIMINGS,
    );
    const dir = director;

    const startHand = (restore: StoryProgress['hand']) => {
      const host = root.querySelector<HTMLElement>('.story-table-host')!;
      root.querySelector<HTMLElement>('.story-stage')!.hidden = true;
      host.hidden = false;
      if (!o.replay && !restore) persist({ ...p, sceneId, part: 'hand', index: 0, hand: null });
      let outcome: Outcome | null = null;
      d.playHand({
        sceneId,
        setup: HANDS[sceneId]!,
        restore,
        replay: !!o.replay,
        host,
        onSnapshot: (h) => {
          if (!o.replay && outcome === null) persist({ ...p, sceneId, part: 'hand', index: 0, hand: h });
        },
        onResolved: (winnerTeam, playerTeam) => {
          if (outcome !== null) return; // once
          outcome = outcomeFor(winnerTeam, playerTeam);
          d.track?.chapterComplete(sceneId, outcome, !!o.replay, caseKey);
          // One write: outcome + completion + position. A reload can't replay the completion.
          persist({ ...p, sceneId, part: 'post', index: 0, outcome, hand: null, completed: [...new Set([...p.completed, sceneId])] });
        },
        onContinue: () => {
          d.endHand();
          host.hidden = true;
          root.querySelector<HTMLElement>('.story-stage')!.hidden = false;
          root.className = 'is-story is-playing';
          beats = afterBeats(outcome ?? p.outcome);
          if (dir.state !== 'in-hand') {
            // Resumed straight into the hand (refresh): the director never entered it — enter now.
            void dir.load(beats, 0, { handAlreadyDone: true });
          } else dir.leaveHand(beats);
          (root.querySelector('[data-act="story-next"]') as HTMLElement)?.focus({ preventScroll: true });
        },
        onLeave: () => {
          d.endHand();
          dispose();
          void renderStoryHome(d);
        },
      });
    };

    // Enter at the saved position.
    // Continue Case into an in-progress position (not a fresh scene start, not a replay): a resume.
    const inProgress = !o.replay && p.sceneId === sceneId && (part === 'hand' || part === 'post' || part === 'insert' || p.index > 0);
    if (inProgress && !resumeTracked) d.track?.resume(sceneId, part === 'hand' ? 'hand' : 'dialogue', o.via ?? 'continue', `${caseKey}:${sceneId}:${part}:${p.index}`);
    resumeTracked = true;
    if (part === 'hand') {
      replayCues(preBeats.length);
      void dir.load(preBeats, preBeats.length, { handAlreadyDone: true });
      startHand(p.hand); // resumes the exact hand if one was saved, otherwise deals afresh
    } else if (part === 'end') {
      replayCues(beats.length);
      await dir.load(beats, beats.length);
      if (!disposed) showEndCard();
    } else {
      const at = Math.min(p.sceneId === sceneId ? p.index : 0, Math.max(0, beats.length - 1));
      quietOnce = p.sceneId === sceneId && (at > 0 || part === 'post');
      replayCues(at);
      void dir.load(beats, at);
    }

    root.onclick = (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'story-next') dir.advance();
      else if (act === 'story-back') dir.back();
      else if (act === 'story-skip') {
        // Skip lands on the next decision point (deal card or end card) — never past a hand.
        dir.settle();
        if (root.querySelector('.hand-card, .end-card')) return;
        d.track?.assist(sceneId, `${caseKey}:${sceneId}:${beats === preBeats ? 'pre' : 'post'}`);
        dir.skipToEnd();
      } else if (act === 'story-deal') {
        if (dir.enterHand()) root.querySelector<HTMLElement>('.scene-card-slot')!.innerHTML = '';
      } else if (act === 'story-onward') {
        const idx = SCENES_IN_ORDER.indexOf(sceneId);
        const next = o.replay ? null : SCENES_IN_ORDER[idx + 1] ?? null;
        dir.cancel();
        if (next) {
          persist({ ...p, sceneId: next, part: 'pre', index: 0, outcome: null, hand: null });
          void open(next);
        } else {
          dispose();
          void renderStoryHome(d);
        }
      } else if (act === 'update-now') {
        d.update?.apply();
      } else if (act === 'story-file') {
        dispose();
        void renderStoryHome(d);
      } else if (act === 'story-text') {
        const i = TEXT_SCALES.indexOf(p.textScale);
        p = { ...p, textScale: TEXT_SCALES[(i + 1) % TEXT_SCALES.length]! };
        if (!o.replay) save(d, p);
        root.style.setProperty('--story-scale', String(p.textScale));
      } else if (act === 'story-transcript') {
        const dlg = root.querySelector<HTMLDialogElement>('dialog.transcript')!;
        const upto = Math.min(dir.index + 1, beats.length);
        const seen = beats === preBeats ? preBeats.slice(0, upto) : [...preBeats, ...beats.slice(0, upto)];
        dlg.innerHTML = `<h2 id="transcript-h">Transcript</h2><p class="note">${esc(scene.heading)} — everything shown so far.</p><ol class="transcript-list">${seen
          .map(({ block: b }) => `<li>${b.kind === 'line' ? `<strong>${esc(speakerOf(b.speaker!).label)}${speakerOf(b.speaker!).qualifier ? ` (${esc(speakerOf(b.speaker!).qualifier!)})` : ''}:</strong> ${esc(b.text!)}` : `<em>${esc(captionText(b.raw))}</em>`}</li>`)
          .join('')}</ol><div class="sheet-actions"><button type="button" class="btn" data-act="transcript-close">Close</button></div>`;
        dlg.showModal();
        (dlg.querySelector('[data-act="transcript-close"]') as HTMLElement).focus();
      } else if (act === 'transcript-close') {
        root.querySelector<HTMLDialogElement>('dialog.transcript')?.close();
        (root.querySelector('[data-act="story-transcript"]') as HTMLElement).focus();
      }
    };
    root.onkeydown = (e) => {
      const dlg = root.querySelector<HTMLDialogElement>('dialog.transcript[open]');
      if (dlg) return void wrapTab(e, dlg);
      if (!root.querySelector('.story-table-host')?.hasAttribute('hidden')) return; // the table owns input during a hand
      const t = e.target as HTMLElement;
      if (t.closest('button:not([data-act="story-next"])')) return;
      if (e.key === 'ArrowRight' || ((e.key === 'Enter' || e.key === ' ') && !t.closest('button'))) {
        e.preventDefault();
        dir.advance();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        dir.back();
      }
    };
    if (import.meta.env.DEV) (window as unknown as { __sbStory: unknown }).__sbStory = { director: dir, progress: () => p, sceneId };
  }

  await open(p.sceneId === 'epilogue' && p.part === 'end' && !o.replay ? 'epilogue' : p.sceneId);
}
