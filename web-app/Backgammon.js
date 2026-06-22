/*jslint*/
import R from "./ramda.js";

/**
 * Backgammon.js - game logic for a standard 2-player game of Backgammon.
 * https://en.wikipedia.org/wiki/Backgammon
 * @namespace Backgammon
 * @author Chiara Foschi
 * @version 2025/26
 */
const Backgammon = Object.create(null);

/**
 * A point is one of the 24 triangular positions on the board.
 * Pieces stack up on a point; only one player can occupy it at a time.
 * @memberof Backgammon
 * @typedef {Object} Point
 * @property {0|1|null} owner - Which player owns the pieces here, or null if
 *     empty.
 * @property {number} count - How many pieces are stacked here.
 */

/**
 * A move describes one piece being moved from a source to a destination.
 * @memberof Backgammon
 * @typedef {Object} Move
 * @property {number|"bar"} from - Source: a point index (0-23) or "bar".
 * @property {number|"bearoff"} to - Destination: a point index or "bearoff".
 */

/**
 * A GameState is a complete snapshot of the game at one moment.
 * All game functions take and return GameState objects; none mutate their
 * input.
 * @memberof Backgammon
 * @typedef {Object} GameState
 * @property {Point[]} points - The 24 board points; index 0 = point 1.
 * @property {number[]} bar - Pieces waiting on the bar: [p1count, p2count].
 * @property {number[]} borneOff - Pieces already borne off: [p1count, p2count].
 * @property {number[]} dice - Remaining dice for this turn.
 * @property {0|1} currentPlayer - Whose turn it is.
 * @property {"moving"|"gameover"} phase - Current phase of the game.
 * @property {0|1|null} winner - Winner once the game ends, otherwise null.
 * @property {number|"bar"|null} selectedFrom - Which source the player has
 *     clicked (UI).
 */

/**
 * The total number of triangular points on a backgammon board.
 * @memberof Backgammon
 * @constant {number}
 */
Backgammon.point_count = 24;

/**
 * The number of checkers each player starts with.
 * @memberof Backgammon
 * @constant {number}
 */
Backgammon.checker_count = 15;

/**
 * The standard opening layout. Index 0 is point 1.
 * Player 0 moves from high indices to low; Player 1 moves from low to high.
 * @memberof Backgammon
 * @constant {Point[]}
 */
Backgammon.initial_board = (function () {
    const pts = R.map(function () {
        return {owner: null, count: 0};
    }, R.range(0, 24));

    pts[23] = {owner: 0, count: 2};
    pts[12] = {owner: 0, count: 5};
    pts[7]  = {owner: 0, count: 3};
    pts[5]  = {owner: 0, count: 5};

    pts[0]  = {owner: 1, count: 2};
    pts[11] = {owner: 1, count: 5};
    pts[16] = {owner: 1, count: 3};
    pts[18] = {owner: 1, count: 5};

    return Object.freeze(pts);
}());

/**
 * Rolls two dice using the provided random function.
 * Returns four identical values when doubles are rolled.
 * @memberof Backgammon
 * @function
 * @param {function():number} rand - Returns a number in [0, 1).
 * @returns {number[]} Two die values, or four equal values on doubles.
 */
Backgammon.roll_dice = function (rand) {
    const d1 = Math.floor(rand() * 6) + 1;
    const d2 = Math.floor(rand() * 6) + 1;
    return (
        d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]
    );
};

/**
 * Creates a fresh game state with the standard opening position.
 * Dice are rolled straight away so the first player can begin moving.
 * @memberof Backgammon
 * @function
 * @param {function():number} rand - Random function passed to roll_dice.
 * @returns {GameState}
 */
Backgammon.new_game = function (rand) {
    return {
        points: Backgammon.initial_board.map(
            function (p) { return Object.assign({}, p); }
        ),
        bar: [0, 0],
        borneOff: [0, 0],
        dice: Backgammon.roll_dice(rand),
        currentPlayer: 0,
        phase: "moving",
        winner: null,
        selectedFrom: null,
    };
};

/**
 * Returns true when a player may start bearing off.
 * This requires all their remaining pieces to be inside their home board
 * with none waiting on the bar.
 * Player 0 home board: indices 0-5. Player 1 home board: indices 18-23.
 * @memberof Backgammon
 * @function
 * @param {0|1} player - The player to check.
 * @param {GameState} game - Current game state.
 * @returns {boolean}
 */
