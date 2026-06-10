import Backgammon from "../Backgammon.js";
import R from "../ramda.js";

// Renders a compact summary of a game state for use inside error messages.
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
 * - Each point has a valid owner (null, 0, or 1) and a non-negative count.
 * - Each player has exactly 15 pieces in total (board + bar + borne-off).
 * - No point holds pieces belonging to both players simultaneously.
 * - The phase is either "moving" or "gameover".
 * @memberof Backgammon.test
 * @function
 * @param {Backgammon.GameState} game The state to validate.
 * @throws if the state fails any of the above conditions.
 */
const throw_if_invalid = function (game) {
    if (!Array.isArray(game.points) || game.points.length !== 24) {
        throw new Error(
            "The board must have exactly 24 points: " + display_game(game)
        );
    }

    const valid_owners = [null, 0, 1];
    game.points.forEach(function (pt, i) {
        if (!valid_owners.includes(pt.owner)) {
            throw new Error(
                "Point " + i + " has an invalid owner (" + pt.owner + "): " +
                display_game(game)
            );
        }
        if (pt.count < 0 || !Number.isInteger(pt.count)) {
            throw new Error(
                "Point " + i + " has an invalid count (" + pt.count + "): " +
                display_game(game)
            );
        }
        if (pt.owner === null && pt.count > 0) {
            throw new Error(
                "Point " + i + " has pieces but no owner: " + display_game(game)
            );
        }
    });

    [0, 1].forEach(function (player) {
        const on_board = R.pipe(
            R.filter((pt) => pt.owner === player),
            R.reduce((sum, pt) => sum + pt.count, 0)
        )(game.points);
        const total = on_board + game.bar[player] + game.borneOff[player];
        if (total !== Backgammon.checker_count) {
            throw new Error(
                "Player " + player + " has " + total + " pieces, expected " +
                Backgammon.checker_count + ": " + display_game(game)
            );
        }
    });

    if (game.phase !== "moving" && game.phase !== "gameover") {
        throw new Error("Unrecognised phase: " + game.phase);
    }
};

describe("New game", function () {
    it("A new game starts in a valid state", function () {
        throw_if_invalid(Backgammon.new_game(() => 0.5));
    });

    it("A new game is not ended and has no winner", function () {
        const game = Backgammon.new_game(() => 0.5);
        if (Backgammon.is_ended(game)) {
            throw new Error(
                "A freshly started game should not be ended: " +
                display_game(game)
            );
        }
        if (Backgammon.winner(game) !== null) {
            throw new Error(
                "A freshly started game should have no winner: " +
                display_game(game)
            );
        }
    });

    it("A new game has dice ready and player 0 to move", function () {
        const game = Backgammon.new_game(() => 0.5);
        if (game.currentPlayer !== 0) {
            throw new Error(
                "Player 0 should move first, got player: " + game.currentPlayer
            );
        }
        if (game.dice.length !== 2 && game.dice.length !== 4) {
            throw new Error(
                "New game should start with 2 or 4 dice, got: " + game.dice
            );
        }
        const all_valid = game.dice.every(
            (d) => Number.isInteger(d) && d >= 1 && d <= 6
        );
        if (!all_valid) {
            throw new Error("Dice values out of range 1–6: " + game.dice);
        }
    });
});

