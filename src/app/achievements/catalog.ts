/**
 * The achievement catalog: exactly 100 entries, data only.
 *
 * Every entry is earned by an existing mechanic: a play, draw, pass or hand result in the frozen rules,
 * a completed match, a Story chapter, or opening an existing screen or control. Nothing here adds a
 * rule, a currency or a calendar streak.
 *
 * Fields:
 * - **id:** stable, never reused.
 * - **condition:** a counter key (see facts.ts) and a target. `all` means "every one of these counters
 *   at least once".
 * - **how:** the plain-language condition shown to the player (docs/ACHIEVEMENTS.md lists them all).
 * - **badge:** a glyph and a tier (1–3) for the SVG medallion.
 * - **spoiler:** hides the title and text until earned (Story beyond the opening).
 */
export type Category = 'learning' | 'draw' | 'block' | 'partnership' | 'tactical' | 'milestone' | 'story' | 'exploration';
export type Glyph = 'tile' | 'double' | 'boneyard' | 'knock' | 'star' | 'trophy' | 'book' | 'compass' | 'handshake' | 'shield' | 'lock' | 'crown' | 'spark' | 'eye';

export interface AchievementDef {
  readonly id: string;
  readonly title: string;
  readonly desc: string;
  readonly category: Category;
  /** Counter key, or `all` keys that must each be ≥ 1. */
  readonly counter?: string;
  readonly all?: readonly string[];
  readonly target: number;
  readonly how: string;
  readonly badge: readonly [Glyph, 1 | 2 | 3];
  readonly spoiler?: true;
}

export const CATEGORIES: readonly { id: Category; label: string }[] = [
  { id: 'learning', label: 'Learning' },
  { id: 'draw', label: 'Draw' },
  { id: 'block', label: 'Block' },
  { id: 'partnership', label: 'Partnership' },
  { id: 'tactical', label: 'Tactical' },
  { id: 'milestone', label: 'Milestones' },
  { id: 'story', label: 'Story' },
  { id: 'exploration', label: 'Exploration' },
];

type Row = [id: string, title: string, desc: string, counter: string | readonly string[], target: number, how: string, glyph: Glyph, tier?: 1 | 2 | 3, spoiler?: true];

