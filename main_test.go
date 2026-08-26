package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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
	if blanks < 28 || blanks > 64 {
		t.Errorf("expected blanks between 28 and 64, got %d", blanks)
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

func TestLogicalAssertionsComplexity(t *testing.T) {
	s := NewSudoku()
	var full models.Board
	s.FillGrid(&full)

	puzzle, report := s.CarveWithTargetDifficulty(full, "hard", 0)

	if report.Metrics.TotalAssertions <= 0 {
		t.Errorf("expected TotalAssertions > 0, got %d", report.Metrics.TotalAssertions)
	}
	if report.Metrics.MaxStepAssertions <= 0 {
		t.Errorf("expected MaxStepAssertions > 0, got %d", report.Metrics.MaxStepAssertions)
	}
	if report.Metrics.AvgAssertionsPerStep <= 0 {
		t.Errorf("expected AvgAssertionsPerStep > 0, got %f", report.Metrics.AvgAssertionsPerStep)
	}
	if report.Metrics.AssertionDensity <= 0 {
		t.Errorf("expected AssertionDensity > 0, got %f", report.Metrics.AssertionDensity)
	}
	if report.Metrics.ComplexityRating <= 0 {
		t.Errorf("expected ComplexityRating > 0, got %f", report.Metrics.ComplexityRating)
	}

	// Verify each deduction has non-zero assertions
	for i, d := range report.StepDeductions {
		if d.Assertions <= 0 {
			t.Errorf("deduction #%d (%s) has invalid assertions: %d", i, d.Technique, d.Assertions)
		}
	}

	_ = puzzle
}

func TestGranularDifficultyMetricsList(t *testing.T) {
	s := NewSudoku()
	var full models.Board
	s.FillGrid(&full)

	puzzle, report := s.CarveWithTargetDifficulty(full, "easy", 0)
	report.CalculateMetricsWithBoard(&puzzle)

	if len(report.MetricsList) == 0 {
		t.Fatalf("expected non-empty MetricsList")
	}

	categoriesFound := make(map[string]bool)
	keysFound := make(map[string]bool)

	for _, item := range report.MetricsList {
		if item.Key == "" {
			t.Errorf("metric item missing key: %+v", item)
		}
		if item.Name == "" {
			t.Errorf("metric item missing name: %+v", item)
		}
		if item.Category == "" {
			t.Errorf("metric item missing category: %+v", item)
		}
		if item.Formatted == "" {
			t.Errorf("metric item missing formatted string: %+v", item)
		}
		if item.Description == "" {
			t.Errorf("metric item missing description: %+v", item)
		}

		categoriesFound[item.Category] = true
		keysFound[item.Key] = true
	}

	expectedCategories := []string{
		"Complexity & Assertions",
		"Difficulty & Scoring",
		"Statistical Trajectory",
		"Candidate Search & Entropy",
		"Board Geometry & Topology",
		"Technique Composition",
		"Constraint Analysis",
	}

	for _, cat := range expectedCategories {
		if !categoriesFound[cat] {
			t.Errorf("expected category %q in MetricsList", cat)
		}
	}

	expectedKeys := []string{
		"complexity_total_assertions",
		"complexity_max_step_assertions",
		"complexity_avg_assertions_per_step",
		"complexity_assertion_density",
		"complexity_rating",
		"score_total",
		"score_composite",
		"difficulty_rating",
		"granular_tier",
		"trajectory_min_step_score",
		"trajectory_max_step_score",
		"trajectory_score_variance",
		"trajectory_suddenness",
		"trajectory_bottleneck_step",
		"trajectory_pacing_slope",
		"topology_clue_symmetry",
		"topology_distribution_variance",
		"tech_diversity",
	}

	for _, key := range expectedKeys {
		if !keysFound[key] {
			t.Errorf("expected key %q in MetricsList", key)
		}
	}
}

func TestDeterministicEvaluation(t *testing.T) {
	s := NewSudoku()
	var full models.Board
	s.FillGrid(&full)

	puzzle, _ := s.CarveWithTargetDifficulty(full, "medium", 35)

	// Run solve & evaluation 5 separate times on the same puzzle
	rep1, ok1 := s.SolveAndEvaluate(puzzle)
	if !ok1 {
		t.Fatal("SolveAndEvaluate rep1 failed")
	}

	for iter := 2; iter <= 5; iter++ {
		repN, okN := s.SolveAndEvaluate(puzzle)
		if !okN {
			t.Fatalf("SolveAndEvaluate iter %d failed", iter)
		}

		if repN.TotalScore != rep1.TotalScore {
			t.Errorf("iter %d TotalScore mismatch: got %f, expected %f", iter, repN.TotalScore, rep1.TotalScore)
		}
		if repN.CompositeScore != rep1.CompositeScore {
			t.Errorf("iter %d CompositeScore mismatch: got %f, expected %f", iter, repN.CompositeScore, rep1.CompositeScore)
		}
		if repN.Rating != rep1.Rating {
			t.Errorf("iter %d Rating mismatch: got %s, expected %s", iter, repN.Rating, rep1.Rating)
		}
		if repN.GranularTier != rep1.GranularTier {
			t.Errorf("iter %d GranularTier mismatch: got %s, expected %s", iter, repN.GranularTier, rep1.GranularTier)
		}
		if repN.Metrics.TotalAssertions != rep1.Metrics.TotalAssertions {
			t.Errorf("iter %d TotalAssertions mismatch: got %d, expected %d", iter, repN.Metrics.TotalAssertions, rep1.Metrics.TotalAssertions)
		}
		if len(repN.StepDeductions) != len(rep1.StepDeductions) {
			t.Fatalf("iter %d StepDeductions length mismatch: got %d, expected %d", iter, len(repN.StepDeductions), len(rep1.StepDeductions))
		}
		for stepIdx := range rep1.StepDeductions {
			d1 := rep1.StepDeductions[stepIdx]
			dN := repN.StepDeductions[stepIdx]
			if d1.Row != dN.Row || d1.Col != dN.Col || d1.Val != dN.Val || d1.Assertions != dN.Assertions || d1.StepScore != dN.StepScore {
				t.Errorf("iter %d deduction #%d mismatch: %+v vs %+v", iter, stepIdx, dN, d1)
			}
		}
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

	if record.TotalAssertions <= 0 {
		t.Errorf("expected record.TotalAssertions > 0, got %d", record.TotalAssertions)
	}
	if record.GranularTier == "" {
		t.Errorf("expected non-empty record.GranularTier")
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
	if fetched.TotalAssertions != record.TotalAssertions {
		t.Errorf("expected total assertions %d, got %d", record.TotalAssertions, fetched.TotalAssertions)
	}
	if fetched.GranularTier != record.GranularTier {
		t.Errorf("expected granular tier %s, got %s", record.GranularTier, fetched.GranularTier)
	}

	reparsedReport, err := fetched.ToDifficultyReport()
	if err != nil {
		t.Fatalf("ToDifficultyReport failed: %v", err)
	}
	if len(reparsedReport.MetricsList) == 0 {
		t.Errorf("expected non-empty MetricsList on reparsed report")
	}
}

func TestHandleHomepage(t *testing.T) {
	store, err := storage.NewSQLiteStorage(":memory:")
	if err != nil {
		t.Fatalf("failed to create memory sqlite storage: %v", err)
	}
	server := NewServer(store)

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	server.handleHomepage(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "text/html") {
		t.Errorf("expected text/html content-type, got %s", contentType)
	}

	body := w.Body.String()
	if !strings.Contains(body, "Web Canvas") {
		t.Errorf("expected body to contain 'Web Canvas'")
	}
}

func TestAPIPuzzleGenerateEndpoint(t *testing.T) {
	store, err := storage.NewSQLiteStorage(":memory:")
	if err != nil {
		t.Fatalf("failed to create memory sqlite storage: %v", err)
	}
	server := NewServer(store)

	req := httptest.NewRequest("POST", "/api/puzzles/generate?difficulty=hard&blanks=45", nil)
	w := httptest.NewRecorder()
	server.handleGenerateAndSave(w, req)

	resp := w.Result()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}

	var rec models.PuzzleRecord
	if err := json.NewDecoder(w.Body).Decode(&rec); err != nil {
		t.Fatalf("failed to decode response JSON: %v", err)
	}

	if rec.ID == 0 {
		t.Errorf("expected non-zero ID")
	}
	if rec.TotalAssertions <= 0 {
		t.Errorf("expected positive TotalAssertions, got %d", rec.TotalAssertions)
	}
	if rec.GranularTier == "" {
		t.Errorf("expected non-empty GranularTier")
	}
	if rec.MetricsListJSON == "" {
		t.Errorf("expected non-empty MetricsListJSON")
	}
}

