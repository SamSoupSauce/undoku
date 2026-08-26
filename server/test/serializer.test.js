const { describe, it } = require("node:test");
const assert = require("node:assert");
const { SudokuEngine } = require("../../shared/engine");

describe("Ticket 004: Compact Binary Bitfield Serialization & Replay Reconstruction", () => {
  it("should serialize and deserialize a game payload with exact seed, topology, difficulty, and turn diffs", () => {
    const mockGame = {
      seed: 0x9A4BC123 >>> 0,
      boardRows: 3,
      boardCols: 3,
      difficulty: "hard",
      gameMode: "catch_mistakes",
      turnHistory: [
        { step: 1, r: 0, c: 2, val: 5, prevVal: 0, timestamp: 1700000000000 },
        { step: 2, r: 4, c: 4, val: 9, prevVal: 0, timestamp: 1700000001000 },
        { step: 3, r: 8, c: 7, val: 1, prevVal: 3, timestamp: 1700000002000 }
      ]
    };

    const b64url = SudokuEngine.serializeGamePayload(mockGame);
    assert.strictEqual(typeof b64url, "string");
    assert.ok(b64url.length > 0);

    const unpacked = SudokuEngine.deserializeGamePayload(b64url);
    assert.ok(unpacked, "Deserialized payload must not be null");
    assert.strictEqual(unpacked.seed, mockGame.seed);
    assert.strictEqual(unpacked.Br, mockGame.boardRows);
    assert.strictEqual(unpacked.Bc, mockGame.boardCols);
    assert.strictEqual(unpacked.N, 9);
    assert.strictEqual(unpacked.difficulty, "hard");
    assert.strictEqual(unpacked.gameMode, "catch_mistakes");
    assert.strictEqual(unpacked.turnHistory.length, 3);
    assert.strictEqual(unpacked.turnHistory[0].r, 0);
    assert.strictEqual(unpacked.turnHistory[0].c, 2);
    assert.strictEqual(unpacked.turnHistory[0].val, 5);
    assert.strictEqual(unpacked.turnHistory[0].prevVal, 0);
    assert.strictEqual(unpacked.turnHistory[2].r, 8);
    assert.strictEqual(unpacked.turnHistory[2].c, 7);
    assert.strictEqual(unpacked.turnHistory[2].val, 1);
    assert.strictEqual(unpacked.turnHistory[2].prevVal, 3);
  });

  it("should compress 50 turn diffs into under 256 bytes", () => {
    const turns = [];
    for (let i = 0; i < 50; i++) {
      turns.push({
        step: i + 1,
        r: i % 9,
        c: (i * 3) % 9,
        val: ((i % 9) + 1),
        prevVal: 0,
        timestamp: Date.now()
      });
    }

    const game = {
      seed: 123456789,
      boardRows: 3,
      boardCols: 3,
      difficulty: "extreme",
      gameMode: "like_paper",
      turnHistory: turns
    };

    const b64url = SudokuEngine.serializeGamePayload(game);
    // 10 bytes header + 50 * 2 bytes turns = 110 raw bytes -> ~148 Base64 characters (< 256 bytes)
    assert.ok(b64url.length < 256, `Payload length was ${b64url.length} (must be < 256 bytes)`);

    const unpacked = SudokuEngine.deserializeGamePayload(b64url);
    assert.strictEqual(unpacked.turnHistory.length, 50);
    assert.strictEqual(unpacked.difficulty, "extreme");
    assert.strictEqual(unpacked.gameMode, "like_paper");
  });

  it("should support non-square rectangular subgrid topologies in serialization (e.g. 12x12 & 16x16)", () => {
    const hexadokuGame = {
      seed: 987654321,
      boardRows: 4,
      boardCols: 4,
      difficulty: "impossible",
      gameMode: "catch_mistakes",
      turnHistory: [
        { step: 1, r: 15, c: 15, val: 16, prevVal: 0 }
      ]
    };

    const b64url = SudokuEngine.serializeGamePayload(hexadokuGame);
    const unpacked = SudokuEngine.deserializeGamePayload(b64url);
    assert.strictEqual(unpacked.Br, 4);
    assert.strictEqual(unpacked.Bc, 4);
    assert.strictEqual(unpacked.N, 16);
    assert.strictEqual(unpacked.difficulty, "impossible");
  });
});
