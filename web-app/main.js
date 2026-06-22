/*jslint browser */
import Backgammon from "./Backgammon.js";
import R from "./ramda.js";

// String literals
const die_face = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const player_tokens = ["○", "●"];

// DOM refernces
const dice_display_el = document.getElementById("dice-display");
const action_btn_el = document.getElementById("action-btn");
const hint_btn_el = document.getElementById("hint-btn");
const turn_text_el = document.getElementById("turn-text");
const message_el = document.getElementById("message");
const modal = document.getElementById("end-modal");
const p1_panel = document.getElementById("p1-panel");
const p2_panel = document.getElementById("p2-panel");
const p1_borne_off_el = document.getElementById("p1-borne-off");
const p2_borne_off_el = document.getElementById("p2-borne-off");
const top_left_el = document.getElementById("top-left");
const top_right_el = document.getElementById("top-right");
const bot_left_el = document.getElementById("bot-left");
const bot_right_el = document.getElementById("bot-right");
const bar_p1_el = document.getElementById("bar-p1");
const bar_p2_el = document.getElementById("bar-p2");
const bar_p1_pieces_el = document.getElementById("bar-p1-pieces");
const bar_p2_pieces_el = document.getElementById("bar-p2-pieces");
const borne_p1_el = document.getElementById("bearoff-p1-pieces");
const borne_p2_el = document.getElementById("bearoff-p2-pieces");
const dice_overlay_el = document.getElementById("dice-overlay");
const dice_overlay_player_el = document.getElementById("dice-overlay-player");
const dice_overlay_dice_el = document.getElementById("dice-overlay-dice");

let state = Backgammon.new_game(Math.random);
let hint_timer_id = null;
let msg_timer_id = null;

const show_dice_overlay = function (player, dice) {
    return new Promise(function (resolve) {
        dice_overlay_player_el.className = (
            player === 0 ? "p1" : "p2"
        );
        dice_overlay_player_el.textContent = `Player ${player + 1} rolls…`;
        dice_overlay_dice_el.innerHTML = "";

        // build die elements, start with random faces while rolling
        const die_els = dice.map(function (final_val) {
            const div = document.createElement("div");
            div.className = "overlay-die rolling";
            div.textContent = die_face[Math.floor(Math.random() * 6)];
            div.setAttribute("aria-label", `Die: ${final_val}`);
            dice_overlay_dice_el.appendChild(div);
            return {el: div, final: final_val};
        });

        dice_display_el.style.visibility = "hidden";
        dice_overlay_el.classList.add("visible");

        // rapidly cycle through random faces to simulate tumbling
        const roll_interval = setInterval(function () {
            die_els.forEach(function (item) {
                item.el.textContent = die_face[Math.floor(Math.random() * 6)];
            });
        }, 100);

        // after 1000ms settle on the real values
        setTimeout(function () {
            clearInterval(roll_interval);
            die_els.forEach(function (item) {
                item.el.classList.remove("rolling");
                item.el.classList.add("landed");
                item.el.textContent = die_face[item.final - 1];
            });
        }, 1000);

        const dismiss = function () {
            clearInterval(roll_interval);
            dice_overlay_el.classList.remove("visible");
            dice_display_el.style.visibility = "visible";
            resolve();
        };
        dice_overlay_el.onclick = dismiss;
        setTimeout(dismiss, 2800);
    });
};

const show_message = function (text, ms) {
    message_el.textContent = text;
    clearTimeout(msg_timer_id);
    if (ms === undefined || ms > 0) {
        msg_timer_id = setTimeout(function () {
            message_el.textContent = "";
        }, ms || 2500);
    }
};

const build_checker_stack = function (count, player) {
    const stack = document.createElement("div");
    stack.className = "checker-stack";
    const shown = Math.min(count, 5);
    let i = 0;
    while (i < shown) {
        const c = document.createElement("div");
        c.className = `checker p${player + 1}`;
        c.textContent = player_tokens[player];
        stack.appendChild(c);
        i += 1;
    }
    if (count > 5) {
        const ov = document.createElement("div");
        ov.className = "checker overflow";
        ov.textContent = `+${count - 5}`;
        stack.appendChild(ov);
    }
    return stack;
};

