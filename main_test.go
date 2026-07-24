package main

import (
	"testing"

	"samuel-meyers.com/undoku/models"
	"samuel-meyers.com/undoku/storage"
)

func TestFastRand(t *testing.T) {
	rng := NewFastRand()
	perm := rng.Perm(9)
	if len(perm) != 9 {
		t.Fatalf("expected perm length 9, got %d", len(perm))
	}

	seen := make(map[int]bool)
	for _, v := range perm {
		if v < 0 || v >= 9 {
			t.Errorf("perm element %d out of bounds [0, 8]", v)
		}
		seen[v] = true
	}
	if len(seen) != 9 {
		t.Errorf("expected 9 unique elements in perm")
	}
}

func TestCarveWithTargetDifficulty(t *testing.T) {
	s := NewSudoku()
	var full models.Board
	if !s.FillGrid(&full) {
		t.Fatal("FillGrid failed")
	}

	puzzle, report := s.CarveWithTargetDifficulty(full, "easy", 0)
	if report.Rating == "" {
		t.Errorf("expected non-empty difficulty rating")
	}
	if report.TotalScore <= 0 {
		t.Errorf("expected positive total score")
	}

	blanks := 0
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			if puzzle[r][c] == 0 {
				blanks++
			}
		}
	}
	if blanks < 28 || blanks > 57 {
		t.Errorf("expected blanks between 28 and 57, got %d", blanks)
	}
}

func TestAdvancedMetrics(t *testing.T) {
	s := NewSudoku()
	var full models.Board
	s.FillGrid(&full)

	_, report := s.CarveWithTargetDifficulty(full, "medium", 0)

	if report.Metrics.MinStepScore <= 0 {
		t.Errorf("expected positive MinStepScore, got %f", report.Metrics.MinStepScore)
	}
	if report.Metrics.MaxStepScore < report.Metrics.MinStepScore {
		t.Errorf("MaxStepScore (%f) should be >= MinStepScore (%f)", report.Metrics.MaxStepScore, report.Metrics.MinStepScore)
	}
	if report.Metrics.ScoreSpread < 0 {
		t.Errorf("expected non-negative ScoreSpread, got %f", report.Metrics.ScoreSpread)
	}
	if report.Metrics.ScoreVariance < 0 {
		t.Errorf("expected non-negative ScoreVariance, got %f", report.Metrics.ScoreVariance)
	}
	if report.Metrics.MaxStreak < 1 {
		t.Errorf("expected MaxStreak >= 1, got %d", report.Metrics.MaxStreak)
	}
}

func TestGORMStorageCRUD(t *testing.T) {
	store, err := storage.NewSQLiteStorage(":memory:")
	if err != nil {
		t.Fatalf("failed to create memory sqlite storage: %v", err)
	}

	s := NewSudoku()
	var full models.Board
	s.FillGrid(&full)

	puzzle, report := s.CarveWithTargetDifficulty(full, "medium", 0)
	record, err := models.CreateRecord(full, puzzle, report)
	if err != nil {
		t.Fatalf("CreateRecord failed: %v", err)
	}

	if err := store.SavePuzzle(&record); err != nil {
		t.Fatalf("SavePuzzle failed: %v", err)
	}

	fetched, err := store.GetPuzzleByID(record.ID)
	if err != nil {
		t.Fatalf("GetPuzzleByID failed: %v", err)
	}

	if fetched.DifficultyRating != record.DifficultyRating {
		t.Errorf("expected difficulty rating %s, got %s", record.DifficultyRating, fetched.DifficultyRating)
	}
}
