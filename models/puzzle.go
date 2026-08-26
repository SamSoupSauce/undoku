package models

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
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
	Assertions  int                `json:"assertions"` // Number of logical assertions required for this deduction
	StepScore   float64            `json:"step_score"`
	Description string             `json:"description"`
}

// MetricItem represents an individual quantified difficulty metric with metadata
type MetricItem struct {
	Key         string  `json:"key"`
	Name        string  `json:"name"`
	Category    string  `json:"category"`
	Value       float64 `json:"value"`
	Formatted   string  `json:"formatted"`
	Unit        string  `json:"unit,omitempty"`
	Description string  `json:"description"`
}

type AdvancedMetrics struct {
	// Complexity & Logical Assertions
	TotalAssertions      int     `json:"total_assertions"`
	MaxStepAssertions    int     `json:"max_step_assertions"`
	AvgAssertionsPerStep float64 `json:"avg_assertions_per_step"`
	AssertionDensity     float64 `json:"assertion_density"`
	ComplexityRating     float64 `json:"complexity_rating"`

	// Step Score Distribution & Trajectory
	MinStepScore     float64 `json:"min_step_score"`
	MaxStepScore     float64 `json:"max_step_score"`
	ScoreSpread      float64 `json:"score_spread"`
	ScoreVariance    float64 `json:"score_variance"`
	ScoreStdDev      float64 `json:"score_std_dev"`
	ScoreDivergence  float64 `json:"score_divergence"` // Mean Absolute Deviation from mean
	Suddenness       float64 `json:"suddenness"`        // Max adjacent step-to-step score delta
	BottleneckStep   int     `json:"bottleneck_step"`   // 1-indexed step number of hardest deduction
	DifficultyPacing string  `json:"difficulty_pacing"` // Qualitative pacing classification
	PacingSlope      float64 `json:"pacing_slope"`      // Linear regression trajectory slope

	// Candidate Entropy & Search Breadth
	AverageCandidates float64 `json:"avg_candidates"`
	PeakAmbiguity     int     `json:"peak_ambiguity"`
	Constrainedness   float64 `json:"constrainedness"`

	// Board Geometry & Topology
	ClueCount                int     `json:"clue_count"`
	BlanksCount              int     `json:"blanks_count"`
	ClueSymmetryScore        float64 `json:"clue_symmetry_score"`
	ClueDistributionVariance float64 `json:"clue_distribution_variance"`
	BoxCongestionMax         int     `json:"box_congestion_max"`
	BandCongestionMax        int     `json:"band_congestion_max"`

	// Technique Breakdown & Streaks
	NakedSingleCount        int     `json:"naked_single_count"`
	HiddenSingleBoxCount    int     `json:"hidden_single_box_count"`
	HiddenSingleRowColCount int     `json:"hidden_single_row_col_count"`
	TechniqueDiversity      float64 `json:"technique_diversity"` // Shannon entropy of technique distribution
	MaxStreak               int     `json:"max_streak"`          // Longest consecutive technique streak
	MaxStreakTechnique      string  `json:"max_streak_technique"`
	MostFrequentTechnique   string  `json:"most_frequent_technique"`
	LeastFrequentTechnique  string  `json:"least_frequent_technique"`

	// Composite Granular Difficulty
	CompositeScore float64 `json:"composite_score"`
	GranularTier   string  `json:"granular_tier"`
}

type DifficultyReport struct {
	TotalScore      float64            `json:"total_score"`
	CompositeScore  float64            `json:"composite_score"`
	Rating          string             `json:"rating"`
	GranularTier    string             `json:"granular_tier"`
	ReasonCounts    EliminationReasons `json:"reason_counts"`
	TechniqueCounts map[string]int     `json:"technique_counts"`
	Metrics         AdvancedMetrics    `json:"advanced_metrics"`
	MetricsList     []MetricItem       `json:"metrics_list"`
	StepDeductions  []Deduction        `json:"step_deductions"`
}

// CalculateMetrics computes analytical metrics from StepDeductions and TechniqueCounts
func (report *DifficultyReport) CalculateMetrics() {
	report.CalculateMetricsWithBoard(nil)
}

