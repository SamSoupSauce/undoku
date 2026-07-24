---
title: REST API Specification
description: Complete endpoint documentation for Undoku REST API.
---

## Endpoint Summary

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/puzzles/generate` | Generate puzzle, calculate difficulty, save to DB |
| `GET` | `/api/puzzles` | List saved puzzles with rating & pagination filters |
| `GET` | `/api/puzzles/:id` | Get single puzzle record by primary key ID |

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
  "cross_horizontal_reasons": 298,
  "cross_vertical_reasons": 312,
  "box_3x3_reasons": 284,
  "total_reasons": 894,
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
