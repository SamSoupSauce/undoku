---
title: REST API Specification
description: Complete endpoint documentation for Undoku REST API and SVG graphics server.
---

## Endpoint Summary

| Method | Endpoint | Content Type | Description |
|---|---|---|---|
| `POST` | `/api/puzzles/generate` | `application/json` | Generate puzzle, calculate difficulty, save to DB |
| `GET` | `/api/puzzles` | `application/json` | List saved puzzles with rating & pagination filters |
| `GET` | `/api/puzzles/:id` | `application/json` | Get single puzzle record & step deductions |
| `GET` | `/api/puzzles/:id/svg` | `image/svg+xml` | Render Sudoku board vector SVG graphic |
| `GET` | `/api/puzzles/:id/heatmap.svg` | `image/svg+xml` | Render elimination density heatmap SVG |
| `GET` | `/api/puzzles/:id/trajectory.svg` | `image/svg+xml` | Render difficulty step trajectory curve SVG |

---

## 1. Generate & Save Puzzle

**`POST /api/puzzles/generate`**

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `difficulty` | string | Optional | Target difficulty (`easy`, `medium`, `hard`, `expert`) |
| `blanks` | integer | Optional | Target number of empty cells (`28` to `57`) |

### Example Request
```bash
curl -X POST "http://localhost:8080/api/puzzles/generate?difficulty=hard"
```

### Example Response (`201 Created`)
```json
{
  "ID": 10,
  "CreatedAt": "2026-07-24T00:24:41.123-05:00",
  "solution": "653728149129614375471539268...",
  "board_state": ".53.28.4..2.61...54..539..8...",
  "blanks_count": 51,
  "difficulty_rating": "Hard",
  "total_score": 93.90,
  "score_spread": 0.70,
  "score_variance": 0.0384,
  "suddenness": 0.45,
  "max_streak": 22,
  "cross_horizontal_reasons": 298,
  "cross_vertical_reasons": 312,
  "box_3x3_reasons": 284,
  "total_reasons": 894,
  "metrics_json": "{\"min_step_score\":1.55,\"max_step_score\":2.25,\"score_spread\":0.7,\"score_variance\":0.0384,\"score_std_dev\":0.196,\"score_divergence\":0.1612,\"suddenness\":0.45,\"max_streak\":22,\"max_streak_technique\":\"Naked Single\",\"most_frequent_technique\":\"Naked Single\",\"least_frequent_technique\":\"Hidden Single Box\"}",
  "technique_counts_json": "{\"Hidden Single Box\":7,\"Naked Single\":44}",
  "deductions_json": "[...]"
}
```

---

## 2. List Saved Puzzles

**`GET /api/puzzles`**

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `rating` | string | Optional | Filter by difficulty rating (`Easy`, `Medium`, `Hard`, `Expert`) |
| `limit` | integer | Optional | Max records to return (Default: `10`) |
| `offset` | integer | Optional | Record offset for pagination (Default: `0`) |

### Example Request
```bash
curl "http://localhost:8080/api/puzzles?rating=Hard&limit=5"
```

---

## 3. Get Puzzle by ID

**`GET /api/puzzles/:id`**

### Example Request
```bash
curl "http://localhost:8080/api/puzzles/10"
```

---

## 4. SVG Vector Graphics Endpoints

### 4.1 Sudoku Board Vector Graphic (`GET /api/puzzles/:id/svg`)
Returns a vector SVG graphic (`image/svg+xml`) of the $9 \times 9$ Sudoku grid:

```bash
curl -H "Accept: image/svg+xml" "http://localhost:8080/api/puzzles/10/svg" > board.svg
```

### 4.2 Candidate Elimination Heatmap (`GET /api/puzzles/:id/heatmap.svg`)
Returns an elimination density heatmap SVG showing constraint intensity across all cells:

```bash
curl -H "Accept: image/svg+xml" "http://localhost:8080/api/puzzles/10/heatmap.svg" > heatmap.svg
```

### 4.3 Difficulty Trajectory Graph (`GET /api/puzzles/:id/trajectory.svg`)
Returns a step-by-step difficulty trajectory line chart SVG plotting step score jumps and suddenness spikes:

```bash
curl -H "Accept: image/svg+xml" "http://localhost:8080/api/puzzles/10/trajectory.svg" > trajectory.svg
```
