import { describe, expect, it } from 'vitest';
import castJson from '../assets/cast.json';
import { insertLines } from './chapters';
import { castFrameFor, FRAMES, LINES, lineNumbers, robertoMood, type Expression } from './expressions';
import type { Block, Scene } from './parse';
import script from './script.json';

const scenes = (script as unknown as { scenes: Scene[] }).scenes;
const linesOf = (s: Scene): Block[] => s.blocks.flatMap((b) => (b.kind === 'line' ? [b] : b.kind === 'insert' ? insertLines(b).filter((x) => x.kind === 'line') : []));

/** Speaker and opening text of every tagged line: a script change can't silently move an expression. */
const ANCHORS: Record<string, [string, string]> = {
  'chapter-1#2': ['COUSIN', "“Of course it works.”"],
  'chapter-1#3': ['RAFA', "“She tried to pay you."],
  'chapter-1#4': ['COUSIN', "“She did pay me. Two l"],
  'chapter-1#5': ['RAFA', "“You listened to the w"],
  'chapter-1#6': ['COUSIN', "“I believe in informed"],
  'chapter-1#7': ['RAFA', "“Same dream?”"],
  'chapter-1#8': ['COUSIN', "“Same waterfall.”"],
  'chapter-1#9': ['RAFA', "“Maybe you need a vaca"],
  'chapter-1#10': ['COUSIN', "“I live on an island, "],
  'chapter-1#11': ['COUSIN', "“There she is. Tell me"],
  'chapter-1#12': ['MARISOL', "“I need a favor.”"],
  'chapter-1#14': ['MARISOL', "“What about a terrible"],
  'chapter-1#15': ['COUSIN', "“Depends. Dinner first"],
  'chapter-1#16': ['COUSIN', "“Hey. What happened?”"],
  'chapter-1#17': ['MARISOL', "“They suspended me thi"],
  'chapter-1#18': ['RAFA', "“But you didn't.”"],
  'chapter-1#19': ['MARISOL', "“I know that. The stat"],
  'chapter-1#20': ['COUSIN', "“You sign it?”"],
  'chapter-1#21': ['MARISOL', "“No.”"],
  'chapter-1#23': ['MARISOL', "“I almost did.”"],
  'chapter-1#24': ['MARISOL', "“Not because it's true"],
  'chapter-1#25': ['COUSIN', "“This one's theirs. Yo"],
  'chapter-1#26': ['MARISOL', "“I need you to help me"],
  'chapter-1#27': ['COUSIN', "“My shoulders have exc"],
  'chapter-1#28': ['MARISOL', "“I'm serious.”"],
  'chapter-1#30': ['RAFA', "“Wait. Tuesday? My nep"],
  'chapter-1#32': ['RAFA', "“These speakers came w"],
  'chapter-1#33': ['COUSIN', "“That's a bold new dir"],
  'chapter-1#34': ['MARISOL', "“There are approval lo"],
  'chapter-1#36': ['COUSIN', "“Fuck THAT, we playing"],
  'chapter-1#37': ['COUSIN', "“One hand. You breathe"],
  'chapter-1#38': ['MARISOL', "“You make that sound a"],
  'chapter-1#39': ['COUSIN', "“My most dangerous qua"],
  'chapter-1#40': ['RAFA', "“You asked me three qu"],
  'chapter-1#41': ['COUSIN', "“And you answered two."],
  'chapter-1#42': ['RAFA', "“See? Relaxing helps.”"],
  'chapter-1#43': ['COUSIN', "“I was conducting an i"],
  'chapter-1#44': ['MARISOL', "“Put that in the repor"],
  'chapter-1#45': ['RAFA', "“Nobody gets anything."],
  'chapter-1#46': ['MARISOL', "“I got ten minutes wit"],
  'chapter-1#47': ['COUSIN', "“Already a successful "],
  'chapter-1#49': ['MARISOL', "“Then I know where to "],
  'chapter-1#50': ['MARISOL', "“Thank you for not mak"],
  'chapter-1#51': ['COUSIN', "“Come back when it isn"],
  'chapter-1#52': ['MARISOL', "“You going to say that"],
  'chapter-1#53': ['COUSIN', "“Come back when it isn"],
  'chapter-1#54': ['MARISOL', "“Better.”"],
  'chapter-1#55': ['RAFA', "“You still think it's "],
  'chapter-1#56': ['COUSIN', "“I think we have a rea"],
  'chapter-2#1': ['MARISOL', "“Black, no sugar. Befo"],
  'chapter-2#2': ['COUSIN', "“You remembered.”"],
  'chapter-2#3': ['MARISOL', "“You ordered it eighte"],
  'chapter-2#4': ['COUSIN', "“That printer was an e"],
  'chapter-2#5': ['MARISOL', "“You stayed three hour"],
  'chapter-2#6': ['COUSIN', "“Good company.”"],
  'chapter-2#7': ['MARISOL', "“Terrible coffee.”"],
  'chapter-2#8': ['COUSIN', "“I made sacrifices.”"],
  'chapter-2#9': ['MARISOL', "“These are the copies "],
  'chapter-2#10': ['COUSIN', "“There goes the part w"],
  'chapter-2#11': ['MARISOL', "“I'll admire a useful "],
  'chapter-2#13': ['MARISOL', "“Tuesday, 2:14 a.m. My"],
  'chapter-2#14': ['COUSIN', "“But somebody could au"],
  'chapter-2#15': ['MARISOL', "“Director override. To"],
  'chapter-2#16': ['COUSIN', "“Tell me about Tomás.”"],
  'chapter-2#17': ['MARISOL', "“Makes sure everybody "],
  'chapter-2#19': ['MARISOL', "“He remembers mine.”"],
  'chapter-2#20': ['VALE', "“Marisol. I hoped you'"],
  'chapter-2#21': ['MARISOL', "“I need the approval t"],
  'chapter-2#22': ['VALE', "“It has been. These th"],
  'chapter-2#23': ['MARISOL', "“Who reviews a directo"],
  'chapter-2#24': ['VALE', "“You're worried about "],
  'chapter-2#25': ['MARISOL', "“Are you threatening m"],
  'chapter-2#26': ['VALE', "“I'm explaining how sm"],
  'chapter-2#27': ['MARISOL', "“Don't.”"],
  'chapter-2#28': ['COUSIN', "“I was getting better "],
  'chapter-2#29': ['MARISOL', "“With your shoulders?”"],
  'chapter-2#31': ['MARISOL', "“I need a partner, Rob"],
  'chapter-2#33': ['MARISOL', "“Our case, if you can "],
  'chapter-2#34': ['COUSIN', "“That's a challenging "],
  'chapter-2#35': ['MARISOL', "“Then practice. You ca"],
  'chapter-2#36': ['MARISOL', "“I gave you that openi"],
  'chapter-2#37': ['COUSIN', "“Very generous. Should"],
  'chapter-2#38': ['MARISOL', "“Send the spreadsheet."],
  'chapter-2#39': ['MARISOL', "“There. Partner, not b"],
  'chapter-2#40': ['COUSIN', "“I'm learning a tremen"],
  'chapter-2#41': ['COUSIN', "“Mutually assured inco"],
  'chapter-2#42': ['MARISOL', "“Finally, a management"],
  'chapter-2#43': ['MARISOL', "“Every night. Vale sig"],
  'chapter-2#44': ['COUSIN', "“He tells the staff no"],
  'chapter-2#45': ['MARISOL', "“There's a staff exhib"],
  'chapter-2#46': ['COUSIN', "“Then we arrive smilin"],
  'chapter-2#47': ['MARISOL', "“Not too much.”"],
  'chapter-2#48': ['COUSIN', "“Now you're asking for"],
  'chapter-3#1': ['VALE', "“We keep the service e"],
  'chapter-3#3': ['VALE', "“Marisol. I'm glad you"],
  'chapter-3#4': ['MARISOL', "“I organized this befo"],
  'chapter-3#5': ['VALE', "“And we recognize your"],
  'chapter-3#6': ['COUSIN', "“You recognize it on t"],
  'chapter-3#7': ['VALE', "“Roberto, isn't it? Ev"],
  'chapter-3#8': ['COUSIN', "“People I like do.”"],
  'chapter-3#9': ['VALE', "“Then I'll have to ear"],
  'chapter-3#10': ['RAFA', "“We sitting? My shirt "],
  'chapter-3#11': ['VALE', "“The island offers som"],
  'chapter-3#12': ['MARISOL', "“Access for whom?”"],
  'chapter-3#13': ['VALE', "“For the people who su"],
  'chapter-3#14': ['COUSIN', "“And the people alread"],
  'chapter-3#15': ['VALE', "“Employment. Infrastru"],
  'chapter-3#16': ['RAFA', "“You missed water.”"],
  'chapter-3#17': ['VALE', "“No one is taking anyt"],
  'chapter-3#18': ['MARISOL', "“Then the inspection r"],
  'chapter-3#19': ['VALE', "“Your personal review "],
  'chapter-3#20': ['COUSIN', "“You brought the inves"],
  'chapter-3#21': ['VALE', "“One hand, then. Let's"],
  'chapter-3#22': ['VALE', "“An exhibition, of cou"],
  'chapter-3#23': ['COUSIN', "“That's right. Everybo"],
  'chapter-3#24': ['VALE', "“Control is a useful h"],
  'chapter-3#25': ['MARISOL', "“So is knowing when yo"],
  'chapter-3#26': ['RAFA', "“All that strategic vi"],
  'chapter-3#27': ['VALE', "“You fix computers. Do"],
  'chapter-3#28': ['COUSIN', "“I like my current ben"],
  'chapter-3#29': ['VALE', "“She'll get her job ba"],
  'chapter-3#31': ['VALE', "“People care about out"],
  'chapter-3#33': ['VALE', "“I know what happens t"],
  'chapter-3#34': ['VALE', "“I've read enough abou"],
  'chapter-3#35': ['COUSIN', "“My work was taking ca"],
  'chapter-3#36': ['VALE', "“A pleasure. Security "],
  'chapter-3#37': ['MARISOL', "“What did he offer?”"],
  'chapter-3#38': ['COUSIN', "“An insult with dental"],
  'chapter-3#39': ['MARISOL', "“And what did you say?"],
  'chapter-3#41': ['MARISOL', "“You don't have to hid"],
  'chapter-3#42': ['COUSIN', "“Working on it.”"],
  'chapter-4#1': ['RAFA', "“My nephew sent the un"],
  'chapter-4#2': ['MARISOL', "“Good. That gives us t"],
  'chapter-4#5': ['RAFA', "“Knocking. Three close"],
  'chapter-4#6': ['MARISOL', "“Roberto?”"],
  'chapter-4#7': ['COUSIN', "“I've heard something "],
  'chapter-4#8': ['RAFA', "“Where?”"],
  'chapter-4#9': ['COUSIN', "“In a dream.”"],
  'chapter-4#10': ['MARISOL', "“Since when?”"],
  'chapter-4#12': ['RAFA', "“Luz says some of the "],
  'chapter-4#16': ['RAFA', "“Not about the dream.”"],
  'chapter-4#17': ['RAFA', "“One hand. While there"],
  'chapter-4#18': ['RAFA', "“You look less pleased"],
  'chapter-4#19': ['COUSIN', "“Trying to give you ro"],
  'chapter-4#21': ['RAFA', "“No excuses?”"],
  'chapter-4#22': ['COUSIN', "“You want some? I've g"],
  'chapter-4#23': ['RAFA', "“We could argue over i"],
  'chapter-4#24': ['MARISOL', "“Or enjoy one quiet re"],
  'chapter-4#25': ['MARISOL', "“You don't talk much a"],
  'chapter-4#26': ['COUSIN', "“I talk all the time.”"],
  'chapter-4#27': ['MARISOL', "“That's not what I sai"],
  'chapter-4#29': ['MARISOL', "“Were you good at it?”"],
  'chapter-4#30': ['COUSIN', "“I tried to be.”"],
  'chapter-4#31': ['MARISOL', "“Then something happen"],
  'chapter-4#32': ['COUSIN', "“I left sooner than I "],
  'chapter-4#33': ['MARISOL', "“You don't owe me the "],
  'chapter-4#34': ['COUSIN', "“People usually ask fo"],
  'chapter-4#35': ['MARISOL', "“I'm asking if you're "],
  'chapter-4#36': ['COUSIN', "“Not completely.”"],
  'chapter-4#37': ['MARISOL', "“Okay. We can work wit"],
  'chapter-4#38': ['COUSIN', "“You're making it very"],
  'chapter-4#39': ['MARISOL', "“You've been charging "],
  'chapter-4#40': ['COUSIN', "“Those were quality-co"],
  'chapter-4#41': ['MARISOL', "“Then your quality con"],
  'chapter-4#42': ['COUSIN', "“Tomorrow. Somewhere w"],
  'chapter-4#43': ['MARISOL', "“Tomorrow. Provided yo"],
  'chapter-4#44': ['COUSIN', "“We should define the "],
  'chapter-4#45': ['MARISOL', "“The tide doesn't reac"],
  'chapter-5#1': ['LUZ', "“You expecting to move"],
  'chapter-5#2': ['COUSIN', "“I like being useful.”"],
  'chapter-5#3': ['LUZ', "“Start by putting that"],
  'chapter-5#4': ['MARISOL', "“Should've brought you"],
  'chapter-5#5': ['COUSIN', "“Everybody's enjoying "],
  'chapter-5#6': ['LUZ', "“Who showed you this?”"],
  'chapter-5#9': ['COUSIN', "“Sorry.”"],
  'chapter-5#10': ['LUZ', "“People have reported "],
  'chapter-5#11': ['MARISOL', "“You asked for Roberto"],
  'chapter-5#12': ['LUZ', "“Rafa described him. T"],
  'chapter-5#13': ['COUSIN', "“Could be a very hands"],
  'chapter-5#14': ['COUSIN', "“All right. Tell me ab"],
  'chapter-5#15': ['LUZ', "“Our local name is La "],
  'chapter-5#16': ['MARISOL', "“Vale calls it an unus"],
  'chapter-5#17': ['LUZ', "“He asked what it woul"],
  'chapter-5#18': ['COUSIN', "“And you told him?”"],
  'chapter-5#19': ['LUZ', "“That it wasn't for sa"],
  'chapter-5#20': ['LUZ', "“The new spa draws fro"],
  'chapter-5#21': ['MARISOL', "“You still have my rep"],
  'chapter-5#22': ['LUZ', "“We keep our copies. H"],
  'chapter-5#23': ['MARISOL', "“He didn't lose my rep"],
  'chapter-5#24': ['LUZ', "“Now they're sealing a"],
  'chapter-5#25': ['COUSIN', "“He cuts off the compl"],
  'chapter-5#26': ['LUZ', "“We have an inspection"],
  'chapter-5#27': ['MARISOL', "“What does Saturn say?"],
  'chapter-5#28': ['COUSIN', "“That somebody's an as"],
  'chapter-5#29': ['LUZ', "“Can Saturn wait twent"],
  'chapter-5#30': ['COUSIN', "“For you? I'll put him"],
  'chapter-5#31': ['LUZ', "“Sit. People listen be"],
  'chapter-5#32': ['LUZ', "“You stopped trying to"],
  'chapter-5#33': ['COUSIN', "“Turns out other peopl"],
  'chapter-5#34': ['COUSIN', "“That was surgical.”"],
  'chapter-5#35': ['LUZ', "“Patient. There's a di"],
  'chapter-5#38': ['MARISOL', "“I heard that.”"],
  'chapter-5#39': ['LUZ', "“Stay here a moment.”"],
  'chapter-5#41': ['LUZ', "“No.”"],
  'chapter-5#42': ['MARISOL', "“We don't have to go a"],
  'chapter-5#43': ['COUSIN', "“If the site team says"],
  'chapter-5#44': ['LUZ', "“Together. On the appr"],
  'chapter-6#2': ['COUSIN', "“There it is. Our ghos"],
  'chapter-6#3': ['MARISOL', "“Asset number matches "],
  'chapter-6#4': ['LUZ', "“I'll record the hose "],
  'chapter-6#5': ['MARISOL', "“Contractor handover p"],
  'chapter-6#6': ['MARISOL', "“Repeated reports. He "],
  'chapter-6#7': ['LUZ', "“And decided the probl"],
  'chapter-6#9': ['MARISOL', "“Packet received. They"],
  'chapter-6#12': ['MARISOL', "“From the drawing?”"],
  'chapter-6#13': ['LUZ', "“Everybody stays on th"],
  'chapter-6#15': ['MARISOL', "“Roberto. Look at me.”"],
  'chapter-6#16': ['COUSIN', "“I used to say that.”"],
  'chapter-6#17': ['MARISOL', "“To who?”"],
  'chapter-6#18': ['COUSIN', "“People who didn't wan"],
  'chapter-6#19': ['COUSIN', "“I never told anybody "],
  'chapter-6#20': ['MARISOL', "“It doesn't get to ask"],
  'chapter-6#21': ['LUZ', "“We don't know what it"],
  'chapter-6#24': ['MARISOL', "“Do you want a questio"],
  'chapter-6#25': ['COUSIN', "“Quiet. Just for a sec"],
  'chapter-6#26': ['COUSIN', "“I left Virginia becau"],
  'chapter-6#27': ['MARISOL', "“You don't have to mak"],
  'chapter-6#28': ['COUSIN', "“That's a terrible bus"],
  'chapter-6#29': ['MARISOL', "“I'm not a customer.”"],
  'chapter-6#31': ['MARISOL', "“And I'm not somebody "],
  'chapter-6#32': ['COUSIN', "“I was scared.”"],
  'chapter-6#33': ['MARISOL', "“I noticed.”"],
  'chapter-6#34': ['COUSIN', "“I prefer mysterious a"],
  'chapter-6#35': ['MARISOL', "“You can be all three."],
  'chapter-6#36': ['COUSIN', "“This the part where y"],
  'chapter-6#37': ['MARISOL', "“No.”"],
  'chapter-6#38': ['MARISOL', "“Your hands could use "],
  'chapter-6#39': ['COUSIN', "“You offering me a gam"],
  'chapter-6#40': ['MARISOL', "“I'm offering to stay."],
  'chapter-6#41': ['COUSIN', "“I'm back.”"],
  'chapter-6#42': ['MARISOL', "“You didn't have to go"],
  'chapter-6#43': ['MARISOL', "“Count them.”"],
  'chapter-6#44': ['COUSIN', "“Cruel woman.”"],
  'chapter-6#45': ['MARISOL', "“You like me.”"],
  'chapter-6#46': ['COUSIN', "“Very inconveniently.”"],
  'chapter-6#47': ['MARISOL', "“We can leave it there"],
  'chapter-6#49': ['LUZ', "“My team stays with th"],
  'chapter-6#50': ['MARISOL', "“He already tried.”"],
  'chapter-6#51': ['COUSIN', "“Let's give him an aud"],
  'chapter-6#52': ['COUSIN, softly', "“We heard you.”"],
  'chapter-7#1': ['VALE', "“I expected you to be "],
  'chapter-7#2': ['MARISOL', "“You expected me to si"],
  'chapter-7#3': ['VALE', "“I expected loyalty.”"],
  'chapter-7#4': ['MARISOL', "“You used my name.”"],
  'chapter-7#5': ['VALE', "“Because people trust "],
  'chapter-7#6': ['MARISOL', "“You knew exactly what"],
  'chapter-7#7': ['VALE', "“Of course I did. I ha"],
  'chapter-7#8': ['COUSIN', "“You mean the people w"],
  'chapter-7#9': ['VALE', "“Water moves. Land cha"],
  'chapter-7#10': ['MARISOL', "“And if the adults say"],
  'chapter-7#11': ['VALE', "“Then somebody more pr"],
  'chapter-7#12': ['COUSIN', "“She's speaking.”"],
  'chapter-7#13': ['MARISOL', "“The source records ar"],
  'chapter-7#14': ['VALE', "“You have no idea what"],
  'chapter-7#15': ['COUSIN', "“You heard it too.”"],
  'chapter-7#16': ['VALE', "“It repeats things. Th"],
  'chapter-7#17': ['MARISOL', "“And your answer was t"],
  'chapter-7#18': ['VALE', "“My answer was to make"],
  'chapter-7#19': ['COUSIN', "“That's your whole pro"],
  'chapter-7#20': ['VALE', "“Our exhibition player"],
  'chapter-7#21': ['MARISOL', "“We can discuss it her"],
  'chapter-7#22': ['VALE', "“Let's not make a scen"],
  'chapter-7#23': ['COUSIN', "“Fuck THAT. We playing"],
  'chapter-7#24': ['RAFA', "“The guests were promi"],
  'chapter-7#25': ['COUSIN', "“¡Dominó! No more tile"],
  'chapter-7#26': ['MARISOL', "“Still plenty to discu"],
  'chapter-7#27': ['VALE', "“You see? In the end—”"],
  'chapter-7#28': ['MARISOL', "“You won a hand, Tomás"],
  'chapter-7#30': ['MARISOL', "“For once.”"],
  'chapter-7#32': ['VALE', "“These are internal op"],
  'chapter-7#33': ['MARISOL', "“Then you shouldn't ha"],
  'chapter-7#35': ['VALE', "“You'll regret making "],
  'chapter-7#36': ['COUSIN', "“You made an enemy whe"],
  'chapter-7#37': ['COUSIN', "“You okay?”"],
  'chapter-7#38': ['MARISOL', "“Not completely.”"],
  'chapter-7#39': ['COUSIN', "“Okay. We can work wit"],
  'chapter-7#40': ['RAFA', "“I'd like to say I alw"],
  'chapter-7#41': ['MARISOL', "“Did you?”"],
  'chapter-7#42': ['RAFA', "“I knew enough to ask "],
  'chapter-7#43': ['COUSIN', "“You showed up when it"],
  'chapter-7#44': ['RAFA', "“I'm showing up earlie"],
  'chapter-7#48': ['COUSIN', "“I know a place with t"],
  'chapter-7#49': ['MARISOL', "“Good company?”"],
  'chapter-7#50': ['COUSIN', "“Excellent references."],
  'epilogue#1': ['MARISOL', "“Could be another terr"],
  'epilogue#2': ['COUSIN', "“Office hours are over"],
  'epilogue#3': ['MARISOL', "“I thought you didn't "],
  'epilogue#4': ['COUSIN', "“New management.”"],
  'epilogue#5': ['MARISOL', "“You ever think about "],
  'epilogue#6': ['COUSIN', "“Working out. Writing "],
  'epilogue#7': ['MARISOL', "“I said what you want."],
  'epilogue#8': ['COUSIN', "“More evenings like th"],
  'epilogue#9': ['MARISOL', "“You could've asked.”"],
  'epilogue#10': ['COUSIN', "“I'm asking.”"],
  'epilogue#11': ['MARISOL', "“Then yes.”"],
  'epilogue#12': ['COUSIN', "“If that's Rafa, I'm c"],
  'epilogue#13': ['MARISOL', "“Is it asking again?”"],
  'epilogue#14': ['COUSIN', "“I think it knows we h"],
  'epilogue#15': ['MARISOL', "“You don't have to ans"],
  'epilogue#16': ['COUSIN', "“Table's closed.”"],
  'epilogue#17': ['COUSIN', "“Tomorrow? Fuck it. We"],
};

