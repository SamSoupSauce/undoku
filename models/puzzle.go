package models

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// Board represents a 9x9 Sudoku grid matrix
type Board [9][9]int

type EliminationReasons struct {
	CrossHorizontal int `json:"cross_horizontal"` // Row constraints
	CrossVertical   int `json:"cross_vertical"`   // Column constraints
	Box3x3          int `json:"box_3x3"`          // 3x3 Square constraints
}

func (er EliminationReasons) Total() int {
	return er.CrossHorizontal + er.CrossVertical + er.Box3x3
}

type Deduction struct {
	Row         int                `json:"row"`
	Col         int                `json:"col"`
	Val         int                `json:"val"`
	Technique   string             `json:"technique"`
	Reasons     EliminationReasons `json:"reasons"`
	StepScore   float64            `json:"step_score"`
	Description string             `json:"description"`
}

type AdvancedMetrics struct {
	MinStepScore           float64 `json:"min_step_score"`
	MaxStepScore           float64 `json:"max_step_score"`
	ScoreSpread            float64 `json:"score_spread"`
	ScoreVariance          float64 `json:"score_variance"`
	ScoreStdDev            float64 `json:"score_std_dev"`
	ScoreDivergence        float64 `json:"score_divergence"` // Mean Absolute Deviation from mean
	Suddenness             float64 `json:"suddenness"`        // Max adjacent step-to-step score delta
	MaxStreak              int     `json:"max_streak"`        // Longest consecutive technique streak
	MaxStreakTechnique     string  `json:"max_streak_technique"`
	MostFrequentTechnique  string  `json:"most_frequent_technique"`
	LeastFrequentTechnique string  `json:"least_frequent_technique"`
}

type DifficultyReport struct {
	TotalScore      float64            `json:"total_score"`
	Rating          string             `json:"rating"`
	ReasonCounts    EliminationReasons `json:"reason_counts"`
	TechniqueCounts map[string]int     `json:"technique_counts"`
	Metrics         AdvancedMetrics    `json:"advanced_metrics"`
	StepDeductions  []Deduction        `json:"step_deductions"`
}

// CalculateMetrics computes analytical metrics (spread, variance, divergence, streaks, suddenness, frequency)
func (report *DifficultyReport) CalculateMetrics() {
	n := len(report.StepDeductions)
	if n == 0 {
		return
	}

	scores := make([]float64, n)
	var sum float64
	minScore := report.StepDeductions[0].StepScore
	maxScore := report.StepDeductions[0].StepScore

	for i, d := range report.StepDeductions {
		s := d.StepScore
		scores[i] = s
		sum += s
		if s < minScore {
			minScore = s
		}
		if s > maxScore {
			maxScore = s
		}
	}

	mean := sum / float64(n)

	// Variance, Standard Deviation, and Divergence (MAD)
	var varSum, madSum float64
	for _, s := range scores {
		diff := s - mean
		varSum += diff * diff
		madSum += math.Abs(diff)
	}

	variance := varSum / float64(n)
	stdDev := math.Sqrt(variance)
	mad := madSum / float64(n)

	// Suddenness (Max adjacent step score delta)
	var maxSuddenness float64
	for i := 0; i < n-1; i++ {
		delta := math.Abs(scores[i+1] - scores[i])
		if delta > maxSuddenness {
			maxSuddenness = delta
		}
	}

	// Streaks (Consecutive identical techniques)
	currentStreak := 1
	maxStreak := 1
	maxStreakTech := report.StepDeductions[0].Technique

	for i := 1; i < n; i++ {
		if report.StepDeductions[i].Technique == report.StepDeductions[i-1].Technique {
			currentStreak++
			if currentStreak > maxStreak {
				maxStreak = currentStreak
				maxStreakTech = report.StepDeductions[i].Technique
			}
		} else {
			currentStreak = 1
		}
	}

	// Most & Least Frequent Technique
	var mostFreqTech, leastFreqTech string
	mostCount := -1
	leastCount := math.MaxInt

	for tech, count := range report.TechniqueCounts {
		if count > mostCount {
			mostCount = count
			mostFreqTech = tech
		}
		if count < leastCount {
			leastCount = count
			leastFreqTech = tech
		}
	}

	report.Metrics = AdvancedMetrics{
		MinStepScore:           minScore,
		MaxStepScore:           maxScore,
		ScoreSpread:            maxScore - minScore,
		ScoreVariance:          variance,
		ScoreStdDev:            stdDev,
		ScoreDivergence:        mad,
		Suddenness:             maxSuddenness,
		MaxStreak:              maxStreak,
		MaxStreakTechnique:     maxStreakTech,
		MostFrequentTechnique:  mostFreqTech,
		LeastFrequentTechnique: leastFreqTech,
	}
}