Backgammon.can_bear_off = function (player, game) {
    if (game.bar[player] > 0) {
        return false;
    }
    const home_start = (player === 0 ? 0 : 18);
    const home_end   = (player === 0 ? 6 : 24);
    const outside_home = R.range(0, home_start).concat(
        R.range(home_end, Backgammon.point_count)
    );
    return !R.any(
        function (i) {
            return game.points[i].owner === player && game.points[i].count > 0;
        },
        outside_home
    );
};

/**
 * Returns true when the game has ended. Either player has borne off all 15
 * pieces.
 * @memberof Backgammon
 * @function
 * @param {GameState} game
 * @returns {boolean}
 */
Backgammon.is_ended = function (game) {
    return R.any(
        function (n) { return n === Backgammon.checker_count; },
        game.borneOff
    );
};

/**
 * Returns the winning player, or null if the game is still in progress.
 * @memberof Backgammon
 * @function
 * @param {GameState} game
 * @returns {0|1|null}
 */
Backgammon.winner = function (game) {
    if (game.borneOff[0] === Backgammon.checker_count) { return 0; }
    if (game.borneOff[1] === Backgammon.checker_count) { return 1; }
    return null;
};

// helper: checks if theres a piece futher from the bearing-off edge
// within the home board (needed for the overshoot rule)
const has_piece_further_back = function (player, from_index, game) {
    const inner_range = (
        player === 0
        ? R.range(from_index + 1, 6)
        : R.range(18, from_index)
    );
    return R.any(
        function (i) {
            return game.points[i].owner === player && game.points[i].count > 0;
        },
        inner_range
    );
};

/**
 * Returns all legal moves starting from a given source this turn.
 * Duplicate destinations from identical dice are removed.
 * @memberof Backgammon
 * @function
 * @param {number|"bar"} from - Source point index or "bar".
 * @param {GameState} game - Current game state.
 * @returns {Move[]}
 */
Backgammon.legal_moves_from = function (from, game) {
    const player = game.currentPlayer;
    const dir    = (player === 0 ? -1 : 1);

    if (from === "bar") {
        if (game.bar[player] === 0) { return []; }
    } else {
        const src = game.points[from];
        if (src.owner !== player || src.count === 0) { return []; }
    }

    const seen = new Set();

    const try_die = function (acc, d) {
        const to_index = (
            from === "bar"
            ? (player === 0 ? 24 - d : d - 1)
            : from + dir * d
        );

        const falls_off = (
            player === 0
            ? to_index < 0
            : to_index >= Backgammon.point_count
        );

        // piece would move off the board, check if bear-off is valid
        if (falls_off) {
            if (!Backgammon.can_bear_off(player, game)) { return acc; }
            const needed = (
                player === 0
                ? Number(from) + 1
                : Backgammon.point_count - Number(from)
            );
            if (
                d !== needed &&
                has_piece_further_back(player, Number(from), game)
            ) {
                return acc;
            }
            if (seen.has("bearoff")) { return acc; }
            seen.add("bearoff");
            return acc.concat([{from, to: "bearoff"}]);
        }

        if (to_index < 0 || to_index >= Backgammon.point_count) { return acc; }

        const dest = game.points[to_index];
        if (
            dest.owner !== null &&
            dest.owner !== player &&
            dest.count >= 2
        ) {
            return acc;
        }
        if (seen.has(to_index)) { return acc; }
        seen.add(to_index);
        return acc.concat([{from, to: to_index}]);
    };

    return R.reduce(try_die, [], Array.from(new Set(game.dice)));
};

/**
 * Returns all legal moves available to the current player this turn.
 * If the player has pieces on the bar, only bar-entry moves are returned.
 * @memberof Backgammon
 * @function
 * @param {GameState} game
 * @returns {Move[]}
 */
Backgammon.legal_moves = function (game) {
    if (game.phase !== "moving" || game.dice.length === 0) { return []; }

    const player = game.currentPlayer;

    if (game.bar[player] > 0) {
        return Backgammon.legal_moves_from("bar", game);
    }

    const sources = R.filter(
        function (i) {
            return game.points[i].owner === player && game.points[i].count > 0;
        },
        R.range(0, Backgammon.point_count)
    );

    return R.chain(
        function (i) { return Backgammon.legal_moves_from(i, game); },
        sources
    );
};

