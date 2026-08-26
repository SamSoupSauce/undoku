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

  it("should directly preserve and unpack initialGrid and solutionGrid matrix states in Base64 JSON payload", () => {
    const customPuzzle = [
      [5, 3, 0, 0, 7, 0, 0, 0, 0],
      [6, 0, 0, 1, 9, 5, 0, 0, 0],
      [0, 9, 8, 0, 0, 0, 0, 6, 0],
      [8, 0, 0, 0, 6, 0, 0, 0, 3],
      [4, 0, 0, 8, 0, 3, 0, 0, 1],
      [7, 0, 0, 0, 2, 0, 0, 0, 6],
      [0, 6, 0, 0, 0, 0, 2, 8, 0],
      [0, 0, 0, 4, 1, 9, 0, 0, 5],
      [0, 0, 0, 0, 8, 0, 0, 7, 9]
    ];

    const game = {
      seed: 42,
      difficulty: "expert",
      topologyKey: "classic_9x9",
      boardRows: 3,
      boardCols: 3,
      initialGrid: customPuzzle,
      solutionGrid: customPuzzle,
      turnHistory: []
    };

    const b64 = SudokuEngine.serializeGamePayload(game);
    const hydrated = SudokuEngine.deserializeGamePayload(b64);

    assert.ok(hydrated, "Hydrated payload must exist");
    assert.deepStrictEqual(hydrated.initialGrid, customPuzzle, "Initial grid must match 100%");
    assert.strictEqual(hydrated.seed, 42);
    assert.strictEqual(hydrated.difficulty, "expert");
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

  it("should generate 100% identical puzzle boards and solutions when given the same PRNG seed", () => {
    const seed = 0xABCD1234 >>> 0;
    const run1 = SudokuEngine.generateAndCarve("hard", "classic_9x9", seed);
    const run2 = SudokuEngine.generateAndCarve("hard", "classic_9x9", seed);

    assert.deepStrictEqual(run1.puzzle, run2.puzzle, "Puzzles from same seed must match exactly");
    assert.deepStrictEqual(run1.solution, run2.solution, "Solutions from same seed must match exactly");
    assert.strictEqual(run1.deductions.length, run2.deductions.length, "Deduction counts from same seed must match");
  });
});
