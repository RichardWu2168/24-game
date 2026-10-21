
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer } from "./answerChecker.js";

test("accepts a correct expression", () => {
    const result = checkAnswer(
        "(3 + 5) * (4 - 1)",
        [3, 5, 4, 1],
    );

    assert.equal(result.valid, true);
    assert.equal(result.value, 24);
});

test("accepts parentheses", () => {
    const result = checkAnswer("(3 + 5) * (4 - 1)", [3, 5, 4, 1]);

    assert.equal(result.valid, true);
    assert.equal(result.value, 24);
});

test("rejects an expression that does not equal 24", () => {
    const result = checkAnswer("1 + 2 + 3 + 4", [1, 2, 3, 4]);

    assert.equal(result.valid, false);
    assert.equal(result.value, 10);
});

test("rejects missing card numbers", () => {
    const result = checkAnswer("3 * 4 + 5", [3, 4, 5, 6]);

    assert.equal(result.valid, false);
    assert.match(result.message, /use all four/i);
});

test("rejects using a number that is not on a card", () => {
    const result = checkAnswer("3 * 4 + 5 + 12", [3, 4, 5, 6]);

    assert.equal(result.valid, false);
    assert.match(result.message, /each card number/i);
});

test("rejects fractional intermediate results", () => {
    const result = checkAnswer("1 / 2 * 4 * 6", [1, 2, 4, 6]);

    assert.equal(result.valid, false);
    assert.match(result.message, /integer/i);
});

test("rejects negative intermediate results", () => {
    const result = checkAnswer("1 - 2 + 3 * 8", [1, 2, 3, 8]);

    assert.equal(result.valid, false);
    assert.match(result.message, /negative/i);
});

test("rejects division by zero", () => {
    const result = checkAnswer(
        "1 / (2 - 2) + 3",
        [1, 2, 2, 3],
    );

    assert.equal(result.valid, false);
    assert.match(result.message, /division by zero/i);
});

test("rejects malformed expressions", () => {
    const result = checkAnswer("1 + + 2 + 3 + 4", [1, 2, 3, 4]);

    assert.equal(result.valid, false);
});

test("rejects an invalid number of cards", () => {
    const result = checkAnswer("1 + 2 + 3", [1, 2, 3]);

    assert.equal(result.valid, false);
});

test("Negative numbers are not allowed.", () => {
    const result = checkAnswer("-1 + 3 + 5 + 10", [1 + 3 + 5 + 10]);

    assert.equal(result.valid, false);
});
