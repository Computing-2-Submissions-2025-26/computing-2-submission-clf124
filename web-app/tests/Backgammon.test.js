/*global describe, it*/
import Backgammon from "../Backgammon.js";
import R from "../ramda.js";

// Renders a compact summary of a game state for error messages.
const display_game = function (game) {
    return JSON.stringify({
        player: game.currentPlayer,
        dice: game.dice,
        bar: game.bar,
        borneOff: game.borneOff
    });
};

/**
 * Returns if the game state is valid.
 * A state is valid if all the following are true:
 * - There are exactly 24 points.
 * - Each point has a valid owner (null, 0, or 1) and non-negative count.
 * - Each player has exactly 15 pieces (board + bar + borne-off).
 * - No point holds pieces belonging to both players simultaneously.
 * - The phase is either "moving" or "gameover".
 * @memberof Backgammon.test
 * @function
 * @param {Backgammon.GameState} game The state to validate.
 * @throws if the state fails any of the above conditions.
 */
const throw_if_invalid = function (game) {
    const state = display_game(game);
    if (!Array.isArray(game.points) || game.points.length !== 24) {
        throw new Error(
            `The board must have exactly 24 points: ${state}`
        );
    }

    const valid_owners = [null, 0, 1];
    game.points.forEach(function (pt, i) {
        if (!valid_owners.includes(pt.owner)) {
            throw new Error(
                `Point ${i} has an invalid owner (${pt.owner}): ${state}`
            );
        }
        if (pt.count < 0 || !Number.isInteger(pt.count)) {
            throw new Error(
                `Point ${i} has an invalid count (${pt.count}): ${state}`
            );
        }
        if (pt.owner === null && pt.count > 0) {
            throw new Error(
                `Point ${i} has pieces but no owner: ${state}`
            );
        }
    });

    [0, 1].forEach(function (player) {
        const on_board = R.pipe(
            R.filter(function (pt) { return pt.owner === player; }),
            R.reduce(function (sum, pt) { return sum + pt.count; }, 0)
        )(game.points);
        const total = on_board + game.bar[player] + game.borneOff[player];
        if (total !== Backgammon.checker_count) {
            const exp = Backgammon.checker_count;
            const pieces_err = `expected ${exp}: ${state}`;
            throw new Error(
                `Player ${player} has ${total} pieces, ${pieces_err}`
            );
        }
    });

    if (game.phase !== "moving" && game.phase !== "gameover") {
        throw new Error(`Unrecognised phase: ${game.phase}`);
    }
};

describe("New game", function () {
    it("A new game starts in a valid state", function () {
        throw_if_invalid(Backgammon.new_game(() => 0.5));
    });

    it("A new game is not ended and has no winner", function () {
        const game = Backgammon.new_game(() => 0.5);
        const state = display_game(game);
        if (Backgammon.is_ended(game)) {
            throw new Error(
                `A freshly started game should not be ended: ${state}`
            );
        }
        if (Backgammon.winner(game) !== null) {
            throw new Error(
                `A freshly started game should have no winner: ${state}`
            );
        }
    });

    it("A new game has dice ready and player 0 to move", function () {
        const game = Backgammon.new_game(() => 0.5);
        if (game.currentPlayer !== 0) {
            throw new Error(
                `Player 0 should move first, got player: ${game.currentPlayer}`
            );
        }
        if (game.dice.length !== 2 && game.dice.length !== 4) {
            throw new Error(
                `New game should start with 2 or 4 dice, got: ${game.dice}`
            );
        }
        const all_valid = game.dice.every(
            function (d) { return Number.isInteger(d) && d >= 1 && d <= 6; }
        );
        if (!all_valid) {
            throw new Error(`Dice values out of range 1-6: ${game.dice}`);
        }
    });
});