// PuzzleRecord is the GORM PostgreSQL database model for storing puzzles and difficulty metrics
type PuzzleRecord struct {
	gorm.Model
	Solution               string  `gorm:"type:varchar(81);not null" json:"solution"`
	BoardState             string  `gorm:"type:varchar(81);not null;index" json:"board_state"`
	BlanksCount            int     `gorm:"not null" json:"blanks_count"`
	DifficultyRating       string  `gorm:"type:varchar(32);not null;index" json:"difficulty_rating"`
	TotalScore             float64 `gorm:"type:numeric(10,2);not null" json:"total_score"`
	ScoreSpread            float64 `gorm:"type:numeric(10,2);not null" json:"score_spread"`
	ScoreVariance          float64 `gorm:"type:numeric(10,2);not null" json:"score_variance"`
	Suddenness             float64 `gorm:"type:numeric(10,2);not null" json:"suddenness"`
	MaxStreak              int     `gorm:"not null" json:"max_streak"`
	CrossHorizontalReasons int     `gorm:"not null" json:"cross_horizontal_reasons"`
	CrossVerticalReasons   int     `gorm:"not null" json:"cross_vertical_reasons"`
	Box3x3Reasons          int     `gorm:"not null" json:"box_3x3_reasons"`
	TotalReasons           int     `gorm:"not null" json:"total_reasons"`
	MetricsJSON            string  `gorm:"type:text" json:"metrics_json"`
	TechniqueCountsJSON    string  `gorm:"type:text" json:"technique_counts_json"`
	DeductionsJSON         string  `gorm:"type:text" json:"deductions_json"`
}

// Helper methods to convert between Board matrix and string representation
func BoardToString(b Board) string {
	var sb strings.Builder
	sb.Grow(81)
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			if b[r][c] == 0 {
				sb.WriteByte('.')
			} else {
				sb.WriteString(strconv.Itoa(b[r][c]))
			}
		}
	}
	return sb.String()
}

func StringToBoard(s string) (Board, error) {
	var b Board
	if len(s) != 81 {
		return b, fmt.Errorf("invalid string length %d, expected 81", len(s))
	}
	for i := 0; i < 81; i++ {
		r, c := i/9, i%9
		ch := s[i]
		if ch == '.' || ch == '0' {
			b[r][c] = 0
		} else if ch >= '1' && ch <= '9' {
			b[r][c] = int(ch - '0')
		} else {
			return b, fmt.Errorf("invalid character '%c' at position %d", ch, i)
		}
	}
	return b, nil
}

// CreateRecord converts full solution, carved puzzle, and difficulty report to GORM PuzzleRecord
func CreateRecord(full Board, puzzle Board, report DifficultyReport) (PuzzleRecord, error) {
	report.CalculateMetrics()

	techJSON, err := json.Marshal(report.TechniqueCounts)
	if err != nil {
		return PuzzleRecord{}, fmt.Errorf("failed to marshal technique counts: %w", err)
	}

	metricsJSON, err := json.Marshal(report.Metrics)
	if err != nil {
		return PuzzleRecord{}, fmt.Errorf("failed to marshal metrics: %w", err)
	}

	deductionsJSON, err := json.Marshal(report.StepDeductions)
	if err != nil {
		return PuzzleRecord{}, fmt.Errorf("failed to marshal step deductions: %w", err)
	}

	blanks := 0
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			if puzzle[r][c] == 0 {
				blanks++
			}
		}
	}

	return PuzzleRecord{
		Solution:               BoardToString(full),
		BoardState:             BoardToString(puzzle),
		BlanksCount:            blanks,
		DifficultyRating:       report.Rating,
		TotalScore:             report.TotalScore,
		ScoreSpread:            report.Metrics.ScoreSpread,
		ScoreVariance:          report.Metrics.ScoreVariance,
		Suddenness:             report.Metrics.Suddenness,
		MaxStreak:              report.Metrics.MaxStreak,
		CrossHorizontalReasons: report.ReasonCounts.CrossHorizontal,
		CrossVerticalReasons:   report.ReasonCounts.CrossVertical,
		Box3x3Reasons:          report.ReasonCounts.Box3x3,
		TotalReasons:           report.ReasonCounts.Total(),
		MetricsJSON:            string(metricsJSON),
		TechniqueCountsJSON:    string(techJSON),
		DeductionsJSON:         string(deductionsJSON),
	}, nil
}

// ToDifficultyReport parses JSON fields in PuzzleRecord back into DifficultyReport
func (rec *PuzzleRecord) ToDifficultyReport() (DifficultyReport, error) {
	var techCounts map[string]int
	if rec.TechniqueCountsJSON != "" {
		if err := json.Unmarshal([]byte(rec.TechniqueCountsJSON), &techCounts); err != nil {
			return DifficultyReport{}, fmt.Errorf("failed to unmarshal technique counts: %w", err)
		}
	}

	var metrics AdvancedMetrics
	if rec.MetricsJSON != "" {
		if err := json.Unmarshal([]byte(rec.MetricsJSON), &metrics); err != nil {
			return DifficultyReport{}, fmt.Errorf("failed to unmarshal metrics: %w", err)
		}
	}

	var deductions []Deduction
	if rec.DeductionsJSON != "" {
		if err := json.Unmarshal([]byte(rec.DeductionsJSON), &deductions); err != nil {
			return DifficultyReport{}, fmt.Errorf("failed to unmarshal step deductions: %w", err)
		}
	}

	return DifficultyReport{
		TotalScore: rec.TotalScore,
		Rating:     rec.DifficultyRating,
		ReasonCounts: EliminationReasons{
			CrossHorizontal: rec.CrossHorizontalReasons,
			CrossVertical:   rec.CrossVerticalReasons,
			Box3x3:          rec.Box3x3Reasons,
		},
		TechniqueCounts: techCounts,
		Metrics:         metrics,
		StepDeductions:  deductions,
	}, nil
}