/**
 * Applies a move and returns the updated game state.
 * Handles normal moves, bar entry, hitting blots, bearing off, and game-over.
 * Never mutates its input.
 * @memberof Backgammon
 * @function
 * @param {Move} move - The move to apply, e.g. {from: 23, to: 20}.
 * @param {GameState} game - Current game state.
 * @returns {GameState} New state after the move.
 */
Backgammon.make_move = function (move, game) {
    const {from, to} = move;
    const player = game.currentPlayer;
    const opp    = 1 - player;

    const points   = game.points.map(
        function (p) { return Object.assign({}, p); }
    );
    const bar      = game.bar.slice();
    const borneOff = game.borneOff.slice();

    // figure out which die value this move uses
    let die_used;
    if (from === "bar") {
        die_used = (player === 0 ? 24 - Number(to) : Number(to) + 1);
    } else if (to === "bearoff") {
        const needed = (
            player === 0
            ? Number(from) + 1
            : Backgammon.point_count - Number(from)
        );
        const eligible = R.filter(
            function (d) { return d >= needed; },
            game.dice
        );
        die_used = (
            eligible.length > 0
            ? Math.min.apply(null, eligible)
            : Math.min.apply(null, game.dice)
        );
    } else {
        die_used = Math.abs(Number(to) - Number(from));
    }

    const dice    = game.dice.slice();
    const die_idx = dice.indexOf(die_used);
    if (die_idx !== -1) { dice.splice(die_idx, 1); }

    if (from === "bar") {
        bar[player] -= 1;
    } else {
        const n = points[Number(from)].count - 1;
        points[Number(from)] = {owner: (n === 0 ? null : player), count: n};
    }

    if (to === "bearoff") {
        borneOff[player] += 1;
    } else {
        const t = Number(to);
        if (points[t].owner === opp && points[t].count === 1) {
            bar[opp] += 1;
            points[t] = {owner: player, count: 1};
        } else {
            points[t] = {owner: player, count: points[t].count + 1};
        }
    }

    const next = Object.assign({}, game, {
        points,
        bar,
        borneOff,
        dice,
        selectedFrom: null
    });

    if (borneOff[player] === Backgammon.checker_count) {
        return Object.assign({}, next, {phase: "gameover", winner: player});
    }
    return next;
};

/**
 * Ends the current player's turn, switches to the other player, and rolls
 * fresh dice. Returns the state unchanged when the game is already over.
 * @memberof Backgammon
 * @function
 * @param {function():number} rand - Random function for the next dice roll.
 * @param {GameState} game - Current game state.
 * @returns {GameState}
 */
Backgammon.end_turn = function (rand, game) {
    if (game.phase === "gameover") { return game; }
    return Object.assign({}, game, {
        dice: Backgammon.roll_dice(rand),
        currentPlayer: 1 - game.currentPlayer,
        phase: "moving",
        selectedFrom: null
    });
};

/**
 * Returns true when the current player may legally end their turn.
 * Backgammon rules require a player to use as many dice as possible,
 * so this returns false while any legal move remains available.
 * @memberof Backgammon
 * @function
 * @param {GameState} game - Current game state.
 * @returns {boolean}
 */
Backgammon.can_end_turn = function (game) {
    if (game.phase === "gameover") { return false; }
    if (game.dice.length === 0) { return true; }
    return Backgammon.legal_moves(game).length === 0;
};

/**
 * Toggles the selected source in the game state.
 * Clicking the same source twice clears the selection.
 * @memberof Backgammon
 * @function
 * @param {number|"bar"|null} from - The source to select or deselect.
 * @param {GameState} game - Current game state.
 * @returns {GameState}
 */
Backgammon.select_from = function (from, game) {
    return Object.assign({}, game, {
        selectedFrom: (game.selectedFrom === from ? null : from)
    });
};

/**
 * Returns the first available legal move as a hint, or null if none exist.
 * Useful for implementing a hint button in the UI.
 * @memberof Backgammon
 * @function
 * @param {GameState} game
 * @returns {Move|null}
 */
Backgammon.hint = R.pipe(
    Backgammon.legal_moves,
    function (moves) {
        return (moves.length > 0 ? moves[0] : null);
    }
);

export default Object.freeze(Backgammon);