describe("Dice", function () {
    it("Rolling doubles produces four identical values", function () {
        // rand always returns 0 so die = 1, giving doubles
        const result = Backgammon.roll_dice(() => 0);
        if (result.length !== 4 || !result.every((d) => d === result[0])) {
            throw new Error(
                `Expected four identical values for doubles, got: ${result}`
            );
        }
    });

    it("Non-doubles produce exactly two different values", function () {
        // First call gives die 1, second call gives die 2
        let call = 0;
        const result = Backgammon.roll_dice(function () {
            const c = call;
            call += 1;
            return (c === 0 ? 0 : 1 / 6);
        });
        if (result.length !== 2) {
            throw new Error(
                `Expected exactly two values for non-doubles, got: ${result}`
            );
        }
    });
});

describe("Legal moves", function () {
    it(
        `Given a player with pieces on the bar,
when legal moves are requested,
then only bar-entry moves are returned.`,
        function () {
            // Player 0 stuck on bar; only bar entry moves should appear
            const game = Object.assign(
                Backgammon.new_game(() => 0.5),
                {
                    points: Backgammon.initial_board.map(
                        function (p) { return Object.assign({}, p); }
                    ),
                    bar: [1, 0],
                    dice: [3],
                    currentPlayer: 0,
                    phase: "moving",
                }
            );
            const moves = Backgammon.legal_moves(game);
            const all_from_bar = moves.every((m) => m.from === "bar");
            if (!all_from_bar) {
                const got = JSON.stringify(moves);
                const bar_end = `should start from 'bar'. Got: ${got}`;
                throw new Error(
                    `With a piece on the bar, all moves ${bar_end}`
                );
            }
        }
    );

    it(
        `Given a game in progress,
when every legal move is applied,
then each resulting state is valid and has one fewer die remaining.`,
        function () {
            let alt = 0;
            const starting_games = [
                Backgammon.new_game(() => 1 / 6),
                Backgammon.new_game(() => 0),
                Backgammon.new_game(function () {
                    const mod = alt % 2;
                    alt += 1;
                    return (mod === 0 ? 0 : 2 / 6);
                })
            ];

            starting_games.forEach(function (game) {
                const moves = Backgammon.legal_moves(game);
                if (moves.length === 0) { return; } // fine for some rolls

                moves.forEach(function (move) {
                    const next = Backgammon.make_move(move, game);
                    throw_if_invalid(next);
                    if (next.dice.length !== game.dice.length - 1) {
                        const b = game.dice;
                        const a = next.dice;
                        const m = JSON.stringify(move);
                        const msg = `Before: ${b}, after: ${a}. Move: ${m}`;
                        throw new Error(`Expected one fewer die. ${msg}`);
                    }
                });
            });
        }
    );

    it("No legal moves are returned when the dice are empty", function () {
        const game = Object.assign(
            Backgammon.new_game(() => 0.5),
            {dice: []}
        );
        const moves = Backgammon.legal_moves(game);
        const got = JSON.stringify(moves);
        if (moves.length !== 0) {
            throw new Error(
                `Expected no moves with empty dice, got: ${got}`
            );
        }
    });
});

