const { describe, it, before } = require('node:test');
const request = require('supertest');
const assert = require('assert');
const { Storage } = require('../src/storage/db');
const { createApp } = require('../src/app');

describe('Express.js REST API & Database Suite', () => {
  let app, storage;

  before(() => {
    storage = new Storage(':memory:');
    app = createApp(storage);
  });

  it('GET / should serve HTML homepage', async () => {
    const res = await request(app).get('/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.header['content-type'].includes('text/html'));
  });

  it('GET /engine.js should serve shared SudokuEngine script', async () => {
    const res = await request(app).get('/engine.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.header['content-type'].includes('javascript'));
    assert.ok(res.text.includes('SudokuEngine'));
  });

  it('POST /api/puzzles/generate should generate, evaluate, and save puzzle', async () => {
    const res = await request(app)
      .post('/api/puzzles/generate?difficulty=hard&blanks=42')
      .expect(201);

    const body = res.body;
    assert.ok(body.id > 0, 'Should have positive id');
    assert.strictEqual(body.board_state.length, 81);
    assert.strictEqual(body.solution.length, 81);
    assert.ok(body.total_score > 0, 'Total score should be > 0');
    assert.ok(body.total_assertions > 0, 'Total assertions should be > 0');
    assert.ok(body.granular_tier.length > 0, 'Granular tier should not be empty');
    assert.ok(Array.isArray(body.metrics_list), 'Metrics list should be an array');
    assert.ok(body.metrics_list.length > 0, 'Metrics list should not be empty');
  });

  it('GET /api/puzzles should list saved puzzles', async () => {
    const res = await request(app)
      .get('/api/puzzles?limit=10&offset=0')
      .expect(200);

    assert.ok(Array.isArray(res.body), 'Should return array of puzzles');
    assert.ok(res.body.length >= 1, 'Should contain at least 1 puzzle');
  });

  it('GET /api/puzzles/:id should return puzzle record', async () => {
    const genRes = await request(app)
      .post('/api/puzzles/generate?difficulty=easy&blanks=30')
      .expect(201);

    const id = genRes.body.id;
    const res = await request(app)
      .get(`/api/puzzles/${id}`)
      .expect(200);

    assert.strictEqual(res.body.id, id);
    assert.strictEqual(res.body.difficulty_rating, genRes.body.difficulty_rating);
    assert.strictEqual(res.body.total_assertions, genRes.body.total_assertions);
  });

  it('GET /api/puzzles/:id/svg endpoints should return valid SVG vector data', async () => {
    const genRes = await request(app)
      .post('/api/puzzles/generate?difficulty=medium&blanks=36')
      .expect(201);

    const id = genRes.body.id;

    // Helper to get text from buffer or string
    const getText = (res) => (typeof res.text === 'string' ? res.text : res.body.toString('utf8'));

    // 1. Static board SVG
    const svgRes = await request(app).get(`/api/puzzles/${id}/svg`).expect(200);
    assert.ok(svgRes.header['content-type'].includes('image/svg+xml'));
    assert.ok(getText(svgRes).includes('<svg'));

    // 2. Heatmap SVG
    const heatRes = await request(app).get(`/api/puzzles/${id}/heatmap.svg`).expect(200);
    assert.ok(heatRes.header['content-type'].includes('image/svg+xml'));
    assert.ok(getText(heatRes).includes('class="cell-text"'));

    // 3. Trajectory SVG
    const trajRes = await request(app).get(`/api/puzzles/${id}/trajectory.svg`).expect(200);
    assert.ok(trajRes.header['content-type'].includes('image/svg+xml'));
    assert.ok(getText(trajRes).includes('Difficulty Step Trajectory'));

    // 4. Animated SVG
    const animRes = await request(app).get(`/api/puzzles/${id}/animated.svg`).expect(200);
    assert.ok(animRes.header['content-type'].includes('image/svg+xml'));
    assert.ok(getText(animRes).includes('@keyframes anim-step-0'));

    // 5. Replay SVG
    const replayRes = await request(app).get(`/api/puzzles/${id}/replay.svg`).expect(200);
    assert.ok(replayRes.header['content-type'].includes('image/svg+xml'));
    assert.ok(getText(replayRes).includes('anim-unsolve-val'));

    // 6. Interactive Player SVG
    const playerRes = await request(app).get(`/api/puzzles/${id}/player.svg`).expect(200);
    assert.ok(playerRes.header['content-type'].includes('image/svg+xml'));
    assert.ok(getText(playerRes).includes('id="undoku-svg-player"'));
  });

  it('GET /api/puzzles/999999 should return 404', async () => {
    await request(app).get('/api/puzzles/999999').expect(404);
  });
});