const make_point_cell = function (idx, valid_dests) {
    const pt = state.points[idx];
    const cell = document.createElement("div");
    cell.className = (
        `point-cell ${idx % 2 === 1 ? "triangle-dark" : "triangle-light"}`
    );
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-label", (
        pt.owner !== null
        ? (
            `Point ${idx + 1}, ${pt.count} ` +
            `${pt.owner === 0 ? "white" : "black"} ` +
            `piece${pt.count !== 1 ? "s" : ""}`
        )
        : `Point ${idx + 1}, empty`
    ));
    cell.dataset.idx = idx;
    if (state.selectedFrom === idx) { cell.classList.add("selected"); }
    if (valid_dests.has(String(idx))) { cell.classList.add("valid-dest"); }
    if (pt.owner !== null && pt.count > 0) {
        cell.appendChild(build_checker_stack(pt.count, pt.owner));
    }
    const label = document.createElement("div");
    label.className = "point-label";
    label.textContent = idx + 1;
    cell.appendChild(label);
    cell.onclick = function () { handle_point_click(idx); };
    cell.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") { handle_point_click(idx); }
    };
    return cell;
};

const render_board = function () {
    const sel = state.selectedFrom;
    const valid_dests = (
        sel !== null && sel !== undefined
        ? new Set(
            Backgammon.legal_moves_from(sel, state).map((m) => String(m.to))
        )
        : new Set()
    );

    top_left_el.innerHTML = "";
    top_right_el.innerHTML = "";
    bot_left_el.innerHTML = "";
    bot_right_el.innerHTML = "";

    R.range(12, 18).forEach(function (i) {
        top_left_el.appendChild(make_point_cell(i, valid_dests));
    });
    R.range(18, 24).forEach(function (i) {
        top_right_el.appendChild(make_point_cell(i, valid_dests));
    });
    R.reverse(R.range(6, 12)).forEach(function (i) {
        bot_left_el.appendChild(make_point_cell(i, valid_dests));
    });
    R.reverse(R.range(0, 6)).forEach(function (i) {
        bot_right_el.appendChild(make_point_cell(i, valid_dests));
    });

    bar_p1_pieces_el.innerHTML = "";
    bar_p2_pieces_el.innerHTML = "";
    if (state.bar[0] > 0) {
        bar_p1_pieces_el.appendChild(build_checker_stack(state.bar[0], 0));
    }
    if (state.bar[1] > 0) {
        bar_p2_pieces_el.appendChild(build_checker_stack(state.bar[1], 1));
    }

    const cp = state.currentPlayer;
    bar_p1_el.classList.toggle("selected", sel === "bar" && cp === 0);
    bar_p2_el.classList.toggle("selected", sel === "bar" && cp === 1);
    bar_p1_el.classList.toggle(
        "needs-entry",
        state.bar[0] > 0 && cp === 0 && sel !== "bar"
    );
    bar_p2_el.classList.toggle(
        "needs-entry",
        state.bar[1] > 0 && cp === 1 && sel !== "bar"
    );

    borne_p1_el.innerHTML = "";
    borne_p2_el.innerHTML = "";
    R.range(0, state.borneOff[0]).forEach(function () {
        const t = document.createElement("div");
        t.className = "checker-token p1";
        t.textContent = "○";
        borne_p1_el.appendChild(t);
    });
    R.range(0, state.borneOff[1]).forEach(function () {
        const t = document.createElement("div");
        t.className = "checker-token p2";
        t.textContent = "●";
        borne_p2_el.appendChild(t);
    });
    p1_borne_off_el.textContent = `${state.borneOff[0]} off`;
    p2_borne_off_el.textContent = `${state.borneOff[1]} off`;
};