describe("Making moves", function () {
    it("Hitting an opponent blot sends their piece to the bar", function () {
        // Minimal board: P0 has 2 at index 23, P1 has a lone blot at 20
        const pts = R.map(
            function () { return {owner: null, count: 0}; },
            R.range(0, 24)
        );
        pts[23] = {owner: 0, count: 2};   // P0: 2 pieces
        pts[20] = {owner: 1, count: 1};   // P1: lone blot (target)
        pts[0]  = {owner: 1, count: 14};  // P1: remaining 14 pieces
        const game = Object.assign(
            Backgammon.new_game(() => 0.5),
            {
                points: pts,
                bar: [0, 0],
                borneOff: [13, 0],  // P0 has 13 borne off; total = 15
                dice: [3],
                currentPlayer: 0,
                phase: "moving",
            }
        );
        const next = Backgammon.make_move({from: 23, to: 20}, game);
        throw_if_invalid(next);
        if (next.bar[1] !== 1) {
            const b = next.bar[1];
            throw new Error(
                `Hitting a blot should send P1 to the bar. bar[1] = ${b}`
            );
        }
        if (next.points[20].owner !== 0 || next.points[20].count !== 1) {
            const pt_20 = JSON.stringify(next.points[20]);
            throw new Error(
                `The hitting piece should now occupy the point: ${pt_20}`
            );
        }
    });

    it(
        `Given a piece on the bar,
when a bar-entry move is applied,
then the piece leaves the bar and lands on the board.`,
        function () {
            // P0 has 1 on bar and 14 at index 23; die 3 enters at index 21
            const pts = R.map(
                function () { return {owner: null, count: 0}; },
                R.range(0, 24)
            );
            pts[23] = {owner: 0, count: 14};
            pts[0]  = {owner: 1, count: 15};
            const game = Object.assign(
                Backgammon.new_game(() => 0.5),
                {
                    points: pts,
                    bar: [1, 0],
                    borneOff: [0, 0],
                    dice: [3],
                    currentPlayer: 0,
                    phase: "moving",
                }
            );
            const next = Backgammon.make_move({from: "bar", to: 21}, game);
            throw_if_invalid(next);
            if (next.bar[0] !== 0) {
                throw new Error(
                    `Bar count should be 0 after entry, got: ${next.bar[0]}`
                );
            }
            if (next.points[21].owner !== 0 || next.points[21].count !== 1) {
                const pt_21 = JSON.stringify(next.points[21]);
                throw new Error(
                    `Piece should be at index 21 after bar entry: ${pt_21}`
                );
            }
        }
    );

    it(
        "end_turn switches the active player and provides fresh dice",
        function () {
            const game  = Backgammon.new_game(() => 0.5);
            const after = Backgammon.end_turn(() => 0, game);
            throw_if_invalid(after);
            if (after.currentPlayer === game.currentPlayer) {
                const cp = game.currentPlayer;
                throw new Error(
                    `end_turn should switch from player ${cp} but it stayed.`
                );
            }
            if (after.dice.length < 2) {
                throw new Error(
                    `end_turn should roll fresh dice, got: ${after.dice}`
                );
            }
        }
    );
});

describe("Bearing off", function () {
    it(
        "A game where one player has borne off all 15 pieces is ended",
        function () {
            const pts = Backgammon.initial_board.map(
                function (p) { return Object.assign({}, p); }
            );
            const game = Object.assign(
                Backgammon.new_game(() => 0.5),
                {
                    points: pts,
                    borneOff: [15, 0],
                    phase: "gameover",
                    winner: 0,
                }
            );
            const state = display_game(game);
            if (!Backgammon.is_ended(game)) {
                throw new Error(
                    `A game with 15 pieces borne off should be ended: ${state}`
                );
            }
            if (Backgammon.winner(game) !== 0) {
                const winner = Backgammon.winner(game);
                throw new Error(
                    `Player 0 should be the winner, got: ${winner}`
                );
            }
        }
    );

    it(
        `Given all pieces inside the home board,
when a piece is borne off,
the borne-off count increases and the board count decreases.`,
        function () {
            // P0 last piece at index 2; P1 still has all 15 pieces on board
            const pts = R.map(
                function () { return {owner: null, count: 0}; },
                R.range(0, 24)
            );
            pts[2]  = {owner: 0, count: 1};
            pts[23] = {owner: 1, count: 15};
            const game = Object.assign(
                Backgammon.new_game(() => 0.5),
                {
                    points: pts,
                    bar: [0, 0],
                    borneOff: [14, 0],  // P0: 14 borne off + 1 on board = 15
                    dice: [3],
                    currentPlayer: 0,
                    phase: "moving",
                }
            );
            const next = Backgammon.make_move({from: 2, to: "bearoff"}, game);
            throw_if_invalid(next);
            if (next.borneOff[0] !== 15) {
                const off = next.borneOff[0];
                throw new Error(
                    `Expected 15 pieces borne off after last move, got: ${off}`
                );
            }
            if (next.phase !== "gameover") {
                const ph = next.phase;
                throw new Error(
                    `Bearing off the last piece should end game, phase: ${ph}`
                );
            }
        }
    );

    it(
        `Given pieces at two home-board positions,
when the die overshoots the furthest-back piece,
then only the piece with no piece further back may bear off.`,
        function () {
            // P0 has pieces at index 0 (closest to edge) and index 2
            // Die 4 overshoots both; only index 2 can legally bear off
            const pts = R.map(
                function () { return {owner: null, count: 0}; },
                R.range(0, 24)
            );
            pts[0]  = {owner: 0, count: 1};
            pts[2]  = {owner: 0, count: 1};
            pts[23] = {owner: 1, count: 15};
            const game = Object.assign(
                Backgammon.new_game(() => 0.5),
                {
                    points: pts,
                    bar: [0, 0],
                    borneOff: [13, 0],  // P0: 13 off + 2 on board = 15
                    dice: [4],
                    currentPlayer: 0,
                    phase: "moving",
                }
            );
            const moves = Backgammon.legal_moves(game);
            const bear_from_0 = moves.some(
                (m) => m.from === 0 && m.to === "bearoff"
            );
            const bear_from_2 = moves.some(
                (m) => m.from === 2 && m.to === "bearoff"
            );
            if (bear_from_0) {
                throw new Error(
                    "Index 0 should not overshoot when index 2 is further back"
                );
            }
            if (!bear_from_2) {
                throw new Error(
                    "Index 2 should be able to bear off with die 4"
                );
            }
        }
    );
});

