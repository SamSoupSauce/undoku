package render

import (
	"strings"
	"testing"

	"samuel-meyers.com/undoku/models"
)

func TestRenderBoardSVG(t *testing.T) {
	var board models.Board
	board[0][0] = 5
	board[8][8] = 9

	opts := DefaultOptions()
	svg := RenderBoardSVG(board, opts)

	if !strings.HasPrefix(svg, "<svg") || !strings.HasSuffix(svg, "</svg>") {
		t.Errorf("expected valid SVG document, got string without svg tags")
	}

	if !strings.Contains(svg, ">5<") || !strings.Contains(svg, ">9<") {
		t.Errorf("expected rendered text values in SVG output")
	}
}

func TestRenderHeatmapSVG(t *testing.T) {
	var board models.Board
	var report models.DifficultyReport
	report.StepDeductions = []models.Deduction{
		{Row: 0, Col: 0, Reasons: models.EliminationReasons{CrossHorizontal: 3, CrossVertical: 4, Box3x3: 5}},
	}

	svg := RenderHeatmapSVG(board, report, DefaultOptions())

	if !strings.HasPrefix(svg, "<svg") || !strings.HasSuffix(svg, "</svg>") {
		t.Errorf("expected valid SVG heatmap document")
	}
}

func TestRenderTrajectorySVG(t *testing.T) {
	var report models.DifficultyReport
	report.Rating = "Medium"
	report.TotalScore = 65.4
	report.StepDeductions = []models.Deduction{
		{StepScore: 1.5},
		{StepScore: 1.8},
		{StepScore: 2.1},
	}
	report.CalculateMetrics()

	svg := RenderTrajectorySVG(report, 600, 240)

	if !strings.Contains(svg, "<polyline") {
		t.Errorf("expected polyline element in trajectory SVG output")
	}
}

func TestRenderAnimatedSVG(t *testing.T) {
	var board models.Board
	var report models.DifficultyReport
	report.StepDeductions = []models.Deduction{
		{Row: 0, Col: 0, Val: 5, Technique: "Naked Single", StepScore: 1.5, Description: "Naked Single test"},
	}

	svg := RenderAnimatedSVG(board, report, DefaultOptions())

	if !strings.Contains(svg, "@keyframes") || !strings.Contains(svg, ".step-val-0") {
		t.Errorf("expected CSS keyframes in animated SVG output")
	}
}

func TestSaveAnimatedSVG(t *testing.T) {
	var board models.Board
	var report models.DifficultyReport
	report.StepDeductions = []models.Deduction{
		{Row: 0, Col: 0, Val: 5, Technique: "Naked Single", StepScore: 1.5, Description: "Naked Single test"},
	}

	path, err := SaveAnimatedSVG(board, report, "test_exports", "test_anim.svg")
	if err != nil {
		t.Fatalf("SaveAnimatedSVG returned error: %v", err)
	}

	if path == "" {
		t.Errorf("expected non-empty file path from SaveAnimatedSVG")
	}
}