const ROWS: Record<Category, Row[]> = {
  learning: [
    ['learn-first-tile', 'First Bone Down', 'Your first tile on the table.', 'tiles', 1, 'Play a tile in any hand against the computer or in Story.', 'tile'],
    ['learn-first-draw', 'From the Boneyard', 'Pulled a tile when you couldn’t play.', 'draws', 1, 'Draw a tile from the boneyard in a Draw hand.', 'boneyard'],
    ['learn-first-pass', 'Knock Knock', 'Knocked the table and passed.', 'passes', 1, 'Pass when you have no playable tile (Block, Partnership, or Draw with an empty boneyard).', 'knock'],
    ['learn-both-ends', 'Either Way', 'Chose which end a tile goes on.', 'bothEnds', 1, 'Play a tile that fits both open ends.', 'compass'],
    ['learn-open', 'Opening Move', 'Led the first tile of a hand.', 'opens', 1, 'Play the first tile of a hand.', 'tile', 2],
    ['learn-double', 'Crosswise', 'Laid a double across the line.', 'doubles', 1, 'Play any double.', 'double'],
    ['learn-hand', 'Hand Played', 'Saw a hand through to the end.', 'hands', 1, 'Finish a hand (any result).', 'tile', 3],
    ['learn-hand-won', 'On the Board', 'Your side took a hand.', 'handsWon', 1, 'Win a hand.', 'star'],
    ['learn-match', 'Full Match', 'Played a match to the target.', 'matches', 1, 'Finish a Quick Play match against the computer.', 'shield'],
    ['learn-match-won', 'Table Captain', 'Won a match.', 'matchesWon', 1, 'Win a Quick Play match against the computer.', 'trophy'],
  ],
  draw: [
    ['draw-win-easy', 'Draw: Easy Win', 'Won a Draw match on Easy.', 'draw2.win.easy', 1, 'Win a Draw match against the computer on Easy.', 'trophy', 1],
    ['draw-win-normal', 'Draw: Normal Win', 'Won a Draw match on Normal.', 'draw2.win.normal', 1, 'Win a Draw match against the computer on Normal.', 'trophy', 2],
    ['draw-win-hard', 'Draw: Hard Win', 'Won a Draw match on Hard.', 'draw2.win.hard', 1, 'Win a Draw match against the computer on Hard.', 'trophy', 3],
    ['draw-domino', 'Dominó!', 'Went out first in a Draw hand.', 'draw2.domino', 1, 'Play your last tile to win a Draw hand.', 'star'],
    ['draw-no-draw', 'Never Touched the Pile', 'Won a Draw hand without drawing.', 'draw2.noDrawWin', 1, 'Win a Draw hand in which you never drew a tile.', 'boneyard', 1],
    ['draw-deep-dig', 'Deep Dig', 'Drew five or more and still won.', 'draw2.drew5Win', 1, 'Draw at least 5 tiles in one Draw hand and win that hand.', 'boneyard', 2],
    ['draw-last-tile', 'Last One in the Yard', 'Took the boneyard’s final tile.', 'draw2.lastTile', 1, 'Draw the last tile left in the boneyard.', 'boneyard', 3],
    ['draw-dry-win', 'Dry Yard', 'Won after the boneyard ran out.', 'draw2.dryWin', 1, 'Win a Draw hand after the boneyard was emptied during it.', 'shield'],
    ['draw-fifty', 'Fifty in One', 'A Draw hand worth 50 or more.', 'draw2.hand50', 1, 'Win a Draw hand worth at least 50 points.', 'spark'],
    ['draw-tranque', 'Draw Tranque', 'Won a blocked Draw hand.', 'draw2.tranque', 1, 'Win a Draw hand that ends blocked (lower pip count).', 'lock'],
    ['draw-200', 'Long Game: Draw', 'Won a Draw match to 200.', 'draw2.win200', 1, 'Win a Draw match against the computer with the target set to 200.', 'crown', 1],
    ['draw-shutout', 'Shutout: Draw', 'Won a Draw match; they scored nothing.', 'draw2.shutout', 1, 'Win a Draw match in which the computer scores 0.', 'shield', 3],
    ['draw-comeback', 'Comeback: Draw', 'Came back from 40 down.', 'draw2.comeback', 1, 'Win a Draw match after trailing by 40 or more points (whole match played in one sitting).', 'spark', 2],
    ['draw-ten-hands', 'Draw Regular', 'Ten Draw hands won.', 'draw2.handsWon', 10, 'Win 10 Draw hands in total.', 'star', 2],
  ],
  block: [
    ['block-win-easy', 'Block: Easy Win', 'Won a Block match on Easy.', 'block2.win.easy', 1, 'Win a Block match against the computer on Easy.', 'trophy', 1],
    ['block-win-normal', 'Block: Normal Win', 'Won a Block match on Normal.', 'block2.win.normal', 1, 'Win a Block match against the computer on Normal.', 'trophy', 2],
    ['block-win-hard', 'Block: Hard Win', 'Won a Block match on Hard.', 'block2.win.hard', 1, 'Win a Block match against the computer on Hard.', 'trophy', 3],
    ['block-domino', 'Out Clean', 'Went out first in a Block hand.', 'block2.domino', 1, 'Play your last tile to win a Block hand.', 'star'],
    ['block-tranque', '¡Tranque!', 'Won a blocked Block hand.', 'block2.tranque', 1, 'Win a Block hand that ends blocked (lower pip count).', 'lock'],
    ['block-no-pass', 'No Knocks', 'Won a Block hand without passing.', 'block2.noPassWin', 1, 'Win a Block hand in which you never passed.', 'knock', 1],
    ['block-forced3', 'Squeeze Play', 'Made the other side pass three times.', 'block2.forced3', 1, 'In one Block hand, make your opponent pass 3 times right after your play.', 'knock', 2],
    ['block-forty', 'Forty in One', 'A Block hand worth 40 or more.', 'block2.hand40', 1, 'Win a Block hand worth at least 40 points.', 'spark'],
    ['block-200', 'Long Game: Block', 'Won a Block match to 200.', 'block2.win200', 1, 'Win a Block match against the computer with the target set to 200.', 'crown', 1],
    ['block-shutout', 'Shutout: Block', 'Won a Block match; they scored nothing.', 'block2.shutout', 1, 'Win a Block match in which the computer scores 0.', 'shield', 3],
    ['block-comeback', 'Comeback: Block', 'Came back from 40 down.', 'block2.comeback', 1, 'Win a Block match after trailing by 40 or more points (whole match played in one sitting).', 'spark', 2],
    ['block-ten-hands', 'Block Regular', 'Ten Block hands won.', 'block2.handsWon', 10, 'Win 10 Block hands in total.', 'star', 2],
  ],
  partnership: [
    ['p4-win-easy', 'Partners: Easy Win', 'Won Partnership with Luz on Easy.', 'partnership4.win.easy', 1, 'Win a Partnership match (you and Luz against the computers) on Easy.', 'handshake', 1],
    ['p4-win-normal', 'Partners: Normal Win', 'Won Partnership with Luz on Normal.', 'partnership4.win.normal', 1, 'Win a Partnership match (you and Luz against the computers) on Normal.', 'handshake', 2],
    ['p4-win-hard', 'Partners: Hard Win', 'Won Partnership with Luz on Hard.', 'partnership4.win.hard', 1, 'Win a Partnership match (you and Luz against the computers) on Hard.', 'handshake', 3],
    ['p4-self-out', 'Carried the Team', 'You went out to win a Partnership hand.', 'p4.selfOut', 1, 'Play your last tile first in a Partnership hand.', 'star'],
    ['p4-partner-out', 'Set Up the Finish', 'Your partner went out for the team.', 'p4.partnerOut', 1, 'Win a Partnership hand when your partner plays out first.', 'handshake'],
    ['p4-tranque', 'Team Tranque', 'Your team won a blocked hand.', 'partnership4.tranque', 1, 'Win a Partnership hand that ends blocked (lower team pip count).', 'lock'],
    ['p4-pass-win', 'Knocked, Not Out', 'Passed, and your team still won.', 'p4.passWin', 1, 'Win a Partnership hand in which you passed at least once.', 'knock'],
    ['p4-both-pass', 'Both Locked Out', 'Both opponents passed in one round.', 'p4.bothPass', 1, 'Between two of your turns, make both opponents pass.', 'knock', 3],
    ['p4-shutout', 'Shutout: Partnership', 'Won Partnership; they scored nothing.', 'partnership4.shutout', 1, 'Win a Partnership match in which the other team scores 0.', 'shield', 3],
    ['p4-comeback', 'Comeback: Partnership', 'Came back from 50 down.', 'partnership4.comeback', 1, 'Win a Partnership match after trailing by 50 or more points (whole match played in one sitting).', 'spark', 2],
    ['p4-sixty', 'Sixty in One', 'A Partnership hand worth 60 or more.', 'p4.hand60', 1, 'Win a Partnership hand worth at least 60 points.', 'spark'],
    ['p4-ten-hands', 'Partnership Regular', 'Ten Partnership hands won.', 'partnership4.handsWon', 10, 'Win 10 Partnership hands in total.', 'star', 2],
    ['p4-local-partners', 'Side by Side', 'Two players as partners beat the computers.', 'p4.localWin', 1, 'With two players on one device sitting across as partners, win a Partnership match.', 'handshake', 2],
    ['p4-lead-66', 'The Big Double', 'Led the double six in Partnership.', 'p4.open66', 1, 'In a Partnership hand, lead with the double six.', 'double', 3],
  ],
  tactical: [
    ['tac-capicua', '¡Capicúa!', 'Went out with a tile that fit both ends.', 'capicua', 1, 'Play your last tile when it would fit either open end.', 'compass', 3],
    ['tac-out-double', 'Double Out', 'Went out on a double.', 'outDouble', 1, 'Play a double as your last tile.', 'double', 2],
    ['tac-four-doubles', 'Double Trouble', 'Four doubles in one hand.', 'doubles4', 1, 'Play 4 doubles yourself in one hand.', 'double', 3],
    ['tac-same-ends', 'Mirror Ends', 'Left both ends on the same number.', 'sameEnds', 1, 'After your play (not the lead), both open ends show the same number.', 'compass', 1],
    ['tac-self-block', 'Shut the Door', 'Your tile blocked the game, and your side won it.', 'selfBlockWin', 1, 'Make the play that blocks the hand, then win the tranque.', 'lock', 2],
    ['tac-low-tranque', 'Light Hand', 'Won a tranque holding 5 pips or fewer.', 'lowTranque', 1, 'Win a blocked hand while holding 5 or fewer pips yourself.', 'lock', 3],
    ['tac-fast-out', 'In a Hurry', 'Went out while every opponent still held 4+ tiles.', 'fastOut', 1, 'Go out while each opponent still holds at least 4 tiles.', 'spark', 3],
    ['tac-66-win', 'Big Double, Big Finish', 'Led the double six and won the hand.', 'open66Win', 1, 'Lead with the double six and win that hand.', 'double', 1],
    ['tac-win-2pass', 'Second Wind', 'Passed twice and still won.', 'win2Pass', 1, 'Win a hand in which you passed at least twice.', 'knock', 2],
    ['tac-forced5', 'Lockdown', 'Made opponents pass five times in a hand.', 'forced5', 1, 'In one hand, make the next player pass 5 times right after your play.', 'knock', 3],
    ['tac-close-suit', 'Closed the Number', 'Played the last tile of a number.', 'closeSuit', 1, 'Make the play that puts all seven tiles of one number on the table.', 'eye', 2],
    ['tac-clean-win', 'Clean Hand', 'Went out without drawing or passing.', 'cleanWin', 1, 'Play your last tile first, having never drawn or passed in that hand.', 'star', 3],
    ['tac-heavy', 'Shed the Heavies', 'Played the 6|6 and the 6|5 in one hand.', 'heavy', 1, 'Play both the double six and the 6|5 yourself in one hand.', 'double', 1],
    ['tac-double-run', 'Back-to-Back Doubles', 'Two doubles on consecutive turns.', 'doubleRun', 1, 'Play a double on two of your turns in a row.', 'double', 2],
    ['tac-more-tiles', 'Fewer Pips, More Tiles', 'Won a tranque holding more tiles.', 'tranqueMoreTiles', 1, 'Win a blocked hand while holding more tiles than any opponent.', 'eye', 3],
    ['tac-close-call', 'Close Call', 'Went out with an opponent on one tile.', 'closeCall', 1, 'Go out while an opponent is down to a single tile.', 'spark', 1],
  ],
  milestone: [
    ['ms-matches-5', 'Five Matches Won', 'Five matches won against the computer.', 'matchesWon', 5, 'Win 5 Quick Play matches against the computer.', 'trophy', 1],
    ['ms-matches-15', 'Fifteen Matches Won', 'Fifteen matches won against the computer.', 'matchesWon', 15, 'Win 15 Quick Play matches against the computer.', 'trophy', 2],
    ['ms-finished-10', 'Ten Matches Played', 'Ten matches seen to the end.', 'matches', 10, 'Finish 10 Quick Play matches against the computer (win or lose).', 'shield', 2],
    ['ms-hands-25', 'Twenty-Five Hands', 'Twenty-five hands won.', 'handsWon', 25, 'Win 25 hands in total.', 'star', 1],
    ['ms-hands-50', 'Fifty Hands', 'Fifty hands won.', 'handsWon', 50, 'Win 50 hands in total.', 'star', 3],
    ['ms-points-500', '500 Points', 'Five hundred points scored.', 'points', 500, 'Score 500 points in total from hands your side wins.', 'crown', 1],
    ['ms-points-2000', '2,000 Points', 'Two thousand points scored.', 'points', 2000, 'Score 2,000 points in total from hands your side wins.', 'crown', 3],
    ['ms-tiles-250', '250 Tiles', 'Two hundred fifty tiles played.', 'tiles', 250, 'Play 250 tiles in total.', 'tile', 2],
    ['ms-dominoes-20', 'Twenty Dominós', 'Went out first twenty times.', 'dominoes', 20, 'Go out first (dominó) 20 times yourself.', 'star', 2],
    ['ms-tranques-10', 'Ten Tranques', 'Ten blocked hands won.', 'tranques', 10, 'Win 10 blocked hands in total.', 'lock', 2],
    ['ms-doubles-50', 'Fifty Doubles', 'Fifty doubles played.', 'doubles', 50, 'Play 50 doubles in total.', 'double', 2],
    ['ms-all-modes', 'Three Tables', 'A match won in every mode.', ['modeWon.draw2', 'modeWon.block2', 'modeWon.partnership4'], 3, 'Win at least one Quick Play match against the computer in Draw, Block and Partnership.', 'crown', 2],
  ],
  story: [
    ['story-prologue', 'No Rest', 'Took the case.', 'story.prologue', 1, 'Finish the Story prologue.', 'book', 1],
    ['story-ch1', 'Chapter 1 Closed', 'Retirement Is a Scheduling Error.', 'story.chapter-1', 1, 'Finish Chapter 1 of the Story.', 'book', 1],
    ['story-ch2', 'Chapter 2 Closed', 'Authorized Personnel, Questionable Decisions.', 'story.chapter-2', 1, 'Finish Chapter 2 of the Story.', 'book', 1, true],
    ['story-ch3', 'Chapter 3 Closed', 'All-Inclusive, Everything Has a Price.', 'story.chapter-3', 1, 'Finish Chapter 3 of the Story.', 'book', 2, true],
    ['story-ch4', 'Chapter 4 Closed', 'What the Water Remembers.', 'story.chapter-4', 1, 'Finish Chapter 4 of the Story.', 'book', 2, true],
    ['story-ch5', 'Chapter 5 Closed', 'A Welcome Is Not a Deed.', 'story.chapter-5', 1, 'Finish Chapter 5 of the Story.', 'book', 2, true],
    ['story-ch6', 'Chapter 6 Closed', 'Leave a Light On.', 'story.chapter-6', 1, 'Finish Chapter 6 of the Story.', 'book', 3, true],
    ['story-ch7', 'Chapter 7 Closed', 'The Price of Everything.', 'story.chapter-7', 1, 'Finish Chapter 7 of the Story.', 'book', 3, true],
    ['story-epilogue', 'Case Closed', 'Saw NO REST FOR COUSIN through to the end.', 'story.epilogue', 1, 'Finish the Story epilogue.', 'crown', 3, true],
    ['story-wins-3', 'On a Roll', 'Won three chapter hands in one case.', 'story.wins3', 1, 'Win 3 chapter hands within one case (replays don’t count).', 'star', 1],
    ['story-wins-7', 'Seven for Seven', 'Won every chapter hand in one case.', 'story.wins7', 1, 'Win all 7 chapter hands within one case, from the prologue on (replays don’t count).', 'star', 3],
    ['story-partner', 'Marisol’s Partner', 'Won a Story Partnership hand.', 'story.partnerWin', 1, 'Win a Partnership chapter hand (Chapter 3 or 7).', 'handshake', 2],
    ['story-loss', 'The Case Goes On', 'Lost a chapter hand and kept going.', 'story.loss', 1, 'Lose a chapter hand: the case still moves forward.', 'knock', 1],
    ['story-no-skip', 'Every Word', 'Finished the case without skipping a scene.', 'story.noSkip', 1, 'Finish the epilogue of a case started from the prologue without using Skip scene.', 'eye', 3, true],
  ],
  exploration: [
    ['ex-rules', 'House Rules', 'Read How to Play.', 'explore.rules', 1, 'Open How to Play from the menu.', 'book', 1],
    ['ex-stats', 'Keeping Score', 'Checked your statistics.', 'explore.stats', 1, 'Open Statistics from the menu.', 'eye', 1],
    ['ex-settings', 'Your Table, Your Way', 'Changed a setting.', 'explore.settings', 1, 'Change any setting (menu or pause sheet).', 'compass', 1],
    ['ex-sort', 'Sorted', 'Re-sorted your hand.', 'explore.sort', 1, 'Use the Sort button at the table.', 'tile', 1],
    ['ex-zoom', 'Closer Look', 'Zoomed the board.', 'explore.zoom', 1, 'Use the + or − board zoom at the table.', 'eye', 2],
    ['ex-transcript', 'On the Record', 'Opened a scene transcript.', 'explore.transcript', 1, 'Open the transcript during a Story scene.', 'book', 2],
    ['ex-local', 'Pass the Device', 'Finished a two-player match on one device.', 'local.finished', 1, 'Finish any match with two players sharing one device.', 'handshake', 1],
    ['ex-local-all', 'Shared Table', 'Two-player matches in every mode.', ['local.draw2', 'local.block2', 'local.partnership4'], 3, 'Finish a two-player, one-device match in Draw, Block and Partnership.', 'handshake', 3],
  ],
};

export const ACHIEVEMENTS: readonly AchievementDef[] = (Object.keys(ROWS) as Category[]).flatMap((category) =>
  ROWS[category].map(([id, title, desc, counter, target, how, glyph, tier = 1, spoiler]) => ({
    id,
    title,
    desc,
    category,
    ...(typeof counter === 'string' ? { counter } : { all: counter }),
    target,
    how,
    badge: [glyph, tier] as const,
    ...(spoiler ? { spoiler } : {}),
  })),
);

export const BY_ID: ReadonlyMap<string, AchievementDef> = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Current progress toward an achievement from the counters (capped at the target). */
export function progressOf(a: AchievementDef, counts: Readonly<Record<string, number>>): number {
  const v = a.all ? a.all.filter((k) => (counts[k] ?? 0) > 0).length : (counts[a.counter!] ?? 0);
  return Math.min(a.target, v);
}