describe("Bearing off eligibility", function () {
    it(
        `Given all pieces inside the home board with none on the bar,
when can_bear_off is called,
then it returns true.`,
        function () {
            const pts = R.map(
                function () { return {owner: null, count: 0}; },
                R.range(0, 24)
            );
            pts[0]  = {owner: 0, count: 5};
            pts[1]  = {owner: 0, count: 5};
            pts[2]  = {owner: 0, count: 5};
            pts[23] = {owner: 1, count: 15};
            const game = Object.assign(
                Backgammon.new_game(() => 0.5),
                {
                    points: pts,
                    bar: [0, 0],
                    borneOff: [0, 0],
                    currentPlayer: 0,
                }
            );
            if (!Backgammon.can_bear_off(0, game)) {
                const state = display_game(game);
                throw new Error(
                    `can_bear_off should be true: all in home board. ${state}`
                );
            }
        }
    );

    it(
        `Given a piece waiting on the bar,
when can_bear_off is called,
then it returns false.`,
        function () {
            const game = Object.assign(
                Backgammon.new_game(() => 0.5),
                {bar: [1, 0]}
            );
            if (Backgammon.can_bear_off(0, game)) {
                const state = display_game(game);
                throw new Error(
                    `can_bear_off should be false: piece on the bar. ${state}`
                );
            }
        }
    );
});

describe("Select from", function () {
    it(
        "Selecting the same source twice clears the selection",
        function () {
            const game = Backgammon.new_game(() => 0.5);
            const selected = Backgammon.select_from(5, game);
            if (selected.selectedFrom !== 5) {
                const sf = selected.selectedFrom;
                throw new Error(
                    `selectedFrom should be 5 after first click, got: ${sf}`
                );
            }
            const deselected = Backgammon.select_from(5, selected);
            if (deselected.selectedFrom !== null) {
                const dsf = deselected.selectedFrom;
                throw new Error(
                    `selectedFrom should be null after deselect, got: ${dsf}`
                );
            }
        }
    );
});

describe("Hint", function () {
    it("Hint returns a legal move when moves are available", function () {
        const game = Backgammon.new_game(() => 0.5);
        const h = Backgammon.hint(game);
        if (h === null) {
            throw new Error(
                "Expected a hint move at the start of the game, got null"
            );
        }
        const legal = Backgammon.legal_moves(game);
        const is_legal = legal.some(
            (m) => m.from === h.from && m.to === h.to
        );
        if (!is_legal) {
            const h_str = JSON.stringify(h);
            throw new Error(
                `Hint returned a move not found in legal_moves: ${h_str}`
            );
        }
    });

    it("Hint returns null when no moves are available", function () {
        const game = Object.assign(
            Backgammon.new_game(() => 0.5),
            {dice: []}
        );
        if (Backgammon.hint(game) !== null) {
            throw new Error(
                "Expected hint to return null when dice are empty"
            );
        }
    });
});