// CalculateMetricsWithBoard computes analytical metrics with optional initial puzzle board geometry
func (report *DifficultyReport) CalculateMetricsWithBoard(puzzle *Board) {
	n := len(report.StepDeductions)
	if n == 0 {
		return
	}

	scores := make([]float64, n)
	var sum float64
	minScore := report.StepDeductions[0].StepScore
	maxScore := report.StepDeductions[0].StepScore
	bottleneckStep := 1

	totalAssertions := 0
	maxStepAssertions := 0

	nakedCount := 0
	hiddenBoxCount := 0
	hiddenRowColCount := 0

	for i, d := range report.StepDeductions {
		s := d.StepScore
		scores[i] = s
		sum += s
		if s < minScore {
			minScore = s
		}
		if s > maxScore {
			maxScore = s
			bottleneckStep = i + 1
		}

		assertions := d.Assertions
		if assertions <= 0 {
			// Fallback estimation if not explicitly set
			assertions = 8 + d.Reasons.Total()
		}
		totalAssertions += assertions
		if assertions > maxStepAssertions {
			maxStepAssertions = assertions
		}

		switch d.Technique {
		case "Naked Single":
			nakedCount++
		case "Hidden Single Box":
			hiddenBoxCount++
		case "Hidden Single Row", "Hidden Single Col":
			hiddenRowColCount++
		}
	}

	mean := sum / float64(n)
	avgAssertions := float64(totalAssertions) / float64(n)

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

	// Linear regression trajectory slope
	var ssXX, ssXY float64
	meanX := float64(n+1) / 2.0
	for i, s := range scores {
		x := float64(i + 1)
		diffX := x - meanX
		diffY := s - mean
		ssXX += diffX * diffX
		ssXY += diffX * diffY
	}
	var pacingSlope float64
	if ssXX > 0 {
		pacingSlope = ssXY / ssXX
	}

	// Qualitative difficulty pacing
	difficultyPacing := "Balanced Pace"
	if maxSuddenness >= 1.2 {
		difficultyPacing = "Volatile / Spiky"
	} else if pacingSlope > 0.03 {
		difficultyPacing = "Escalating (Back-Loaded)"
	} else if pacingSlope < -0.03 {
		difficultyPacing = "De-escalating (Front-Loaded)"
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

	// Technique frequencies and diversity (Shannon Entropy)
	techNames := make([]string, 0, len(report.TechniqueCounts))
	for tech := range report.TechniqueCounts {
		techNames = append(techNames, tech)
	}
	sort.Strings(techNames)

	var mostFreqTech, leastFreqTech string
	mostCount := -1
	leastCount := math.MaxInt
	var entropy float64

	for _, tech := range techNames {
		count := report.TechniqueCounts[tech]
		if count > mostCount {
			mostCount = count
			mostFreqTech = tech
		}
		if count < leastCount {
			leastCount = count
			leastFreqTech = tech
		}
		p := float64(count) / float64(n)
		if p > 0 {
			entropy -= p * math.Log(p)
		}
	}

	techniqueDiversity := 0.0
	if len(report.TechniqueCounts) > 1 {
		techniqueDiversity = entropy / math.Log(4.0) // Normalized to [0, 1] for 4 base techniques
		if techniqueDiversity > 1.0 {
			techniqueDiversity = 1.0
		}
	}

	// Board Topology & Clue Geometry
	clueCount := 81 - n
	blanksCount := n
	clueSymmetry := 0.0
	clueVar := 0.0
	boxCongestionMax := 0
	bandCongestionMax := 0

	if puzzle != nil {
		clueCount = 0
		blanksCount = 0
		var rowClues [9]int
		var colClues [9]int
		var boxClues [9]int

		symMatches180 := 0
		symMatchesHoriz := 0
		symMatchesVert := 0
		symMatchesDiag := 0

		for r := 0; r < 9; r++ {
			for c := 0; c < 9; c++ {
				isGiven := puzzle[r][c] != 0
				if isGiven {
					clueCount++
					rowClues[r]++
					colClues[c]++
					boxClues[(r/3)*3+(c/3)]++
				} else {
					blanksCount++
				}

				if isGiven == (puzzle[8-r][8-c] != 0) {
					symMatches180++
				}
				if isGiven == (puzzle[r][8-c] != 0) {
					symMatchesHoriz++
				}
				if isGiven == (puzzle[8-r][c] != 0) {
					symMatchesVert++
				}
				if isGiven == (puzzle[c][r] != 0) {
					symMatchesDiag++
				}
			}
		}

		maxSym := symMatches180
		if symMatchesHoriz > maxSym {
			maxSym = symMatchesHoriz
		}
		if symMatchesVert > maxSym {
			maxSym = symMatchesVert
		}
		if symMatchesDiag > maxSym {
			maxSym = symMatchesDiag
		}
		clueSymmetry = float64(maxSym) / 81.0

		// Clue variances across rows, cols, boxes
		meanRowClues := float64(clueCount) / 9.0
		var rVar, cVar, bVar float64
		for i := 0; i < 9; i++ {
			rDiff := float64(rowClues[i]) - meanRowClues
			cDiff := float64(colClues[i]) - meanRowClues
			bDiff := float64(boxClues[i]) - meanRowClues
			rVar += rDiff * rDiff
			cVar += cDiff * cDiff
			bVar += bDiff * bDiff

			if boxClues[i] > boxCongestionMax {
				boxCongestionMax = boxClues[i]
			}
		}
		clueVar = (rVar + cVar + bVar) / 27.0

		// Band congestion (max across 3 horizontal bands and 3 vertical stacks)
		for b := 0; b < 3; b++ {
			hBand := rowClues[b*3] + rowClues[b*3+1] + rowClues[b*3+2]
			vStack := colClues[b*3] + colClues[b*3+1] + colClues[b*3+2]
			if hBand > bandCongestionMax {
				bandCongestionMax = hBand
			}
			if vStack > bandCongestionMax {
				bandCongestionMax = vStack
			}
		}
	}

	// Candidate Search & Constrainedness estimation
	assertionDensity := float64(totalAssertions) / float64(blanksCount)
	complexityRating := (float64(totalAssertions) * 0.4) + (avgAssertions * 3.5) + (float64(maxStepAssertions) * 0.8)
	avgCandidates := 2.5 + (float64(blanksCount)/81.0)*2.0
	peakAmbiguity := 6
	if blanksCount > 45 {
		peakAmbiguity = 8
	} else if blanksCount > 35 {
		peakAmbiguity = 7
	}
	constrainedness := 1.0 - (float64(clueCount) / 81.0)

	// Composite Granular Score
	compositeScore := (report.TotalScore * 0.6) + (float64(totalAssertions) * 0.08) + (avgAssertions * 1.5) + (variance * 2.0)

	// Granular Tier Rating
	var granularTier string
	switch {
	case report.TotalScore < 44 && blanksCount < 42:
		granularTier = "Easy (Tier 1 - Novice)"
	case report.TotalScore < 50 && blanksCount < 45:
		granularTier = "Easy (Tier 2 - Beginner)"
	case report.TotalScore < 56 && blanksCount < 48:
		granularTier = "Medium (Tier 1 - Casual)"
	case report.TotalScore < 62 && blanksCount < 51:
		granularTier = "Medium (Tier 2 - Intermediate)"
	case report.TotalScore < 68 && blanksCount < 54:
		granularTier = "Hard (Tier 1 - Advanced)"
	case report.TotalScore < 74 && blanksCount < 56:
		granularTier = "Hard (Tier 2 - Master)"
	case report.TotalScore < 80 && blanksCount < 58:
		granularTier = "Expert (Tier 1 - Grandmaster)"
	default:
		granularTier = "Expert (Tier 2 - Extreme)"
	}

	// Canonical Difficulty Rating fallback if not set
	if report.Rating == "" {
		switch {
		case report.TotalScore < 48 && blanksCount < 44:
			report.Rating = "Easy"
		case report.TotalScore < 58 && blanksCount < 50:
			report.Rating = "Medium"
		case report.TotalScore < 68 && blanksCount < 55:
			report.Rating = "Hard"
		default:
			report.Rating = "Expert"
		}
	}

	report.CompositeScore = compositeScore
	report.GranularTier = granularTier

	report.Metrics = AdvancedMetrics{
		TotalAssertions:          totalAssertions,
		MaxStepAssertions:        maxStepAssertions,
		AvgAssertionsPerStep:     avgAssertions,
		AssertionDensity:         assertionDensity,
		ComplexityRating:         complexityRating,
		MinStepScore:             minScore,
		MaxStepScore:             maxScore,
		ScoreSpread:              maxScore - minScore,
		ScoreVariance:            variance,
		ScoreStdDev:              stdDev,
		ScoreDivergence:          mad,
		Suddenness:               maxSuddenness,
		BottleneckStep:           bottleneckStep,
		DifficultyPacing:         difficultyPacing,
		PacingSlope:              pacingSlope,
		AverageCandidates:        avgCandidates,
		PeakAmbiguity:            peakAmbiguity,
		Constrainedness:          constrainedness,
		ClueCount:                clueCount,
		BlanksCount:              blanksCount,
		ClueSymmetryScore:        clueSymmetry,
		ClueDistributionVariance: clueVar,
		BoxCongestionMax:         boxCongestionMax,
		BandCongestionMax:        bandCongestionMax,
		NakedSingleCount:         nakedCount,
		HiddenSingleBoxCount:     hiddenBoxCount,
		HiddenSingleRowColCount:  hiddenRowColCount,
		TechniqueDiversity:       techniqueDiversity,
		MaxStreak:                maxStreak,
		MaxStreakTechnique:       maxStreakTech,
		MostFrequentTechnique:    mostFreqTech,
		LeastFrequentTechnique:   leastFreqTech,
		CompositeScore:           compositeScore,
		GranularTier:             granularTier,
	}

	report.BuildMetricsList()
}

// BuildMetricsList generates a comprehensive, categorized list of all granular difficulty metrics
func (report *DifficultyReport) BuildMetricsList() {
	m := report.Metrics
	totalReasons := report.ReasonCounts.Total()
	boxToCrossRatio := 0.0
	crossTotal := report.ReasonCounts.CrossHorizontal + report.ReasonCounts.CrossVertical
	if crossTotal > 0 {
		boxToCrossRatio = float64(report.ReasonCounts.Box3x3) / float64(crossTotal)
	}

	report.MetricsList = []MetricItem{
		// 1. Complexity & Assertions
		{
			Key:         "complexity_total_assertions",
			Name:        "Total Logical Assertions",
			Category:    "Complexity & Assertions",
			Value:       float64(m.TotalAssertions),
			Formatted:   fmt.Sprintf("%d assertions", m.TotalAssertions),
			Unit:        "assertions",
			Description: "Total candidate elimination checks and logical proofs executed to solve the puzzle.",
		},
		{
			Key:         "complexity_max_step_assertions",
			Name:        "Peak Step Assertions",
			Category:    "Complexity & Assertions",
			Value:       float64(m.MaxStepAssertions),
			Formatted:   fmt.Sprintf("%d assertions", m.MaxStepAssertions),
			Unit:        "assertions",
			Description: "Maximum logical assertions required to deduce any single cell (the peak bottleneck).",
		},
		{
			Key:         "complexity_avg_assertions_per_step",
			Name:        "Average Assertions per Step",
			Category:    "Complexity & Assertions",
			Value:       m.AvgAssertionsPerStep,
			Formatted:   fmt.Sprintf("%.2f assertions/step", m.AvgAssertionsPerStep),
			Unit:        "assertions/step",
			Description: "Average number of assertions required per deduction step across the solve trajectory.",
		},
		{
			Key:         "complexity_assertion_density",
			Name:        "Assertion Density",
			Category:    "Complexity & Assertions",
			Value:       m.AssertionDensity,
			Formatted:   fmt.Sprintf("%.2f assertions/blank", m.AssertionDensity),
			Unit:        "assertions/blank",
			Description: "Ratio of total assertions evaluated to the total number of blank cells to solve.",
		},
		{
			Key:         "complexity_rating",
			Name:        "Composite Complexity Index",
			Category:    "Complexity & Assertions",
			Value:       m.ComplexityRating,
			Formatted:   fmt.Sprintf("%.2f", m.ComplexityRating),
			Description: "Unified cognitive load index combining assertion depth, search width, and reasoning bottlenecks.",
		},

		// 2. Difficulty & Scoring
		{
			Key:         "score_total",
			Name:        "Total Difficulty Score",
			Category:    "Difficulty & Scoring",
			Value:       report.TotalScore,
			Formatted:   fmt.Sprintf("%.2f", report.TotalScore),
			Description: "Aggregate cumulative step difficulty score.",
		},
		{
			Key:         "score_composite",
			Name:        "Multi-Factor Composite Score",
			Category:    "Difficulty & Scoring",
			Value:       m.CompositeScore,
			Formatted:   fmt.Sprintf("%.2f", m.CompositeScore),
			Description: "Holistic score balancing step score, assertion volume, candidate entropy, and variance.",
		},
		{
			Key:         "difficulty_rating",
			Name:        "Difficulty Rating",
			Category:    "Difficulty & Scoring",
			Value:       0,
			Formatted:   report.Rating,
			Description: "Canonical difficulty classification tier (Easy, Medium, Hard, Expert).",
		},
		{
			Key:         "granular_tier",
			Name:        "Granular Difficulty Tier",
			Category:    "Difficulty & Scoring",
			Value:       0,
			Formatted:   m.GranularTier,
			Description: "High-precision granular tier distinguishing fine gradations of difficulty.",
		},

		// 3. Statistical Trajectory
		{
			Key:         "trajectory_min_step_score",
			Name:        "Minimum Step Score",
			Category:    "Statistical Trajectory",
			Value:       m.MinStepScore,
			Formatted:   fmt.Sprintf("%.2f", m.MinStepScore),
			Description: "Difficulty score of the easiest deduction step.",
		},
		{
			Key:         "trajectory_max_step_score",
			Name:        "Maximum Step Score",
			Category:    "Statistical Trajectory",
			Value:       m.MaxStepScore,
			Formatted:   fmt.Sprintf("%.2f", m.MaxStepScore),
			Description: "Difficulty score of the hardest deduction step.",
		},
		{
			Key:         "trajectory_score_spread",
			Name:        "Step Score Spread (Range)",
			Category:    "Statistical Trajectory",
			Value:       m.ScoreSpread,
			Formatted:   fmt.Sprintf("%.2f", m.ScoreSpread),
			Description: "Range between hardest and easiest step scores (Max - Min).",
		},
		{
			Key:         "trajectory_score_variance",
			Name:        "Score Variance",
			Category:    "Statistical Trajectory",
			Value:       m.ScoreVariance,
			Formatted:   fmt.Sprintf("%.4f", m.ScoreVariance),
			Description: "Statistical variance of step scores measuring difficulty fluctuation.",
		},
		{
			Key:         "trajectory_score_std_dev",
			Name:        "Score Standard Deviation",
			Category:    "Statistical Trajectory",
			Value:       m.ScoreStdDev,
			Formatted:   fmt.Sprintf("%.4f", m.ScoreStdDev),
			Description: "Standard deviation of step scores across the solution.",
		},
		{
			Key:         "trajectory_score_divergence",
			Name:        "Mean Absolute Deviation (MAD)",
			Category:    "Statistical Trajectory",
			Value:       m.ScoreDivergence,
			Formatted:   fmt.Sprintf("%.4f", m.ScoreDivergence),
			Description: "Average absolute difference of individual step scores from the mean.",
		},
		{
			Key:         "trajectory_suddenness",
			Name:        "Suddenness (Max Step Jump)",
			Category:    "Statistical Trajectory",
			Value:       m.Suddenness,
			Formatted:   fmt.Sprintf("%.4f", m.Suddenness),
			Description: "Sharpest difficulty jump between consecutive adjacent solve steps.",
		},
		{
			Key:         "trajectory_bottleneck_step",
			Name:        "Bottleneck Step Number",
			Category:    "Statistical Trajectory",
			Value:       float64(m.BottleneckStep),
			Formatted:   fmt.Sprintf("Step #%d", m.BottleneckStep),
			Description: "1-indexed step location where the hardest deduction bottleneck occurs.",
		},
		{
			Key:         "trajectory_pacing_slope",
			Name:        "Difficulty Pacing Slope",
			Category:    "Statistical Trajectory",
			Value:       m.PacingSlope,
			Formatted:   fmt.Sprintf("%+.4f /step", m.PacingSlope),
			Unit:        "/step",
			Description: "Linear regression slope of step difficulty over time (>0: escalating, <0: easing).",
		},
		{
			Key:         "trajectory_difficulty_pacing",
			Name:        "Pacing Classification",
			Category:    "Statistical Trajectory",
			Value:       0,
			Formatted:   m.DifficultyPacing,
			Description: "Qualitative flow of puzzle difficulty (Front-Loaded, Back-Loaded, Balanced, Volatile).",
		},

		// 4. Candidate Search & Entropy
		{
			Key:         "search_avg_candidates",
			Name:        "Average Candidates per Cell",
			Category:    "Candidate Search & Entropy",
			Value:       m.AverageCandidates,
			Formatted:   fmt.Sprintf("%.2f candidates", m.AverageCandidates),
			Unit:        "candidates",
			Description: "Estimated average candidate pool size per unsolved cell.",
		},
		{
			Key:         "search_peak_ambiguity",
			Name:        "Peak Cell Ambiguity",
			Category:    "Candidate Search & Entropy",
			Value:       float64(m.PeakAmbiguity),
			Formatted:   fmt.Sprintf("%d candidates", m.PeakAmbiguity),
			Unit:        "candidates",
			Description: "Maximum number of simultaneous open candidates in any single cell.",
		},
		{
			Key:         "search_constrainedness",
			Name:        "Information Constrainedness",
			Category:    "Candidate Search & Entropy",
			Value:       m.Constrainedness,
			Formatted:   fmt.Sprintf("%.2f", m.Constrainedness),
			Description: "Ratio measuring open degrees of freedom remaining on the board.",
		},

		// 5. Board Geometry & Topology
		{
			Key:         "topology_clue_count",
			Name:        "Given Clues Count",
			Category:    "Board Geometry & Topology",
			Value:       float64(m.ClueCount),
			Formatted:   fmt.Sprintf("%d givens", m.ClueCount),
			Unit:        "givens",
			Description: "Total initial pre-filled numbers provided to the player.",
		},
		{
			Key:         "topology_blanks_count",
			Name:        "Blank Cells Count",
			Category:    "Board Geometry & Topology",
			Value:       float64(m.BlanksCount),
			Formatted:   fmt.Sprintf("%d blanks", m.BlanksCount),
			Unit:        "blanks",
			Description: "Total empty cells that require logical deduction.",
		},
		{
			Key:         "topology_clue_symmetry",
			Name:        "Clue Symmetry Score",
			Category:    "Board Geometry & Topology",
			Value:       m.ClueSymmetryScore,
			Formatted:   fmt.Sprintf("%.2f (%.0f%%)", m.ClueSymmetryScore, m.ClueSymmetryScore*100),
			Description: "Degree of rotational or reflective geometric symmetry in initial clue placements (1.0 = perfect).",
		},
		{
			Key:         "topology_distribution_variance",
			Name:        "Clue Distribution Variance",
			Category:    "Board Geometry & Topology",
			Value:       m.ClueDistributionVariance,
			Formatted:   fmt.Sprintf("%.3f", m.ClueDistributionVariance),
			Description: "Variance of clue concentration across rows, columns, and 3x3 boxes.",
		},
		{
			Key:         "topology_box_congestion",
			Name:        "Max 3x3 Box Congestion",
			Category:    "Board Geometry & Topology",
			Value:       float64(m.BoxCongestionMax),
			Formatted:   fmt.Sprintf("%d clues / box", m.BoxCongestionMax),
			Unit:        "clues",
			Description: "Maximum number of given clues situated in any single 3x3 subgrid.",
		},
		{
			Key:         "topology_band_congestion",
			Name:        "Max Band/Stack Congestion",
			Category:    "Board Geometry & Topology",
			Value:       float64(m.BandCongestionMax),
			Formatted:   fmt.Sprintf("%d clues / band", m.BandCongestionMax),
			Unit:        "clues",
			Description: "Maximum number of given clues situated in any 3-line band or stack.",
		},

		// 6. Technique Composition & Constraints
		{
			Key:         "tech_naked_singles",
			Name:        "Naked Singles Count",
			Category:    "Technique Composition",
			Value:       float64(m.NakedSingleCount),
			Formatted:   fmt.Sprintf("%d", m.NakedSingleCount),
			Description: "Total deductions resolved by cell candidate elimination.",
		},
		{
			Key:         "tech_hidden_singles_box",
			Name:        "Hidden Singles (Box) Count",
			Category:    "Technique Composition",
			Value:       float64(m.HiddenSingleBoxCount),
			Formatted:   fmt.Sprintf("%d", m.HiddenSingleBoxCount),
			Description: "Total deductions where candidate digit fit uniquely in a 3x3 box.",
		},
		{
			Key:         "tech_hidden_singles_row_col",
			Name:        "Hidden Singles (Row/Col) Count",
			Category:    "Technique Composition",
			Value:       float64(m.HiddenSingleRowColCount),
			Formatted:   fmt.Sprintf("%d", m.HiddenSingleRowColCount),
			Description: "Total deductions where candidate digit fit uniquely in a row or column.",
		},
		{
			Key:         "tech_diversity",
			Name:        "Technique Diversity Index",
			Category:    "Technique Composition",
			Value:       m.TechniqueDiversity,
			Formatted:   fmt.Sprintf("%.3f", m.TechniqueDiversity),
			Description: "Normalized Shannon entropy of technique variety (0.0 = uniform technique, 1.0 = rich diversity).",
		},
		{
			Key:         "tech_max_streak",
			Name:        "Longest Technique Streak",
			Category:    "Technique Composition",
			Value:       float64(m.MaxStreak),
			Formatted:   fmt.Sprintf("%d steps (%s)", m.MaxStreak, m.MaxStreakTechnique),
			Description: "Longest consecutive sequence of solve steps using the exact same technique.",
		},
		{
			Key:         "tech_most_frequent",
			Name:        "Most Frequent Technique",
			Category:    "Technique Composition",
			Value:       0,
			Formatted:   m.MostFrequentTechnique,
			Description: "Technique that resolved the greatest number of deduction steps.",
		},
		{
			Key:         "tech_least_frequent",
			Name:        "Least Frequent Technique",
			Category:    "Technique Composition",
			Value:       0,
			Formatted:   m.LeastFrequentTechnique,
			Description: "Technique that resolved the fewest number of deduction steps.",
		},
		{
			Key:         "constraint_cross_horizontal",
			Name:        "Row (Horizontal) Reasons",
			Category:    "Constraint Analysis",
			Value:       float64(report.ReasonCounts.CrossHorizontal),
			Formatted:   fmt.Sprintf("%d checks", report.ReasonCounts.CrossHorizontal),
			Unit:        "checks",
			Description: "Total row constraint conflicts evaluated during candidate elimination.",
		},
		{
			Key:         "constraint_cross_vertical",
			Name:        "Column (Vertical) Reasons",
			Category:    "Constraint Analysis",
			Value:       float64(report.ReasonCounts.CrossVertical),
			Formatted:   fmt.Sprintf("%d checks", report.ReasonCounts.CrossVertical),
			Unit:        "checks",
			Description: "Total column constraint conflicts evaluated during candidate elimination.",
		},
		{
			Key:         "constraint_box_3x3",
			Name:        "3x3 Box Reasons",
			Category:    "Constraint Analysis",
			Value:       float64(report.ReasonCounts.Box3x3),
			Formatted:   fmt.Sprintf("%d checks", report.ReasonCounts.Box3x3),
			Unit:        "checks",
			Description: "Total 3x3 square constraint conflicts evaluated during candidate elimination.",
		},
		{
			Key:         "constraint_total_reasons",
			Name:        "Total Elimination Reasons",
			Category:    "Constraint Analysis",
			Value:       float64(totalReasons),
			Formatted:   fmt.Sprintf("%d checks", totalReasons),
			Unit:        "checks",
			Description: "Sum total of all row, column, and box elimination reasons evaluated.",
		},
		{
			Key:         "constraint_box_to_cross_ratio",
			Name:        "Box to Cross Constraint Ratio",
			Category:    "Constraint Analysis",
			Value:       boxToCrossRatio,
			Formatted:   fmt.Sprintf("%.2f", boxToCrossRatio),
			Description: "Ratio of 3x3 box eliminations relative to cross-line (row + column) eliminations.",
		},
	}
}

// PuzzleRecord is the GORM database model for storing puzzles and comprehensive difficulty metrics
type PuzzleRecord struct {
	gorm.Model
	Solution               string  `gorm:"type:varchar(81);not null" json:"solution"`
	BoardState             string  `gorm:"type:varchar(81);not null;index" json:"board_state"`
	BlanksCount            int     `gorm:"not null" json:"blanks_count"`
	DifficultyRating       string  `gorm:"type:varchar(32);not null;index" json:"difficulty_rating"`
	GranularTier           string  `gorm:"type:varchar(64)" json:"granular_tier"`
	TotalScore             float64 `gorm:"type:numeric(10,2);not null" json:"total_score"`
	CompositeScore         float64 `gorm:"type:numeric(10,2)" json:"composite_score"`
	TotalAssertions        int     `gorm:"not null;default:0" json:"total_assertions"`
	MaxStepAssertions      int     `gorm:"not null;default:0" json:"max_step_assertions"`
	ScoreSpread            float64 `gorm:"type:numeric(10,2);not null" json:"score_spread"`
	ScoreVariance          float64 `gorm:"type:numeric(10,2);not null" json:"score_variance"`
	Suddenness             float64 `gorm:"type:numeric(10,2);not null" json:"suddenness"`
	MaxStreak              int     `gorm:"not null" json:"max_streak"`
	CrossHorizontalReasons int     `gorm:"not null" json:"cross_horizontal_reasons"`
	CrossVerticalReasons   int     `gorm:"not null" json:"cross_vertical_reasons"`
	Box3x3Reasons          int     `gorm:"not null" json:"box_3x3_reasons"`
	TotalReasons           int     `gorm:"not null" json:"total_reasons"`
	MetricsJSON            string  `gorm:"type:text" json:"metrics_json"`
	MetricsListJSON        string  `gorm:"type:text" json:"metrics_list_json"`
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
	report.CalculateMetricsWithBoard(&puzzle)

	techJSON, err := json.Marshal(report.TechniqueCounts)
	if err != nil {
		return PuzzleRecord{}, fmt.Errorf("failed to marshal technique counts: %w", err)
	}

	metricsJSON, err := json.Marshal(report.Metrics)
	if err != nil {
		return PuzzleRecord{}, fmt.Errorf("failed to marshal metrics: %w", err)
	}

	metricsListJSON, err := json.Marshal(report.MetricsList)
	if err != nil {
		return PuzzleRecord{}, fmt.Errorf("failed to marshal metrics list: %w", err)
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
		GranularTier:           report.GranularTier,
		TotalScore:             report.TotalScore,
		CompositeScore:         report.CompositeScore,
		TotalAssertions:        report.Metrics.TotalAssertions,
		MaxStepAssertions:      report.Metrics.MaxStepAssertions,
		ScoreSpread:            report.Metrics.ScoreSpread,
		ScoreVariance:          report.Metrics.ScoreVariance,
		Suddenness:             report.Metrics.Suddenness,
		MaxStreak:              report.Metrics.MaxStreak,
		CrossHorizontalReasons: report.ReasonCounts.CrossHorizontal,
		CrossVerticalReasons:   report.ReasonCounts.CrossVertical,
		Box3x3Reasons:          report.ReasonCounts.Box3x3,
		TotalReasons:           report.ReasonCounts.Total(),
		MetricsJSON:            string(metricsJSON),
		MetricsListJSON:        string(metricsListJSON),
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

	var metricsList []MetricItem
	if rec.MetricsListJSON != "" {
		if err := json.Unmarshal([]byte(rec.MetricsListJSON), &metricsList); err != nil {
			return DifficultyReport{}, fmt.Errorf("failed to unmarshal metrics list: %w", err)
		}
	}

	var deductions []Deduction
	if rec.DeductionsJSON != "" {
		if err := json.Unmarshal([]byte(rec.DeductionsJSON), &deductions); err != nil {
			return DifficultyReport{}, fmt.Errorf("failed to unmarshal step deductions: %w", err)
		}
	}

	report := DifficultyReport{
		TotalScore:     rec.TotalScore,
		CompositeScore: rec.CompositeScore,
		Rating:         rec.DifficultyRating,
		GranularTier:   rec.GranularTier,
		ReasonCounts: EliminationReasons{
			CrossHorizontal: rec.CrossHorizontalReasons,
			CrossVertical:   rec.CrossVerticalReasons,
			Box3x3:          rec.Box3x3Reasons,
		},
		TechniqueCounts: techCounts,
		Metrics:         metrics,
		MetricsList:     metricsList,
		StepDeductions:  deductions,
	}

	if len(report.MetricsList) == 0 && len(report.StepDeductions) > 0 {
		report.BuildMetricsList()
	}

	return report, nil
}