const PORTRAITS = new Set(['COUSIN', 'COUSIN, softly', 'MARISOL', 'VALE', 'LUZ', 'RAFA']);

describe('dialogue expressions', () => {
  it('every tagged line is pinned to its speaker and opening text', () => {
    const tagged = Object.entries(LINES).flatMap(([id, t]) => Object.keys(t).map((n) => `${id}#${n}`));
    expect(tagged.sort()).toEqual(Object.keys(ANCHORS).sort());
    for (const s of scenes) {
      const lines = linesOf(s);
      for (const n of Object.keys(LINES[s.id] ?? {}).map(Number)) {
        const [speaker, at] = ANCHORS[`${s.id}#${n}`]!;
        expect(lines[n - 1]?.speaker, `${s.id}#${n}`).toBe(speaker);
        expect(lines[n - 1]?.text?.startsWith(at), `${s.id}#${n}`).toBe(true);
        // Only characters with portraits are tagged; narration never shows a figure.
        expect(PORTRAITS.has(speaker), `${s.id}#${n} ${speaker}`).toBe(true);
      }
    }
  });

  it('runtime line numbers match the script order, for scene blocks and outcome-insert lines alike', () => {
    for (const s of scenes) {
      const num = lineNumbers(s);
      const lines = linesOf(s);
      const insertKeys = s.blocks.filter((b) => b.kind === 'insert').flatMap((b) => insertLines(b).filter((x) => x.kind === 'line').map((x) => `${x.speaker}|${x.text}`));
      expect(new Set(insertKeys).size, `${s.id}: insert lines must be unique`).toBe(insertKeys.length);
      // Scene blocks by identity; insert lines as the player re-creates them.
      s.blocks.filter((b) => b.kind === 'line').forEach((b) => expect(num(b)).toBe(lines.indexOf(b) + 1));
      for (const b of s.blocks.filter((x) => x.kind === 'insert')) for (const x of insertLines(b).filter((y) => y.kind === 'line')) expect(num(x)).toBe(lines.findIndex((l) => l.speaker === x.speaker && l.text === x.text) + 1);
    }
  });

  it('every expression resolves to a verified frame or the neutral fallback', () => {
    const all: Expression[] = ['neutral', 'teasing', 'concern', 'firmness', 'vulnerability', 'affection', 'menace', 'fear', 'amusement', 'surprise', 'suspicion', 'pride', 'wistful', 'thinking', 'explaining', 'delight', 'charm'];
    const moods = ['neutral', 'smirk', 'thinking', 'explaining', 'laughing', 'surprised', 'delighted', 'pumped'];
    for (const e of all) expect(moods).toContain(robertoMood(e));
    for (const who of ['vale', 'luz', 'marisol', 'rafa'] as const) {
      const ids = castJson.cast.find((c) => c.who === who)!.frames.map((f) => f.id);
      expect(FRAMES[who].neutral).toBe('e1');
      for (const e of all) expect(ids).toContain(castFrameFor(who, e));
      // Missing expressions fall back to the composed default, never a guess.
      for (const e of all) if (!FRAMES[who][e]) expect(castFrameFor(who, e)).toBe('e1');
    }
  });

  it('every cast frame is used and each character gets real variety (no random choices: same line, same face)', () => {
    const used: Record<string, Set<string>> = { VALE: new Set(), LUZ: new Set(), MARISOL: new Set(), RAFA: new Set() };
    const who = { VALE: 'vale', LUZ: 'luz', MARISOL: 'marisol', RAFA: 'rafa' } as const;
    for (const [id, [speaker]] of Object.entries(ANCHORS)) {
      if (!(speaker in used)) continue;
      const [scene, n] = id.split('#') as [string, string];
      used[speaker]!.add(castFrameFor(who[speaker as keyof typeof who], LINES[scene]![Number(n)]!));
    }
    for (const [s, set] of Object.entries(used)) expect(set.size, `${s}: frames used ${[...set].join(',')}`).toBeGreaterThanOrEqual(6);
    // Determinism: the mapping is plain data.
    expect(castFrameFor('vale', 'menace')).toBe(castFrameFor('vale', 'menace'));
  });

  it('representative emotional beats get the intended faces', () => {
    const f = (scene: string, n: number) => LINES[scene]![n]!;
    expect(castFrameFor('vale', f('chapter-3', 34))).toBe('e6'); // "I've read enough about your old profession…" [His smile is gone.]
    expect(castFrameFor('vale', f('chapter-7', 16))).toBe('e7'); // "It repeats things…" [cannot hide his fear]
    expect(castFrameFor('marisol', f('chapter-1', 17))).toBe('e5'); // suspended this morning
    expect(castFrameFor('marisol', f('chapter-6', 40))).toBe('e6'); // "I'm offering to stay."
    expect(castFrameFor('rafa', f('chapter-1', 42))).toBe('e2'); // "See? Relaxing helps."
    expect(castFrameFor('luz', f('chapter-5', 10))).toBe('e5'); // dreams since the water started dropping
    expect(robertoMood(f('chapter-6', 32))).toBe('thinking'); // "I was scared." (no grin)
    expect(robertoMood(f('chapter-1', 36))).toBe('pumped'); // "Fuck THAT, we playing DOMINOES!"
  });
});