const render = function () {
    const cp = state.currentPlayer;
    turn_text_el.textContent = `Player ${cp + 1}'s Turn`;
    p1_panel.classList.toggle("active", cp === 0);
    p2_panel.classList.toggle("active", cp === 1);

    dice_display_el.innerHTML = "";
    state.dice.forEach(function (d) {
        const die = document.createElement("div");
        die.className = "die";
        die.textContent = d;
        die.setAttribute("aria-label", `Die showing ${d}`);
        dice_display_el.appendChild(die);
    });

    action_btn_el.textContent = (
        state.phase === "gameover" ? "Game Over" : "End Turn"
    );
    action_btn_el.disabled = (
        state.phase === "gameover" || !Backgammon.can_end_turn(state)
    );

    render_board();
    if (state.phase === "gameover" || Backgammon.is_ended(state)) {
        setTimeout(show_end_modal, 400);
    }
};

const handle_point_click = function (idx) {
    if (state.phase !== "moving") { return; }
    clear_hint();
    const cp = state.currentPlayer;
    const sel = state.selectedFrom;
    const valid_dests = (
        sel !== null && sel !== undefined
        ? new Set(
            Backgammon.legal_moves_from(sel, state).map((m) => String(m.to))
        )
        : new Set()
    );

    if (sel !== null && valid_dests.has(String(idx))) {
        state = Backgammon.make_move({from: sel, to: idx}, state);
        show_message("", 0);
        auto_end_if_needed();
        render();
        return;
    }

    if (state.bar[cp] > 0) {
        show_message(
            sel === "bar"
            ? "That point isn't a valid entry."
            : "Move your bar piece first!"
        );
        return;
    }

    const pt = state.points[idx];
    if (pt.owner === cp && pt.count > 0) {
        if (Backgammon.legal_moves_from(idx, state).length === 0) {
            show_message("That piece has no valid moves.");
            return;
        }
        state = Backgammon.select_from(idx, state);
        show_message("Piece selected, click a highlighted point.", 0);
        render();
        return;
    }

    if (sel !== null) { show_message("Not a valid destination."); return; }
    show_message("Click one of your pieces to select it.");
};

const handle_bar_click = function () {
    if (state.phase !== "moving") { return; }
    clear_hint();
    const cp = state.currentPlayer;
    if (state.bar[cp] === 0) { return; }
    if (Backgammon.legal_moves_from("bar", state).length === 0) {
        show_message("All entry points are blocked. End your turn.");
        return;
    }
    state = Backgammon.select_from("bar", state);
    show_message(state.selectedFrom === null ? "" : "Bar piece selected.", 0);
    render();
};

const handle_bear_off = function () {
    if (state.phase !== "moving") { return; }
    clear_hint();
    const sel = state.selectedFrom;
    if (sel === null || sel === undefined) { return; }
    const valid = new Set(
        Backgammon.legal_moves_from(sel, state).map((m) => String(m.to))
    );
    if (valid.has("bearoff")) {
        state = Backgammon.make_move({from: sel, to: "bearoff"}, state);
        auto_end_if_needed();
        render();
    }
};

const auto_end_if_needed = function () {
    if (state.phase === "gameover") { return; }
    if (
        state.dice.length > 0 &&
        Backgammon.legal_moves(state).length > 0
    ) { return; }
    const whose_turn = state.currentPlayer;
    show_message("No more moves. Switching turn…", 800);
    const do_turn_end = async function () {
        if (
            state.phase === "gameover" ||
            state.currentPlayer !== whose_turn
        ) { return; }
        state = Backgammon.end_turn(Math.random, state);
        render();
        await show_dice_overlay(state.currentPlayer, state.dice);
        if (Backgammon.legal_moves(state).length === 0) {
            show_message("No legal moves, turn skipped.", 2000);
            const skipped = state.currentPlayer;
            const do_skip_end = async function () {
                if (
                    state.phase !== "gameover" &&
                    state.currentPlayer === skipped
                ) {
                    state = Backgammon.end_turn(Math.random, state);
                    render();
                    await show_dice_overlay(state.currentPlayer, state.dice);
                }
            };
            setTimeout(do_skip_end, 1000);
        }
    };
    setTimeout(do_turn_end, 900);
};

