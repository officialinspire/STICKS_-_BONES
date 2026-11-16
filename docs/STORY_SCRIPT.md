# STICKS & BONES: NO REST FOR COUSIN

Repository review, visual/audio direction, and complete revised story script v0.2 for approval

Revised November 16, 2026. This replaces the complete v0.1 story. The premise is accepted in principle; the expanded script below is submitted for review. It is not implemented code. Build prompts and the detailed additional-asset plan come after story approval.

Revision focus: more developed pacing, a deliberately unscrupulous Tomás Vale, a recurring and genuinely supernatural invitation, stronger Roberto–Marisol chemistry, and a more personal emotional resolution.

## 1. Repository review record — from the earlier review, not rerun for this script revision

Repository: https://github.com/officialinspire/STICKS_-_BONES

Reviewed implementation: `claude/inspiring-bardeen-4yfmu5`, commit `c99ee757e0d4700a4609a08885ceddda87300980`.

At the time of that review, the default `main` branch was at `ef7ffcf10145a211f697a5ff808fbb00133fb046` and contains the source assets and a short README, not the application. The implementation branch contains the game. There were no pull requests in the repository when inspected. The latest branch CI run, 43944721640, completed successfully. No deployment run appeared among the repository's three workflow runs, which were CI runs. The branch release handoff also explicitly says NOT DEPLOYED. Do not treat a passing development branch as a published game.

Latest observed CI: https://github.com/officialinspire/STICKS_-_BONES/actions/runs/43944721640

### Fresh local verification

| Check | Result |
|---|---|
| Install | `npm ci --ignore-scripts` succeeded |
| TypeScript | Passed in `npm run check` |
| ESLint | Passed in `npm run check` |
| Unit/engine tests | **250 passed in 27 files** |
| Asset verification | Passed separately using `node --import tsx scripts/verify-assets.ts`: 19 image assets; six runtime derivatives; source hashes, frame bounds, and icons verified |
| Production build | Passed: 20 files, approximately 9.3 MB decimal / 9,067 KiB |
| Measured budgets | Code 204 KiB; runtime images 1,417 KiB; startup 724 KiB; streamed media 7,332 KiB |
| Fresh visual/browser QA | Attempted, but the local browser process was blocked by a host socket restriction before loading the app. No new screenshots or browser pass claimed |
| Firefox, WebKit, actual phones/tablets | Not verified in this review |

The aggregate `npm run check` stopped after its passing tests because the `tsx` CLI could not open its local IPC socket in this host. Running the same asset verifier via Node's `--import tsx` completed successfully; `npm run build` then passed. This was a tooling restriction, not a failed asset assertion. The build emitted an unresolved-at-build-time `new URL('../', import.meta.url)` warning from the PWA base resolver; it did not fail. Recheck that path in the production subpath smoke test when browser execution is available.

The browser download attempt also failed; the installed system Chromium was attempted and failed before startup on the host's socket permission. Do not convert those environment failures into game defects or browser coverage.

### Strengths visible in the code

- `src/engine/`: pure TypeScript command/state engine, versioned rules, seeded shuffle, canonical tile identities, invariants, and once-only score resolution.
- `src/ai/observation.ts`: sanitized own-hand/public-information observations, copied and frozen before policy use. Independent AI RNG. `src/ai/hard.ts` uses bounded sampled-world rollouts rather than reading real hidden hands.
- `src/app/session.ts`: epoch/sequence/seat guards discard stale AI decisions after pause, reset, and navigation.
- `src/app/privacy.ts`, `src/app/controller.ts`, and `src/ui/table.ts`: explicit cover/reveal state machine for two humans, concealed views, orientation/background handling, and hidden hands removed from accessible UI.
- `src/audio/manager.ts`: a central scene manager, music exclusivity, sound instance limits, mute preservation, and stale-callback checks.
- `src/app/save.ts` and `src/app/storage.ts`: versioned local records, validation, quarantine of bad records, and stable-state restoration.
- `src/pwa/sw.js`: app-scoped shell and image caches; targeted repair; no deletion of unrelated INSPIRE caches.
- Atlas generation and verification include pixel-based pip checks. The art is not trusted to define the game rules.

These are a strong foundation. They do not establish that every runtime edge case is correct on every device.

### Findings to carry into the next build round

| Priority | Finding | Evidence / consequence | Next action |
|---|---|---|---|
| Release | Implementation not on `main`; no observed deployment | Branch/tree/workflow inspection above | Release from the reviewed implementation after agreed checks; do not develop against asset-only `main` by mistake |
| High | Browser QA only documented for Chromium | `docs/QA.md`, `docs/RELEASE_HANDOFF.md`; CI runs Chromium smoke | Add Firefox/WebKit checks and actual iOS/Android/tablet playtests; recheck after new typography/dialogue |
| Medium | Autosave failures are ignored by callers | `writeSave()` returns false; `src/main.ts` discards it during autosave and update preparation | Display persistent save-failed feedback; never claim an update saved the game if storage refused the write; test quota failures |
| Medium | Transient music failures have no in-session recovery | `src/audio/manager.ts` adds tracks to `#broken`; no clearing/retry path exists | Add explicit bounded retry after a new user gesture/network recovery; retain exclusivity/mute protections |
| Medium | Small-screen hand tiles below the project's 44 px comfort target | Documented 40×80 at narrow portrait and 38×76 in short landscape | Revisit hit areas and spacing; validate long hands and both endpoints without sacrificing pip readability |
| Feature | Only one environment is wired into runtime | `src/assets/urls.ts` includes neighborhood patio; other six environments are source variants | Create optimized derivatives and per-scene loading for existing art; no need to generate more locations for this story |
| Feature | Current identity is plain text with Georgia/system fonts | `src/ui/menu.ts`, `src/styles.css` | New responsive wordmark, type system, and tropical palette |
| Feature | SFX/ambience are still placeholders | `src/audio/synth.ts`, `src/assets/audio-manifest.ts` | Add selected local samples and real environmental recordings with asset provenance |
| Input missing | INSPIRE intro video not present | Asset verification and `src/assets/media-urls.ts` | Supply `assets/video/inspiresoftwareintro.mp4`; existing missing-video fallback works structurally |
| Input missing | Analytics disabled | `src/app/analytics-config.ts` | Reuse the actual INSPIRE analytics/consent/attribution contract, then verify live events |
| Cleanup | Version/documentation drift | Package says 0.1.0; handoff calls it 1.0.0 RC; older asset sections still say no audio | Align release version and replace stale current-status passages |
| Future resilience | Worker decision requests have no timeout or `messageerror` handler | `src/ai/runner.ts` | Add bounded fallback and cancellation tests for a worker that never replies; this is a code-inspection risk, not an observed game stall |

No code, branches, PRs, or live site were changed during that review or this script revision. Repository and verification statements in this section are the earlier snapshot, not a new check of the current remote.

## 2. Proposed identity and presentation

**Main brand:** STICKS & BONES

**Story subtitle:** NO REST FOR COUSIN

**Menu promise:** A dominoes mystery in Puerto Rico.

The visual language should feel like a hand-painted neighborhood domino-club sign meets a sun-faded tropical detective paperback: bold, confident, warm, and slightly dangerous. Large ivory tiles remain the most readable objects on the game board.

| Token | Proposed color | Role |
|---|---|---|
| Deep sea | `#083F43` | Major panels and dark outlines |
| Caribbean teal | `#087F80` | Accents and scene navigation |
| Guava coral | `#D94F45` | Selected accents and punchy decorative details |
| Sun gold | `#F2B544` | Primary action fills with dark text |
| Warm ivory | `#FFF2D8` | Tile faces, dialogue panels, readable light surfaces |
| Night ink | `#14252B` | Text on light backgrounds and night-scene panels |