describe("Dice", function () {
    it("Rolling doubles produces four identical values", function () {
        // rand always returns 0 → die = 1, so both dice are 1 → doubles
        const result = Backgammon.roll_dice(() => 0);
        if (result.length !== 4 || !result.every((d) => d === result[0])) {
            throw new Error(
                "Expected four identical values for doubles, got: " + result
            );
        }
    });

    it("Non-doubles produce exactly two different values", function () {
        // First call → die 1, second call → die 2
        let call = 0;
        const result = Backgammon.roll_dice(() => (call++ === 0 ? 0 : 1 / 6));
        if (result.length !== 2) {
            throw new Error(
                "Expected exactly two values for non-doubles, got: " + result
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
            // Player 0 stuck on bar — only bar entry should be available
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
                throw new Error(
                    "With a piece on the bar, all moves should start " +
                    "from 'bar'. Got: " + JSON.stringify(moves)
                );
            }
        }
    );

    it(
        `Given a game in progress,
when every legal move is applied,
then each resulting state is valid and has one fewer die remaining.`,
        function () {
            const starting_games = [
                Backgammon.new_game(() => 1 / 6),   // dice [2, 2, 2, 2]
                Backgammon.new_game(() => 0),         // dice [1, 1, 1, 1]
                (function () {
                    let i = 0;
                    // alternates: die 1, die 3
                    return Backgammon.new_game(
                        () => (i++ % 2 === 0 ? 0 : 2 / 6)
                    );
                }())
            ];

            starting_games.forEach(function (game) {
                const moves = Backgammon.legal_moves(game);
                if (moves.length === 0) { return; } // fine for some rolls

                moves.forEach(function (move) {
                    const next = Backgammon.make_move(move, game);
                    throw_if_invalid(next);
                    if (next.dice.length !== game.dice.length - 1) {
                        throw new Error(
                            "Expected one fewer die after a move. Before: " +
                            game.dice + ", after: " + next.dice +
                            ". Move: " + JSON.stringify(move)
                        );
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
        if (moves.length !== 0) {
            throw new Error(
                "Expected no moves with empty dice, got: " +
                JSON.stringify(moves)
            );
        }
    });
});

describe("Making moves", function () {
    it("Hitting an opponent blot sends their piece to the bar", function () {
        // Minimal board: P1 has 2 at index 23, P2 has a blot at 20
        const pts = R.map(() => ({ owner: null, count: 0 }), R.range(0, 24));
        pts[23] = { owner: 0, count: 2 };   // P1: 2 pieces
        pts[20] = { owner: 1, count: 1 };   // P2: lone blot (target)
        pts[0]  = { owner: 1, count: 14 };  // P2: remaining 14 pieces
        const game = Object.assign(
            Backgammon.new_game(() => 0.5),
            {
                points: pts,
                bar: [0, 0],
                borneOff: [13, 0],  // P1 has 13 borne off; total = 15
                dice: [3],
                currentPlayer: 0,
                phase: "moving",
            }
        );
        const next = Backgammon.make_move({ from: 23, to: 20 }, game);
        throw_if_invalid(next);
        if (next.bar[1] !== 1) {
            throw new Error(
                "Hitting a blot should send one P2 piece to the bar. " +
                "bar[1] = " + next.bar[1]
            );
        }
        if (next.points[20].owner !== 0 || next.points[20].count !== 1) {
            throw new Error(
                "The hitting piece should now occupy the point: " +
                JSON.stringify(next.points[20])
            );
        }
    });

    it(
        "end_turn switches the active player and provides fresh dice",
        function () {
            const game  = Backgammon.new_game(() => 0.5);
            const after = Backgammon.end_turn(() => 0, game);
            throw_if_invalid(after);
            if (after.currentPlayer === game.currentPlayer) {
                throw new Error(
                    "end_turn should switch the active player from " +
                    game.currentPlayer + " but it stayed the same."
                );
            }
            if (after.dice.length < 2) {
                throw new Error(
                    "end_turn should roll fresh dice, got: " + after.dice
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
            if (!Backgammon.is_ended(game)) {
                throw new Error(
                    "A game with 15 pieces borne off should be ended: " +
                    display_game(game)
                );
            }
            if (Backgammon.winner(game) !== 0) {
                throw new Error(
                    "Player 0 should be the winner, got: " +
                    Backgammon.winner(game)
                );
            }
        }
    );

    it(
        `Given all pieces inside the home board,
when a piece is borne off,
the borne-off count increases and the board count decreases.`,
        function () {
            // P1 last piece at index 2 (point 3), P2 already finished
            const pts = R.map(
                () => ({ owner: null, count: 0 }),
                R.range(0, 24)
            );
            pts[2] = { owner: 0, count: 1 };
            const game = Object.assign(
                Backgammon.new_game(() => 0.5),
                {
                    points: pts,
                    bar: [0, 0],
                    // P1: 14 borne off + 1 on board = 15; P2: all borne off
                    borneOff: [14, 15],
                    dice: [3],
                    currentPlayer: 0,
                    phase: "moving",
                }
            );
            const next = Backgammon.make_move({ from: 2, to: "bearoff" }, game);
            throw_if_invalid(next);
            if (next.borneOff[0] !== 15) {
                throw new Error(
                    "Expected 15 pieces borne off after the last move, got: " +
                    next.borneOff[0]
                );
            }
            if (next.phase !== "gameover") {
                throw new Error(
                    "Bearing off the last piece should end the game, " +
                    "phase was: " + next.phase
                );
            }
        }
    );
});