const clear_hint = function () {
    clearTimeout(hint_timer_id);
    document.querySelectorAll(".hinted").forEach(
        (el) => el.classList.remove("hinted")
    );
};

const highlight_hint_cell = function (loc) {
    if (loc === "bar") {
        (
            state.currentPlayer === 0 ? bar_p1_el : bar_p2_el
        ).classList.add("hinted");
        return;
    }
    if (loc === "bearoff") {
        const el = document.getElementById(
            state.currentPlayer === 0 ? "bearoff-p1-area" : "bearoff-p2-area"
        );
        if (el) { el.classList.add("hinted"); }
        return;
    }
    const cell = document.querySelector(`.point-cell[data-idx="${loc}"]`);
    if (cell) { cell.classList.add("hinted"); }
};

const handle_hint = function () {
    if (state.phase !== "moving") { return; }
    clear_hint();
    const hint = Backgammon.hint(state);
    if (!hint) { show_message("No legal moves available."); return; }
    const from_label = (
        hint.from === "bar" ? "bar" : `point ${Number(hint.from) + 1}`
    );
    const to_label = (
        hint.to === "bearoff" ? "bear off" : `point ${Number(hint.to) + 1}`
    );
    show_message(`Hint: ${from_label} → ${to_label}`, 3000);
    highlight_hint_cell(hint.from);
    highlight_hint_cell(hint.to);
    hint_timer_id = setTimeout(clear_hint, 3000);
};

const show_end_modal = function () {
    const w = Backgammon.winner(state);
    if (w === null) { return; }
    document.getElementById("modal-emoji").textContent = player_tokens[w];
    document.getElementById("modal-title").textContent = (
        `Player ${w + 1} Wins!`
    );
    document.getElementById("modal-message").textContent = (
        `Player ${w + 1} has borne off all 15 checkers!`
    );
    modal.showModal();
};

const start_new_game = async function () {
    clear_hint();
    clearTimeout(msg_timer_id);
    message_el.textContent = "";
    if (modal.open) { modal.close(); }
    state = Backgammon.new_game(Math.random);
    render();
    await show_dice_overlay(state.currentPlayer, state.dice);
};

const handle_action_btn = async function () {
    if (state.phase === "gameover") { return; }
    clear_hint();
    show_message("", 0);
    state = Backgammon.end_turn(Math.random, state);
    render();
    await show_dice_overlay(state.currentPlayer, state.dice);
    if (Backgammon.legal_moves(state).length === 0) {
        show_message("No legal moves. Turn skipped.", 2500);
        const skipped = state.currentPlayer;
        const do_skip_end = async function () {
            if (
                state.phase !== "gameover" &&
                state.currentPlayer === skipped
            ) {
                state = Backgammon.end_turn(Math.random, state);
                render();
                await show_dice_overlay(state.currentPlayer, state.dice);
            }
        };
        setTimeout(do_skip_end, 800);
    }
};

bar_p1_el.onclick = handle_bar_click;
bar_p2_el.onclick = handle_bar_click;
bar_p1_el.onkeydown = function (e) {
    if (e.key === "Enter" || e.key === " ") { handle_bar_click(); }
};
bar_p2_el.onkeydown = function (e) {
    if (e.key === "Enter" || e.key === " ") { handle_bar_click(); }
};

document.getElementById("bearoff-p1-area").onclick = function () {
    if (state.currentPlayer === 0) { handle_bear_off(); }
};
document.getElementById("bearoff-p2-area").onclick = function () {
    if (state.currentPlayer === 1) { handle_bear_off(); }
};

action_btn_el.onclick = handle_action_btn;
hint_btn_el.onclick = handle_hint;
document.getElementById("new-game-btn").onclick = start_new_game;
document.getElementById("play-again-btn").onclick = start_new_game;
modal.oncancel = function (e) { e.preventDefault(); };

render();
show_dice_overlay(state.currentPlayer, state.dice);