These are proposed design tokens, not a claim that every possible pairing meets contrast requirements. Verify actual pairings, states, opacity, and backgrounds in the rendered interface.

Typography: custom chunky hand-lettered title; Bricolage Grotesque as a display-family candidate; DM Sans as a dialogue/control candidate. Verify font files and included licenses, then self-host a compact subset that includes Spanish accents, ñ, ¿, and ¡. Do not label these fonts inherently Puerto Rican: local character comes from the art direction, environmental references, language, and composition. Keep score digits tabular. Avoid cursive dialogue or thin ornamental text.

Wordmark: two compact stacked lines, STICKS above & BONES, slightly irregular painted letterforms, warm ivory face, deep-teal dimensional outline, restrained guava accent. The ampersand can resemble a pair of connected dominoes. Optional small illustrated coquí silhouette as a secondary mark, not a huge decorative mascot covering the table. Provide SVG/vector masters, small-screen variant, accessible text equivalent, and monochrome version. Do not use Taíno spiritual imagery as generic interface ornament.

Menu layout: Story / Quick Play / Two Players as primary destinations; How to Play and Settings secondary. Story has Continue Case, Chapter Select for completed chapters, and a small case notebook. Portrait uses stacked content; short landscape uses a compact split layout, not a tall column squeezed below the fold. Gameplay decorations stay at edges; no leaves crossing hands or pips.

Scene changes: warm daytime patio → harsher resort hospitality colors → indigo beachfront → humid jungle greens → cool cave stone → slick corporate glass. Use the existing seven backgrounds. Add portrait crop/focal-point metadata and contrast scrims rather than blindly stretching them.

## 3. Revised story treatment and pacing — v0.2

**Title:** STICKS & BONES: NO REST FOR COUSIN.

**Logline:** An early-retired undertaker investigating a friend's apparent fraud discovers that a ruthless resort director is stealing more than water from a protected Taíno site—and that something there has been trying to reach him before he even knew the place existed.

The resort, site, characters, and supernatural events are fiction. The site's local name, La Cámara del Agua, is invented Spanish, not a purported traditional Taíno name. The presence is not assigned the identity of a real deity or presented as a documented ceremony. Present-day Taíno community members remain the site's custodians; Roberto helps them, rather than replacing them as its savior. His Vedic astrology is his own separate interest.

### What changes from v0.1

- **More developed scenes:** relationships and observations develop before the clue summary. Characters occasionally sit with an uncomfortable answer. Not every exchange ends in a punchline.
- **A genuinely unscrupulous Tomás Vale:** he knowingly falsifies records, retaliates against Marisol, intimidates staff, offers to buy Roberto, and pushes a damaging overnight construction decision. His hospitality charm is an instrument of control. He stays dangerous when he stops smiling.
- **An active supernatural thread:** dreams precede the investigation; a signal persists without electronics; water behaves impossibly in front of witnesses; the presence recognizes something private in Roberto. It is clearly more than the staged haunting, though its exact nature stays unresolved.
- **A relationship arc:** Marisol and Roberto begin with familiar flirting, disagree over his protective instincts, share vulnerability, choose to trust each other, and reach an earned romantic moment.
- **More personal stakes:** Roberto's habit of making every room comfortable hides his fear of being unable to help. Marisol refuses to remain the accommodating employee who takes responsibility for everyone else's choices. Rafa has to stop mistaking silence for kindness. Luz insists that help includes listening.

### The mystery beneath the mystery

**Human case:** Costa Clara Resort's development director, Tomás Vale, used an administrative override to frame operations systems coordinator Marisol Vélez for equipment approvals and a missing water report. His contractor diverts spring water toward a new wellness development. The report would expose the diversion and its effect on the community-protected site. Vale schedules an overnight sealing of a lower water channel, calling it routine stabilization. Separately, he intends to sell controlled access to the upper cave as an exclusive future guest experience.

**Manufactured haunting:** after staff reported real disturbances, Vale reused those stories. He installed event speakers to frighten away witnesses, closed the route, and labeled people who complained unreliable. The fake voice has an identifiable repeating cough and inventory trail. It is a cover, not the origin of every phenomenon.

**Real presence:** Roberto dreamed of the waterfall and a lit threshold before meeting Marisol about the case. The presence answers three knocks with a fourth, gathers water against gravity, and reaches toward him without forcing him. It uses a phrase he once said privately while comforting someone through a loss. It appears to be asking him to return something metaphorical: care, attention, and an open way for the water. It neither hands him the fraud evidence nor gives him supernatural domino powers.

**Resolution:** Marisol and Luz preserve and deliver the documentary evidence, arrange an independent site inspection, and stop the overnight work. A booked domino exhibition becomes a public confrontation with Vale while those actions take effect. Winning the hand is satisfying; losing cannot erase the evidence. The environmental and employment response begins on screen. Roberto's quieter resolution is choosing to stay present with people instead of hiding behind being useful.

### Core cast and dramatic movement

| Character | Surface | What develops |
|---|---|---|
| Roberto “Cousin” | Muscular, macho, profane, generous, flirtatious; former undertaker; coder, lifter, Vedic-astrology enthusiast | Learns that helping does not require total control, and fear is easier to carry when he lets someone stay beside him |
| Marisol Vélez | Funny, competent resort systems coordinator; used to solving problems quietly | Stops accepting blame to protect everyone else; becomes an equal investigator and chooses Roberto as a person, not just a fixer |
| Tomás Vale | Charming development director with immaculate manners | Reveals calculated cruelty, entitlement toward workers and the site, and fear of something he cannot own |
| Luz Rivera | Heritage researcher and trail steward connected to the local Taíno community | Leads the site's response, distinguishes known history from personal experience, and challenges Roberto to listen rather than perform |
| Tío Rafa | Sociable neighborhood regular, jokes through discomfort | Admits that looking away helped Vale; contributes evidence and stands publicly with Marisol without cheating at the table |

### Structure and length

Seven chapters, seven existing backgrounds, seven required domino hands. Story is solo with the human playing Roberto. Quick Play and two-human modes remain separate. Modes stay traditional: three Draw, two Block, two Partnership. Every win, loss, or blocked tie advances the case. There are no mandatory retries, long score-target matches, combat scenes, or walking sections.

Target **90–110 minutes** for a representative first playthrough, with a release requirement to test the required route under **120 minutes**. Allow approximately 50–65 minutes for seven hands, 25–30 minutes for dialogue and scene beats, and 5–10 minutes for transitions/notebook use. These are budgets, not observed timings. If fresh-player tests run long, trim repetitive table banter and nonessential lines before cutting relationship scenes. Player idling, unlimited reading, and voluntary replays are not capped.

Dialogue unfolds in short, manually advanced cards. Pauses are opportunities for the player to advance, not mandatory timed waits. Essential information cannot auto-disappear. Optional during-hand banter fires only in safe gaps; it adds no hidden information and is not required to understand the story. Include transcript access and an optional Finish Hand with AI assistance. Story results resolve at one completed hand, not a 100/200-point match target.

**Timeline:** Day 1 morning patio; midday alley; late-afternoon resort; night promenade. Day 2 morning jungle; afternoon cave; sunset terrace. Vale's overnight channel-sealing job is due at 10 p.m. on Day 2. Place simple travel/time cards between districts; no suggestion all seven places are a short walk apart.

## 4. Complete revised working script — v0.2

Square brackets are staging and implementation notes, not spoken dialogue. Chapter result inserts are alternatives: play only the one matching the hand. All routes rejoin the shared scene. The script is fully playable without voice recordings. Profanity is the default draft voice, with the existing clean-language option retained for implementation.

### Prologue — An Open Door

**Location:** The existing waterfall-cave background, tightly framed and dimmed. An image in a dream, not an explorable location. No domino hand.

[Water. A narrow line of warm light lies across dark stone, as though a door has been left open somewhere out of view. Three measured knocks.]

COUSIN: “Hello?”

[No voice answers. A fourth knock comes from beyond the light. Roberto takes one step, then wakes.]

[Cut to the neighborhood patio at dawn. An untouched glass of water stands beside a notebook containing workout figures, code fragments, and handwritten astrology notes. He draws a line across an unfinished sketch of falling water.]

COUSIN, narration: “People ask why I retired young. I tell them the hours were bad.”

[He closes the notebook.]

COUSIN, narration: “Usually they laugh. Usually I let them.”

[A neighbor calls “Cousin!” outside. The familiar confident smile returns as he reaches for his hat.]

### Chapter 1 — Retirement Is a Scheduling Error

**Location:** Shaded Puerto Rican Neighborhood Patio, Day 1 morning. **Hand:** Draw versus Tío Rafa. **Purpose:** Establish Roberto's everyday generosity, Marisol's trust, their chemistry, and the cost of the accusation before introducing the delivery clue.

[Rafa rearranges two chairs while Roberto puts away a small set of weights. A repaired fan runs on the table's far edge.]

RAFA: “Mrs. Delgado says the fan works.”

COUSIN: “Of course it works.”

RAFA: “She tried to pay you.”

COUSIN: “She did pay me. Two lunches and a warning about her niece.”

RAFA: “You listened to the warning?”

COUSIN: “I believe in informed decisions.”

[Rafa notices the notebook as Roberto moves it out of reach of the coffee.]

RAFA: “Same dream?”

COUSIN: “Same waterfall.”

RAFA: “Maybe you need a vacation.”

COUSIN: “I live on an island, Rafa. If I relax any harder, I become furniture.”

[Marisol appears at the gate. She has changed out of her resort uniform but is still wearing the staff lanyard. Roberto pulls out a chair; she remains standing.]

COUSIN: “There she is. Tell me they finally named a pool after you.”

MARISOL: “I need a favor.”

COUSIN: “Anything involving a laptop or a heavy object, I'm your man.”

MARISOL: “What about a terrible decision?”

COUSIN: “Depends. Dinner first?”

[She almost smiles. He sees that it takes effort and stops performing.]

COUSIN: “Hey. What happened?”

[She sits. Roberto places water in front of her and waits.]

MARISOL: “They suspended me this morning. Equipment approvals under my login. A water inspection report somebody deleted. They asked me to sign a statement saying I was overwhelmed and made a mistake.”

RAFA: “But you didn't.”

MARISOL: “I know that. The statement was already printed.”

COUSIN: “You sign it?”

MARISOL: “No.”

COUSIN: “Good.”

MARISOL: “I almost did.”

[A beat. He lets her finish.]

MARISOL: “Not because it's true. Because I've spent years being the person who fixes the mess so everybody else can go home. They made it sound like this was one more mess I could fix.”

COUSIN: “This one's theirs. You don't have to carry it.”

MARISOL: “I need you to help me prove that. Not go down there and threaten somebody with your shoulders.”

COUSIN: “My shoulders have excellent professional references.”

[This time she laughs.]

MARISOL: “I'm serious.”

COUSIN: “So am I. You tell me what help looks like.”

[She opens the folder. Rafa recognizes a delivery date.]

RAFA: “Wait. Tuesday? My nephew took that load. Said the boxes were dripping.”

MARISOL: “They were billed as event speakers.”

RAFA: “These speakers came with blue pipe and a steel housing.”

COUSIN: “That's a bold new direction for music.”

MARISOL: “There are approval logs. I requested my copies before the suspension. We could go through them.”

RAFA: “Or call everybody and have a proper meeting.”

COUSIN: “Fuck THAT, we playing DOMINOES!”

[He sets the box down, then looks to Marisol, asking rather than dismissing her concern.]

COUSIN: “One hand. You breathe. He remembers. Then we work.”

MARISOL: “You make that sound almost reasonable.”

COUSIN: “My most dangerous quality.”

[DEAL: Draw versus Rafa. Marisol listens. Objective: finish one hand while Rafa talks through the delivery.]

Optional table lines:

- RAFA: “My nephew says you can identify any problem by the smell.” COUSIN: “Only some problems. The rest require an invoice.”
- MARISOL: “You fixed that fan yourself?” COUSIN: “You sound surprised.” MARISOL: “I'm updating the list.”

**Win insert:** RAFA: “You asked me three questions while I was counting.” COUSIN: “And you answered two. Everybody's improving.”

**Loss insert:** RAFA: “See? Relaxing helps.” COUSIN: “I was conducting an interview.” MARISOL: “Put that in the report.”

**Tie insert:** RAFA: “Nobody gets anything.” MARISOL: “I got ten minutes without checking my phone.” COUSIN: “Already a successful meeting.”

[Common continuation. Rafa draws the steel housing on a napkin.]

RAFA: “Contractor said executive event. Didn't want the regular loading crew involved.”

MARISOL: “Then I know where to start.”

[At the gate, she turns back.]

MARISOL: “Thank you for not making me explain twice.”

COUSIN: “Come back when it isn't a crisis.”

MARISOL: “You going to say that without the voice?”

[His grin softens.]

COUSIN: “Come back when it isn't a crisis.”

MARISOL: “Better.”

[After she leaves, Rafa looks at the napkin and the notebook's waterfall sketch.]

RAFA: “You still think it's just a dream?”

COUSIN: “I think we have a real problem first.”

Notebook: Marisol refused a prepared confession. The billed speaker delivery included pumping equipment. Review her requested records together.

### Chapter 2 — Authorized Personnel, Questionable Decisions

**Location:** Sunlit San Juan Back Alley, Day 1 midday. A familiar staff meeting spot, not a break-in route. **Hand:** Block versus Marisol. **Purpose:** Let the pair work together, establish their history, reveal the account override, and show Vale's retaliation.

[A folding table in the shade. Marisol brings two paper cups and a laptop. Roberto adjusts a wobbly table leg before sitting.]

MARISOL: “Black, no sugar. Before you say something.”

COUSIN: “You remembered.”

MARISOL: “You ordered it eighteen times while fixing the staff printer.”

COUSIN: “That printer was an emotional hostage situation.”

MARISOL: “You stayed three hours after you got it working.”

[He looks up. She lets the observation hang.]

COUSIN: “Good company.”

MARISOL: “Terrible coffee.”

COUSIN: “I made sacrifices.”

[They open the record exports.]

MARISOL: “These are the copies I was authorized to request. No dramatic hacking.”

COUSIN: “There goes the part where you admire my typing.”

MARISOL: “I'll admire a useful conclusion.”

COUSIN, narration: “When somebody blames a computer, ask what a person told it to do. Machines are very good at obeying bad instructions.”

[The approval timestamp and the training schedule appear side by side.]

MARISOL: “Tuesday, 2:14 a.m. My approval role was disabled for the training migration. I couldn't have authorized a stapler.”

COUSIN: “But somebody could authorize in your name.”

MARISOL: “Director override. Tomás Vale.”

COUSIN: “Tell me about Tomás.”

MARISOL: “Makes sure everybody sees him thanking the staff. Never remembers a name when somebody needs overtime.”

COUSIN: “And you?”

MARISOL: “He remembers mine.”

[Her phone rings. VALE on screen. She puts the call on speaker, keeping the records open.]

VALE: “Marisol. I hoped you'd reconsider the statement.”

MARISOL: “I need the approval trail reviewed.”

VALE: “It has been. These things become much more unpleasant when people involve friends.”

[Roberto stills. Marisol signals that she will handle it.]

MARISOL: “Who reviews a director override?”

VALE: “You're worried about the wrong part. I can keep this an internal mistake. Otherwise, external partners will ask whether you're trustworthy.”

MARISOL: “Are you threatening my reference?”

VALE: “I'm explaining how small an island can feel.”

[He ends the call. The alley sounds return. Roberto starts to rise; she puts a hand against his wrist.]

MARISOL: “Don't.”

COUSIN: “I was getting better reception.”

MARISOL: “With your shoulders?”

[He sits.]

COUSIN: “Yeah.”

MARISOL: “I need a partner, Roberto. If you turn this into a contest between two men, I'm the one who disappears from the conversation.”

[He takes that in.]

COUSIN: “You're right. Your case. We do this together.”

MARISOL: “Our case, if you can behave.”

COUSIN: “That's a challenging contract.”

[She slides the domino box toward him.]

MARISOL: “Then practice. You can try controlling this table instead.”

[DEAL: Block versus Marisol, while the exports finish processing. The full records arrive regardless of the result.]

Optional table lines:

- COUSIN: “You ever consider how attractive competent people are?” MARISOL: “Every time somebody makes me do their job.”
- MARISOL: “You don't have to make me laugh every minute.” COUSIN: “I know.” [Let that be the end of the exchange.]

**Win insert:** MARISOL: “I gave you that opening.” COUSIN: “Very generous. Should I send flowers?” MARISOL: “Send the spreadsheet.”

**Loss insert:** MARISOL: “There. Partner, not bodyguard.” COUSIN: “I'm learning a tremendous amount.”

**Tie insert:** COUSIN: “Mutually assured inconvenience.” MARISOL: “Finally, a management phrase I approve.”

[Common continuation. The export shows nightly contractor access through the closed jungle gate.]

MARISOL: “Every night. Vale signed the route closure himself.”

COUSIN: “He tells the staff nobody's allowed there, then sends equipment through after midnight.”

MARISOL: “There's a staff exhibition this afternoon. Dominoes on the patio. He's invited Rafa so the event looks local.”

COUSIN: “Then we arrive smiling.”

MARISOL: “Not too much.”

COUSIN: “Now you're asking for miracles.”

Notebook: A Vale override used Marisol's identity while her approval role was disabled. His threat and the nightly access pattern warrant preserving independent copies.

### Chapter 3 — All-Inclusive, Everything Has a Price

**Location:** Puerto Rico Resort Patio by the Sea, Day 1 late afternoon. **Hand:** Partnership; Cousin + Marisol versus Vale + Rafa. **Purpose:** Give Vale room to charm, probe, threaten, and offer a bargain. Establish that he wants control over both water and access to the cave.

[Resort staff move quietly around the patio. Vale straightens a name card while a worker waits with a tray.]

VALE: “We keep the service entrance out of the photographs, please.”

WORKER, text: “Of course, sir.”

[He dismisses them without looking at the tray. His smile arrives the instant he turns toward Marisol.]

VALE: “Marisol. I'm glad you've chosen to be constructive.”

MARISOL: “I organized this before you suspended me.”

VALE: “And we recognize your contribution.”

COUSIN: “You recognize it on the schedule, or just in speeches?”

VALE: “Roberto, isn't it? Everyone calls you Cousin.”

COUSIN: “People I like do.”

VALE: “Then I'll have to earn it.”

[His handshake is deliberate. Roberto gives him no physical contest.]

RAFA: “We sitting? My shirt has a limited tolerance for management.”

[They sit. Vale describes an architectural rendering on his tablet: a wellness complex and a private trail. No new location needs to be rendered.]

VALE: “The island offers something people can't find anywhere else. Quiet. Heritage. A feeling of access.”

MARISOL: “Access for whom?”

VALE: “For the people who sustain the investment.”

COUSIN: “And the people already here?”

VALE: “Employment. Infrastructure. Opportunities.”

RAFA: “You missed water.”

[Vale's glance toward Rafa is brief and cold.]

VALE: “No one is taking anything that isn't accounted for.”

MARISOL: “Then the inspection report should be easy to recover.”

VALE: “Your personal review isn't appropriate table conversation.”

COUSIN: “You brought the investment slideshow.”

[Vale puts the tablet away.]

VALE: “One hand, then. Let's see how you handle a partnership.”

[DEAL. No cheating or scripted tiles. Vale's character is expressed through dialogue, not unfair AI.]

Optional table lines:

- VALE: “You don't strike me as somebody who takes instructions well.” COUSIN: “Depends who's asking.” [Marisol gives Roberto a look. He grins without taking his eyes off the board.]
- RAFA: “My partner passed.” VALE: “I prefer to conserve options.” RAFA: “The options noticed.”
- MARISOL: “You can't buy a good hand.” COUSIN: “There goes his whole strategy.”

**Win insert:** VALE: “An exhibition, of course.” COUSIN: “That's right. Everybody got to see it.”

**Loss insert:** VALE: “Control is a useful habit.” MARISOL: “So is knowing when you're talking about a game.”

**Tie insert:** RAFA: “All that strategic vision and nobody can move.”

[Common continuation. Marisol steps away to speak with the event coordinator. Rafa follows to collect coffee. Vale lowers his voice.]

VALE: “You fix computers. Do favors. I could make that more stable for you.”

COUSIN: “I like my current benefits.”

VALE: “She'll get her job back. An apology. A better title. You stop digging into things that don't concern you.”

COUSIN: “And her name stays on your approvals.”

VALE: “People care about outcomes.”

COUSIN: “You don't know her very well.”

VALE: “I know what happens to people who confuse pride with protection.”

[His smile is gone.]

VALE: “I've read enough about your old profession. You're experienced at making unpleasant things presentable. Think of this as familiar work.”

[Roberto's thumb rests against the edge of the domino box. He takes his time answering.]

COUSIN: “My work was taking care of people. You should try it.”

[Marisol returns. Vale instantly resumes his public voice.]

VALE: “A pleasure. Security will escort you out.”

[Outside the patio, she notices Roberto's silence.]

MARISOL: “What did he offer?”

COUSIN: “An insult with dental.”

MARISOL: “And what did you say?”

COUSIN: “That he doesn't know you.”

[She considers him, then gently straightens the collar he has pulled tight against his neck.]

MARISOL: “You don't have to hide how much that bothered you.”

COUSIN: “Working on it.”

Notebook: Vale offered to restore Marisol's position if Roberto abandoned the evidence. His development plan includes controlled access to the cave route. Meet Rafa tonight.

### Chapter 4 — What the Water Remembers

**Location:** Moonlit Puerto Rican Beachfront Promenade, Day 1 night. **Hand:** Draw versus Rafa. **Purpose:** Distinguish the artificial voice from older phenomena, deepen Roberto's past without explaining it, and give Marisol and Roberto time alone.

[Rafa has bought three coffees. Marisol arrives with Roberto. The resort wristband has come off her lanyard.]

RAFA: “My nephew sent the unloading photograph. Pipe, pump casing, speaker cases. Everything together.”

MARISOL: “Good. That gives us the physical link.”

RAFA: “And the guard gave me a statement. The recorded voice says the same sentence every time. Same cough. But that's not the first thing he heard.”

COUSIN: “What came first?”

RAFA: “Knocking. Three close together. Then one farther off. He reported it before the contractor arrived.”

[Roberto's hand stops halfway to his cup. Marisol notices.]

MARISOL: “Roberto?”

COUSIN: “I've heard something like that.”

RAFA: “Where?”

COUSIN: “In a dream.”

[Neither laughs. That unsettles him more than a joke would have.]

MARISOL: “Since when?”

COUSIN: “Before you came over.”

RAFA: “Luz says some of the workers dreamed about water, too. She doesn't want people turning it into a spectacle.”

COUSIN: “Neither do I.”

RAFA: “Then come see her tomorrow. She asked for you by name.”

COUSIN: “You tell her about me?”

RAFA: “Not about the dream.”

[Let the surf hold the silence. Rafa opens the box rather than fill it with explanations.]

RAFA: “One hand. While there's still enough light for my terrible eyesight.”

[DEAL: Draw versus Rafa. Marisol listens without pushing Roberto.]

Optional table lines:

- RAFA: “Used to think keeping everybody happy was the same as keeping the peace.” COUSIN: “What changed?” RAFA: “Watching who got to complain.”
- MARISOL: “You can put your phone down. Nothing new for ten minutes.” COUSIN: “That an official forecast?” MARISOL: “A request.” [He puts it away.]

**Win insert:** RAFA: “You look less pleased than usual.” COUSIN: “Trying to give you room to recover.”

**Loss insert:** COUSIN: “Good hand.” RAFA: “No excuses?” COUSIN: “You want some? I've got a catalog.”

**Tie insert:** RAFA: “We could argue over it.” MARISOL: “Or enjoy one quiet result.” [They do.]

[Common continuation. Rafa leaves to deliver the photograph and statement to Luz. Marisol and Roberto stay on the bench.]

MARISOL: “You don't talk much about before.”

COUSIN: “I talk all the time.”

MARISOL: “That's not what I said.”

[He looks out over the water.]

COUSIN: “I used to work in Fredericksburg. Funeral home. Some weeks you needed somebody who could lift. Most weeks you needed somebody who could stay in a room when everybody else wanted out.”

MARISOL: “Were you good at it?”

COUSIN: “I tried to be.”

MARISOL: “Then something happened.”

COUSIN: “I left sooner than I planned.”

[This is the first direct Virginia-past passage. No flashback, outbreak terminology, or explanation.]

MARISOL: “You don't owe me the whole story tonight.”

COUSIN: “People usually ask for the worst part.”

MARISOL: “I'm asking if you're okay right now.”

[He exhales. His answer has no flourish.]

COUSIN: “Not completely.”

MARISOL: “Okay. We can work with honest.”

[She stays beside him. After a beat he turns toward her.]

COUSIN: “You're making it very difficult to remain mysterious.”

MARISOL: “You've been charging me for printer toner with little hearts on the receipts. You're not that mysterious.”

COUSIN: “Those were quality-control marks.”

MARISOL: “Then your quality control owes me dinner.”

COUSIN: “Tomorrow. Somewhere with no staff entrance.”

MARISOL: “Tomorrow. Provided you don't do anything heroic and stupid.”

COUSIN: “We should define the terms.”

[They share a quiet smile. Under the bench, a thin crescent of water reaches Roberto's shoe. The paving around it is dry. Marisol sees it before he moves.]

MARISOL: “The tide doesn't reach here.”

[Three light taps beneath the bench. A fourth comes from the empty stretch beyond it. Roberto stands slowly.]

COUSIN: “We're calling Luz now.”

Notebook: The repeating voice is artificial; the knocking predates its installation. Roberto's dream and a shared waterfront event remain unexplained. Luz has invited them to the camp.

### Chapter 5 — A Welcome Is Not a Deed

**Location:** Puerto Rican Jungle Camp Clearing, Day 2 morning. **Hand:** Block versus Luz. **Purpose:** Establish the living custodians, learn the deadline, and let Roberto practice listening before the presence reaches him more clearly.

[Luz checks water-sample labels. Two community volunteers work in the background as text-presence only; they need no new portraits. Marisol carries records. Roberto carries water, a field case, and rather too many supplies.]

LUZ: “You expecting to move in?”

COUSIN: “I like being useful.”

LUZ: “Start by putting that down. We're sharing the carrying.”

[He obeys. Marisol smiles at the speed of it.]

MARISOL: “Should've brought you to the alley.”

COUSIN: “Everybody's enjoying my character development.”

[Luz compares the dream sketch Roberto has chosen to bring with a photograph of the cave entrance. The threshold angle and waterfall match.]

LUZ: “Who showed you this?”

COUSIN: “Nobody. I'd remember.”

LUZ: “I'm not accusing you.”

COUSIN: “Sorry.”

[She studies the sketch again, disturbed rather than delighted.]

LUZ: “People have reported dreams since the water started dropping. Not all the same. A passage. Someone waiting. The sound of a room just before you walk into it.”

MARISOL: “You asked for Roberto.”

LUZ: “Rafa described him. Then one of the workers said he'd dreamed about a man in a hat standing at the entrance. I thought we should talk before anybody decided what it meant.”

COUSIN: “Could be a very handsome coincidence.”

[Nobody supplies the expected laugh. He catches himself.]

COUSIN: “All right. Tell me about the place.”

LUZ: “Our local name is La Cámara del Agua. It's part of a Taíno heritage site our community helps care for. Some of us have family and spiritual connections to it. That doesn't mean I can give you a neat explanation for every sound.”

MARISOL: “Vale calls it an unused attraction.”

LUZ: “He asked what it would cost to make it private.”

COUSIN: “And you told him?”

LUZ: “That it wasn't for sale. He kept asking for a number.”

[She shows the dated water record, a pump invoice, and a new work notice supplied to the custodians.]

LUZ: “The new spa draws from this line. When their pump runs, our levels drop. We sent the finding. Marisol's report acknowledged it.”

MARISOL: “You still have my reply?”

LUZ: “We keep our copies. He can delete his. Not ours.”

MARISOL: “He didn't lose my report. It was the report he needed gone.”

LUZ: “Now they're sealing a lower channel. Tonight, ten. They call it stabilization.”

COUSIN: “He cuts off the complaint, then sells access to what's left.”

LUZ: “We have an inspection request in motion. We need the equipment documented before the work crew changes the story.”

[Roberto checks his phone, then closes his astrology notes rather than pretend they answer the case.]

MARISOL: “What does Saturn say?”

COUSIN: “That somebody's an asshole. Still reviewing the chart.”

LUZ: “Can Saturn wait twenty minutes? The field team is coming back with the safety lead.”

COUSIN: “For you? I'll put him on hold.”

[Luz gestures to the camp table.]

LUZ: “Sit. People listen better when their hands have something to do.”

[DEAL: Block versus Luz. Marisol organizes the evidence beside the active play area.]

Optional table lines:

- LUZ: “A welcome isn't an invitation to take.” COUSIN: “Understood.” [No immediate joke.]
- MARISOL: “He's very good at fixing things.” LUZ: “Then he can learn which things don't belong to him to fix.” COUSIN: “I did say everybody was enjoying this.”

**Win insert:** LUZ: “You stopped trying to end every exchange.” COUSIN: “Turns out other people have information.”

**Loss insert:** COUSIN: “That was surgical.” LUZ: “Patient. There's a difference.”

**Tie insert:** LUZ: “No opening.” COUSIN: “Then we don't force one.” [She nods.]

[Common continuation. A voice from the empty trail says Roberto, quietly. He looks toward it. The other two hear running water where there should only be leaves.]

MARISOL: “I heard that.”

LUZ: “Stay here a moment.”

[A small line of water gathers on a root and travels upward toward a strip of morning light. The three watch it. It falls normally again when Roberto steps back.]

COUSIN: “Please tell me one of you brought an explanation.”

LUZ: “No.”

MARISOL: “We don't have to go any farther just because it wants something.”

[Roberto studies the trail, then looks to Luz.]

COUSIN: “If the site team says it's safe, and you still want us there, we go together. Otherwise we wait.”

LUZ: “Together. On the approved path. And if anybody says stop, we stop.”

Notebook: Vale's overnight work threatens the water channel. The site's custodians lead the response. Multiple witnesses have now seen behavior the speakers cannot explain.

### Chapter 6 — Leave a Light On

**Location:** Secret Cave Waterfall Platform, Day 2 afternoon. **Hand:** Draw versus Marisol at the modern inspection rest area near the entrance. The ancient platform remains untouched. **Purpose:** Confirm the documentary case, reveal Vale knew about real events, give Roberto an intimate supernatural encounter, and deepen the relationship afterward.

[The field safety lead has approved a limited visit. The old platform is visible beyond the water. Modern hoses and cables lie along a service ledge. A cheap amplified voice echoes from a contractor speaker.]

SPEAKER: “Go back. Go back.”

[A cough. The identical cough repeats at the same interval.]

COUSIN: “There it is. Our ghost has a playback problem.”

MARISOL: “Asset number matches the delivery. Photograph the label with the position visible.”

LUZ: “I'll record the hose route from the approved side. Nobody steps onto the old platform.”

[The group documents the equipment. Authorized maintenance isolates the pump and the speaker supply. Normal water sounds settle into the space.]

MARISOL: “Contractor handover packet. It has the work notice and the message chain the site team requested.”

[Readable evidence card, not a magical reveal: Vale wrote, No staff access before the channel is sealed. Keep using the recording. Repeated reports are creating a personnel issue.]

MARISOL: “Repeated reports. He knew the first ones weren't his recording.”

LUZ: “And decided the problem was the people reporting them.”

COUSIN: “Of course he did.”

[At the entrance, the field team takes copies. Signal is available there; Marisol sends the report, source exports, signed work notice, and contractor packet to the independent inspection team and resort board contact. Delivery is confirmed on screen. Nobody depends on a future upload from deep inside a cave.]

MARISOL: “Packet received. They need the inspection confirmation to stop tonight's crew.”

LUZ: “Our team is staying here. The lead is documenting the condition now.”

[Roberto turns toward the waterfall. The warm line of reflected light lies exactly where it did in his dream. His smile vanishes.]

COUSIN: “That's the place.”

MARISOL: “From the drawing?”

[He nods. Three knocks. A fourth answers from beyond the platform. Captions identify both directions. The disconnected speaker is visible in its closed case.]

LUZ: “Everybody stays on this side.”

[Water lifts in a thin curve along the stone, against the slope. Reflections suggest an open doorway without forming a human body. No real Taíno symbol is fabricated to explain it.]

VOICE, quiet: “Leave a light on.”

[Roberto takes a short involuntary breath. He does not advance.]

MARISOL: “Roberto. Look at me.”

[He can, but only after a moment.]

COUSIN: “I used to say that.”

MARISOL: “To who?”

COUSIN: “People who didn't want to go home after a service. Didn't want to walk into a dark house. I'd tell them to ask somebody to leave a light on.”

[He looks back.]

COUSIN: “I never told anybody here that.”

[The reflection brightens as if a door has opened farther. A wet mark appears on the stone at the boundary of the safe area, stopping short of his shoe.]

MARISOL: “It doesn't get to ask you to go alone.”

LUZ: “We don't know what it's asking. We don't have to answer with our feet.”

[Roberto kneels on the modern walkway, staying behind the agreed boundary.]

COUSIN: “I hear you. I don't know what you are, and I'm not going to pretend I do.”

[He waits.]

COUSIN: “People are working on the water. Nobody's closing it tonight if we can stop it.”

[The lifted water lowers. The reflection recedes into ordinary light. One quiet knock, no answer demanded.]

[Cut to the entrance rest area. Luz returns to the field team. Roberto sits, hands clasped too tightly. Marisol places her cup beside his. She waits before speaking.]

MARISOL: “Do you want a question or some quiet?”

COUSIN: “Quiet. Just for a second.”

[Let the player advance through a silent character beat.]

COUSIN: “I left Virginia because I was tired of rooms I couldn't make better.”

[Second and final direct Virginia-past passage. Its circumstances remain unspoken.]

MARISOL: “You don't have to make every room better.”

COUSIN: “That's a terrible business model.”

MARISOL: “I'm not a customer.”

[He looks at her.]

COUSIN: “No. You aren't.”

MARISOL: “And I'm not somebody you have to rescue so you don't have to talk about yourself.”

[He takes a moment, then nods.]

COUSIN: “I was scared.”

MARISOL: “I noticed.”

COUSIN: “I prefer mysterious and intimidating.”

MARISOL: “You can be all three. I'm versatile.”

[She takes his hand. He lets her.]

COUSIN: “This the part where you tell me not to get used to it?”

MARISOL: “No.”

[A longer look. A nearby radio crackles: inspection team requests another twenty minutes. Marisol sets the domino box between them.]

MARISOL: “Your hands could use something less dramatic to hold.”

COUSIN: “You offering me a game?”

MARISOL: “I'm offering to stay.”

[DEAL: Draw versus Marisol. This hand is a grounding pause while the inspection is completed, not a game on the spiritual platform or a supernatural contest.]

Optional table lines:

- MARISOL: “You can lose a hand and still be worth having around.” COUSIN: “Dangerous precedent.”
- COUSIN: “When this is done, dinner. No files.” MARISOL: “No files. You can bring the hat.”

**Win insert:** COUSIN: “I'm back.” MARISOL: “You didn't have to go anywhere.”

**Loss insert:** MARISOL: “Count them.” COUSIN: “Cruel woman.” MARISOL: “You like me.” COUSIN: “Very inconveniently.”

**Tie insert:** MARISOL: “We can leave it there.” COUSIN: “For once, I might.”

[Common continuation. Luz returns with the inspection confirmation: an immediate stop is warranted, and the board contact has acknowledged it. Vale's invitation reminder appears on Marisol's phone: executive exhibition, sunset.]

LUZ: “My team stays with the site. You two make sure he doesn't turn this into a private conversation.”

MARISOL: “He already tried.”

COUSIN: “Let's give him an audience.”

[As they leave, Roberto pauses at the entrance. He does not collect or leave an object.]

COUSIN, softly: “We heard you.”

Notebook: Equipment, overrides, deleted-report copies, Vale's directive, and the inspection are independently preserved. The presence appears to recognize Roberto's care for grieving people. Its nature and motive remain uncertain; its reality is no longer reduced to the fake speaker.

### Chapter 7 — The Price of Everything

**Location:** Sleek Puerto Rican Executive Resort Terrace, Day 2 sunset. **Hand:** Partnership; Cousin + Marisol versus Vale + Rafa. **Purpose:** Let Vale choose coercion even after the evidence is clear. Marisol leads the exposure. Roberto supports rather than speaks over her. Fair dominoes provide the confrontation's public setting.

[An investor reception is gathering. The advertised domino exhibition has a reserved table. Rafa waits in his good shirt. Vale meets them before they reach it.]

VALE: “I expected you to be more sensible.”

MARISOL: “You expected me to sign.”

VALE: “I expected loyalty.”

MARISOL: “You used my name.”

[He looks around to make sure nearby guests cannot hear.]

VALE: “Because people trust it. That's what makes it useful.”

[Marisol studies him: no misunderstanding remains to resolve.]

MARISOL: “You knew exactly what you were doing.”

VALE: “Of course I did. I have a development to finish. Employees need salaries. Investors need confidence. You think a few frightened people should stop all of that?”

COUSIN: “You mean the people whose water you took.”

VALE: “Water moves. Land changes hands. Adults make arrangements.”

MARISOL: “And if the adults say no?”

VALE: “Then somebody more practical speaks for them.”

[A beat. Roberto moves beside Marisol rather than in front of her.]

COUSIN: “She's speaking.”

MARISOL: “The source records are with the board. The inspection's confirmed. Tonight's work is stopped.”

[Vale checks his phone. The stop notice has arrived. His jaw tightens.]

VALE: “You have no idea what you've disturbed.”

COUSIN: “You heard it too.”

[For the first time, Vale cannot hide his fear. He lowers his voice further.]

VALE: “It repeats things. Things people haven't said.”

MARISOL: “And your answer was to bury the channel.”

VALE: “My answer was to make it manageable.”

COUSIN: “That's your whole problem, Tomás. You think everything's waiting for an owner.”

[Vale takes a breath, recovering the public smile as a guest approaches.]

VALE: “Our exhibition players. Right on time.”

[He tries to steer Marisol toward an empty side room. She stays at the table.]

MARISOL: “We can discuss it here.”

VALE: “Let's not make a scene.”

COUSIN: “Fuck THAT. We playing DOMINOES.”

RAFA: “The guests were promised a fair game. Sit down, Tomás.”

[They sit. Evidence already delivered; inspection and custodians already protect the site. The table keeps the dispute public while the board representative arrives. A hand's result does not grant rights or decide consequences.]

[DEAL: Partnership. Rafa plays honestly as Vale's partner. Personal solidarity is not signaled through secret moves or deliberate losses.]

Optional table exchanges, placed between moves:

- VALE: “I donated to that neighborhood table.” RAFA: “You did. I thanked you. I didn't sell it to you.”
- VALE: “How many people have you employed?” MARISOL: “How many are allowed to tell you the truth?”
- COUSIN: “Good move, partner.” MARISOL: “Try sounding less surprised.” COUSIN: “That was admiration. Different expression.”
- VALE, after an ordinary pass: “Someone should be able to open this.” RAFA: “Someone could. We play by the rules.”

**Win insert:** COUSIN: “¡Dominó! No more tiles.” MARISOL: “Still plenty to discuss.”

**Loss insert:** VALE: “You see? In the end—” MARISOL: “You won a hand, Tomás. Finish the sentence carefully.”

**Tie insert:** RAFA: “Blocked. We count what everybody's holding.” [Marisol looks at Vale.] MARISOL: “For once.”

[Common continuation. The board representative arrives with the resort's compliance lead; these roles can appear as text and off-camera voices. A work-stop confirmation from the independent inspection team is visible.]

REPRESENTATIVE: “Mr. Vale, the contractor has acknowledged the stop. Your access is suspended pending investigation. We'll need the original authorizations.”

VALE: “These are internal operational decisions.”

MARISOL: “Then you shouldn't have needed my signature.”

REPRESENTATIVE: “Ms. Vélez's suspension is rescinded. The override trail and report will be preserved under the review. Site access remains with the custodians and inspection team.”

[Vale looks to Roberto for a private exit from the exchange. Roberto does not offer one.]

VALE: “You'll regret making an enemy over this.”

COUSIN: “You made an enemy when you decided her life was spare equipment.”

[Vale is escorted away from the event, angry and still accountable to a continuing investigation. No instant conviction or magical disappearance.]

[Marisol sits again. The effort of staying composed catches up with her. Roberto waits before reaching across the table. She takes his hand.]

COUSIN: “You okay?”

MARISOL: “Not completely.”

COUSIN: “Okay. We can work with honest.”

[She recognizes her own words and smiles.]

RAFA: “I'd like to say I always knew he was trouble.”

MARISOL: “Did you?”

RAFA: “I knew enough to ask more questions. I liked the donation. I didn't like the discomfort.”

COUSIN: “You showed up when it counted.”

RAFA: “I'm showing up earlier next time.”

[Luz's message arrives: work stopped, overnight watch arranged, water recovering. A short attached field clip shows a steady waterfall; no mysterious voice on demand.]

MARISOL: “They offered my job back.”

COUSIN: “You want it?”

MARISOL: “I want a day where that isn't the first question.”

COUSIN: “I know a place with terrible coffee.”

MARISOL: “Good company?”

COUSIN: “Excellent references.”

### Epilogue — Someone Left a Light On

**Location:** Neighborhood patio, Day 2 later that evening, reused with a night grade. No additional hand.

[A simple dinner has been interrupted by neither a laptop nor a case folder. The domino box is closed. Roberto reaches for his phone when it buzzes, then decides not to.]

MARISOL: “Could be another terrible decision.”

COUSIN: “Office hours are over.”

MARISOL: “I thought you didn't have office hours.”

COUSIN: “New management.”

[She laughs. The repaired fan moves the edge of a napkin.]

MARISOL: “You ever think about what you want when nobody needs fixing?”

COUSIN: “Working out. Writing code nobody asked for. Arguing with Saturn.”

MARISOL: “I said what you want.”

[He looks at her, letting the answer be simple.]

COUSIN: “More evenings like this.”

MARISOL: “You could've asked.”

COUSIN: “I'm asking.”

[She moves her chair closer.]

MARISOL: “Then yes.”

[She touches his jaw, giving him a moment to meet her halfway. They kiss. Keep it warm, brief, and unhurried.]

[A knock at the gate. They separate just enough to exchange an exasperated smile.]

COUSIN: “If that's Rafa, I'm charging him.”

[No one stands outside. A shallow line of water lies beneath the gate. It ends before their chairs. Three soft knocks come from the closed domino box. A fourth answers from beyond the lit doorway.]

[Marisol takes Roberto's hand. He does not reach for a weapon, collect a tile, or step into the dark.]

MARISOL: “Is it asking again?”

[He looks toward the doorway. The light stays on.]

COUSIN: “I think it knows we heard.”

MARISOL: “You don't have to answer every call tonight.”

[He sits back beside her.]

COUSIN: “Table's closed.”

[A beat. His familiar grin returns, with less armor behind it.]

COUSIN: “Tomorrow? Fuck it. We'll see.”

[The water goes still. Cut to title, then credits. Case complete. No compulsory sequel chapter.]

## 5. Character voice and continuity rules — revised

### Roberto

His default is confident, physical, funny, practical, and generous. His shoulders announce him before he speaks, but force is not his solution to every problem. He enjoys being admired and makes his interest in Marisol obvious; he can also hear a boundary and change his behavior. She enjoys the flirting without becoming an audience permanently assigned to his confidence.

His undertaking background gives him patience with grief, attention to detail, and experience staying beside people who are frightened. It is not merely a source of death puns. His buried history explains why he hides behind usefulness, not exactly what happened in Virginia. Keep the two direct past passages as written; do not add flashbacks or explain the old events in incidental banter.

He does not become a shaman, decode a real Taíno ritual through astrology, or gain powers from the site. The presence responds to something in his capacity for care and his private history. He is neither declared a chosen one nor placed above the local custodians. It is important that he can choose to stay, listen, and go home.

### Marisol

She has professional competence, humor, anger, desire, and her own decisions. She gathers and preserves evidence, names the coercion, handles her confrontation, and asks for the kind of support she actually wants. The romance develops through mutual attention: remembered coffee, familiar printer visits, a boundary respected, a difficult truth shared, a hand accepted, and a real date.

She never needs to prove affection by tolerating mistreatment. Her cave-scene presence supports Roberto without becoming a therapy lecture. She is allowed to be frightened too.

### Tomás Vale

He is deliberately unscrupulous, not a misunderstood manager. His repeated behavior is claiming ownership: of signatures, staff loyalty, a donation, the site's access, and the right to define reality for other people. His worst lines should be calm and specific. Avoid constant sneering, random violence, or a speech explaining every secret before the evidence exists.

He knows the early phenomena were real enough to frighten staff, exploits them with the recording, then tries to seal the channel when he cannot control them. His fear does not redeem him. He loses institutional control through documented actions, not because the player wins a wager. He remains a credible human threat after his smile slips.

### Luz and Rafa

Luz has ordinary competence and dry humor; she is not an all-knowing mystical guide. She distinguishes community knowledge, her own understanding, and what nobody can explain. Rafa's jokes initially avoid discomfort; his arc makes that avoidance visible and changes it. Both contribute to the outcome independently of Roberto.

### Gameplay dialogue

Do not fire quips during an emotionally serious card or plot-critical sound. Keep optional table exchanges sparse. Use the existing explicit-language preference for alternate wording; preserve emotional meaning, not just censored syllables. No story line reveals hidden tiles or suggests the AI knows them. Story wins, losses, ties, assistance, and reloads cannot change which evidence exists.

Suggested short banter pool:

| Context | Line |
|---|---|
| Good player move | “Okay. Clean as fuck. I respect it.” |
| Roberto pass | “I got nothing. Try not to make it your whole personality.” |
| His bad hand | “Saturn's an asshole today. Still my responsibility, though.” |
| Partnership praise | “That's my partner. Watch and learn.” |
| Friendly loss | “Run it back before I develop humility.” |
| Marisol flirting | “You're very impressive when you let me finish a sentence.” |
| Roberto flirting | “I'm listening. I'm also admiring. I can multitask.” |
| Vale passing | “A temporary limitation.” |
| Rafa answering Vale | “That's what the rest of us call a pass.” |
| Luz on a block | “Sometimes the right answer is to stop pushing.” |
| Genuine distress | “Hey. Sit down. I'm here.” |


## 6. Sound direction and acquisition plan

Recommend **bundled local audio assets**, downloaded/selected during development. A runtime sound API adds latency, credentials, availability dependencies, and licensing complexity to a game that already supports offline play.

| Sound group | Proposed source/approach | Runtime behavior |
|---|---|---|
| UI select/back/confirm | Audition the Kenney Interface Sounds CC0 pack | Small decoded sample bank, soft volume, no hover spam |
| Domino pickup/slide/place/slam | Record a real double-six set on two wood surfaces; supplement with individually licensed downloaded sounds if useful | 3–5 variations; tiny restrained gain/pitch variation; no exaggerated cinematic boom |
| Pass knock / shuffle | Real table foley | Short, dry, centered and responsive |
| Neighborhood | Quiet patio bed, distant human presence, light birds, room for music | Environmental bus, restrained and optional |
| Promenade | Surf and sparse night ambience | Gentle transitions; no sudden volume jump |
| Jungle | Verified location-appropriate field recordings and subtle insects/birds | Avoid a generic roaring rainforest loop |
| Cave | Water, small reflected drips, three original knocks | Captions for plot-critical sounds; no jumpscare blast |
| Corporate terrace | Distant social event, subdued glassware/room tone | Keeps dialogue intelligible |

Store source URL, creator, sound ID where relevant, license, attribution text, and edits in an audio manifest. Freesound file licenses vary; prefer CC0 or compatible attribution licenses. Its API terms separately restrict free API use to noncommercial purposes. Do not equate a CC0 sound file with unrestricted commercial API use. For this project, a curated local sound bank is the simpler fit.

Start with approximately 20–30 short samples plus a few lean ambience loops. Measure download/decode cost on mobile. Give scene ambience its own gain and honor mute/backgrounding. Allow an optional explicit download for offline audio with a clear size indication; current PWA does not cache music/video. Adding downloadable audio requires its own scoped-cache/quota tests and an update to the app's current no-media-cache policy.

Existing supplied music remains useful: Patio Dominoes for menus/social scenes and Domino Table for play. New music needs only a night-investigation bed, a cave-water suspense bed, and short case-complete/round cues. No need to generate seven full songs before the story is playable. Audition loops by ear; the current tracks have composed endings and no approved seamless loop points.

Sources checked:
- https://kenney.nl/assets/interface-sounds
- https://kenney.nl/support
- https://freesound.org/help/faq/
- https://freesound.org/docs/api/terms_of_use.html

## 7. Story integration notes for the later prompt round

These are continuity requirements, not implementation prompts or the additional-asset plan.

- Keep the seven existing environments and seven one-hand encounters. The dream reuses a cave crop; the epilogue reuses the patio. No additional playable location is required by this revision.
- Story identity must make Roberto the human protagonist and correctly name his partners/opponents. Quick Play can retain Cousin as the opponent. Keep these roles separate in portraits, winner text, banter, and results.
- Use chapter-level story state outside the pure domino engine. Complete a chapter after one guarded hand resolution, including losses/ties. Do not change the frozen traditional rules preset to manufacture a story result.
- Separate Story and Quick Play saves. Preserve dialogue position, evidence flags, hand state, outcome, assistance status, and completed chapters. Reloads must not repeat rewards, skip relationship beats, or replay a chapter completion.
- Supernatural events belong to authored story beats before/after hands. No rearranged tiles, altered pips, forced wins, secretly improved AI information, or supernatural end targets. The prologue's knocks and all real-presence events have descriptive captions and reduced-motion alternatives.
- Marisol and Luz witness the real phenomena. Vale's recording is independently identifiable. Neither a skeptical outcome branch nor a comic hand result can accidentally explain away or omit the supernatural progression.
- Do not require a dialogue choice to unlock the romance or critical evidence. This is a developed linear script, not a branching relationship simulation. Optional banter changes flavor only.
- Retain manual text advance, skip with recap, transcript, text sizing, readable portrait/landscape layouts, scene-appropriate ambience, and no interruption of serious lines by random quips.
- The repository's old no-campaign scope statement must be updated under the owner's story authorization when implementation begins. Preserve engine purity, fair AI, shared-device privacy, and app-specific PWA isolation.
- Later QA must cover the new dialogue states on narrow portrait phones, short landscape phones, both tablet orientations, laptop/desktop, Chromium/Firefox/WebKit, actual phones, interrupted playback, refresh, and storage failure. Recheck all existing traditional/local modes.
- Validate narrative playtime using representative first-time human players. Target 90–110 minutes and keep the required route under two hours. Trim repeated optional banter and unnecessary text before cutting the emotional turning points.

## 8. What this revision asks you to approve

1. **Tomás Vale as a calculated antagonist:** coercive, willing to frame Marisol, buy silence, exploit a spiritual site, and damage it when he cannot control it.
2. **A real invitation from the site:** Roberto dreams before the case; the recurring signal becomes shared and physically impossible; the presence recognizes a private phrase from his old work. Its exact identity remains unknown.
3. **Roberto's emotional arc:** he moves from performing confidence and fixing everything to admitting fear, listening, and allowing care from another person. His Virginia history stays subtle and unresolved.
4. **The Marisol relationship:** banter and familiar attraction develop through disagreement, mutual respect, disclosure, a promised dinner, and a brief mutual kiss in the epilogue.
5. **Seven chapters / seven hands:** the human case closes and the relationship advances within one short game; a supernatural thread can remain without making the ending a compulsory sequel hook.

After approval or requested edits, the next step is the modular implementation prompt pack and a precise list of additional character sheets, expressions, evidence graphics, effects, and audio needed by this approved script.

### Cultural grounding reference

The specific spiritual site, supernatural behavior, characters, and resort are fictional. Present-day community relationships and custodianship remain central; this story does not present an invented ceremony as real Taíno tradition.

Smithsonian National Museum of the American Indian / Smithsonian Latino Center, Taíno: Native Heritage and Identity in the Caribbean gallery guide:
https://americanindian.si.edu/nk360/pdf/Taino-Gallery-Guide-English.pdf