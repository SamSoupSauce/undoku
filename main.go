package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"samuel-meyers.com/undoku/models"
	"samuel-meyers.com/undoku/render"
	"samuel-meyers.com/undoku/storage"
)

//go:embed web/index.html
var indexHTML []byte

// FastRand provides ultra-fast xorshift64 PRNG without mutex lock overhead
type FastRand struct {
	state uint64
}

func NewFastRand() *FastRand {
	seed := uint64(time.Now().UnixNano()) ^ 0x9E3779B97F4A7C15
	if seed == 0 {
		seed = 1
	}
	return &FastRand{state: seed}
}

func (f *FastRand) Uint64() uint64 {
	f.state ^= f.state << 13
	f.state ^= f.state >> 7
	f.state ^= f.state << 17
	return f.state
}

func (f *FastRand) Intn(n int) int {
	if n <= 0 {
		return 0
	}
	return int(f.Uint64() % uint64(n))
}

func (f *FastRand) Perm(n int) []int {
	p := make([]int, n)
	for i := 0; i < n; i++ {
		p[i] = i
	}
	for i := n - 1; i > 0; i-- {
		j := f.Intn(i + 1)
		p[i], p[j] = p[j], p[i]
	}
	return p
}

func (f *FastRand) Shuffle(n int, swap func(i, j int)) {
	for i := n - 1; i > 0; i-- {
		j := f.Intn(i + 1)
		swap(i, j)
	}
}

type Sudoku struct {
	rng *FastRand
}

func NewSudoku() *Sudoku {
	return &Sudoku{
		rng: NewFastRand(),
	}
}

func (s *Sudoku) IsValid(b *models.Board, row, col, num int) bool {
	for i := 0; i < 9; i++ {
		if b[row][i] == num || b[i][col] == num {
			return false
		}
	}
	startR, startC := (row/3)*3, (col/3)*3
	for r := startR; r < startR+3; r++ {
		for c := startC; c < startC+3; c++ {
			if b[r][c] == num {
				return false
			}
		}
	}
	return true
}

func (s *Sudoku) FillGrid(b *models.Board) bool {
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			if b[r][c] == 0 {
				nums := s.rng.Perm(9)
				for _, idx := range nums {
					num := idx + 1
					if s.IsValid(b, r, c, num) {
						b[r][c] = num
						if s.FillGrid(b) {
							return true
						}
						b[r][c] = 0
					}
				}
				return false
			}
		}
	}
	return true
}

func (s *Sudoku) GetCandidates(b *models.Board, r, c int) []int {
	if b[r][c] != 0 {
		return nil
	}
	used := make(map[int]bool)
	for i := 0; i < 9; i++ {
		if b[i][c] != 0 {
			used[b[i][c]] = true
		}
		if b[r][i] != 0 {
			used[b[r][i]] = true
		}
	}
	startR, startC := (r/3)*3, (c/3)*3
	for i := startR; i < startR+3; i++ {
		for j := startC; j < startC+3; j++ {
			if b[i][j] != 0 {
				used[b[i][j]] = true
			}
		}
	}

	var candidates []int
	for num := 1; num <= 9; num++ {
		if !used[num] {
			candidates = append(candidates, num)
		}
	}
	return candidates
}

// AnalyzeCellEliminations tracks why candidate digits 1..9 are eliminated for cell (r, c)
func (s *Sudoku) AnalyzeCellEliminations(b *models.Board, r, c int) models.EliminationReasons {
	var reasons models.EliminationReasons
	if b[r][c] != 0 {
		return reasons
	}

	startR, startC := (r/3)*3, (c/3)*3

	for num := 1; num <= 9; num++ {
		if s.IsValid(b, r, c, num) {
			continue
		}

		// Check row constraint (cross-horizontal)
		inRow := false
		for i := 0; i < 9; i++ {
			if b[r][i] == num {
				inRow = true
				break
			}
		}
		if inRow {
			reasons.CrossHorizontal++
		}

		// Check col constraint (cross-vertical)
		inCol := false
		for i := 0; i < 9; i++ {
			if b[i][c] == num {
				inCol = true
				break
			}
		}
		if inCol {
			reasons.CrossVertical++
		}

		// Check 3x3 square constraint
		inBox := false
		for br := startR; br < startR+3; br++ {
			for bc := startC; bc < startC+3; bc++ {
				if b[br][bc] == num {
					inBox = true
					break
				}
			}
		}
		if inBox {
			reasons.Box3x3++
		}
	}

	return reasons
}

// FindNakedSingle checks Rule 1: Exactly 1 valid candidate remains for a cell
func (s *Sudoku) FindNakedSingle(b *models.Board) (models.Deduction, bool) {
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			if b[r][c] == 0 {
				cands := s.GetCandidates(b, r, c)
				if len(cands) == 1 {
					val := cands[0]
					reasons := s.AnalyzeCellEliminations(b, r, c)
					// Assertions: 8 eliminated candidate checks + all peer constraint eliminations
					assertions := 8 + reasons.Total()
					score := 1.0 + float64(reasons.Total())*0.04 + float64(assertions)*0.02
					desc := fmt.Sprintf("Naked Single at (%d,%d): only %d fits [assertions: %d, cross-h: %d, cross-v: %d, 3x3-sq: %d]",
						r, c, val, assertions, reasons.CrossHorizontal, reasons.CrossVertical, reasons.Box3x3)
					return models.Deduction{
						Row:         r,
						Col:         c,
						Val:         val,
						Technique:   "Naked Single",
						Reasons:     reasons,
						Assertions:  assertions,
						StepScore:   score,
						Description: desc,
					}, true
				}
			}
		}
	}
	return models.Deduction{}, false
}

// FindHiddenSingle checks Rule 2: Candidate digit fits in only 1 cell within a row, col, or 3x3 box
func (s *Sudoku) FindHiddenSingle(b *models.Board) (models.Deduction, bool) {
	// Check 3x3 Box
	for boxR := 0; boxR < 9; boxR += 3 {
		for boxC := 0; boxC < 9; boxC += 3 {
			for num := 1; num <= 9; num++ {
				count := 0
				targetR, targetC := -1, -1
				peerElimAssertions := 0
				for r := boxR; r < boxR+3; r++ {
					for c := boxC; c < boxC+3; c++ {
						if b[r][c] == 0 {
							if s.IsValid(b, r, c, num) {
								count++
								targetR, targetC = r, c
							} else {
								// Count reasons why this peer cell cannot hold num
								for i := 0; i < 9; i++ {
									if b[r][i] == num {
										peerElimAssertions++
									}
									if b[i][c] == num {
										peerElimAssertions++
									}
								}
							}
						}
					}
				}
				if count == 1 {
					reasons := s.AnalyzeCellEliminations(b, targetR, targetC)
					assertions := peerElimAssertions + reasons.Total() + 1
					score := 1.5 + float64(reasons.Total())*0.04 + float64(assertions)*0.02
					desc := fmt.Sprintf("Hidden Single in 3x3 Box at (%d,%d): %d is unique in box [assertions: %d, cross-h: %d, cross-v: %d, 3x3-sq: %d]",
						targetR, targetC, num, assertions, reasons.CrossHorizontal, reasons.CrossVertical, reasons.Box3x3)
					return models.Deduction{
						Row:         targetR,
						Col:         targetC,
						Val:         num,
						Technique:   "Hidden Single Box",
						Reasons:     reasons,
						Assertions:  assertions,
						StepScore:   score,
						Description: desc,
					}, true
				}
			}
		}
	}

	// Check Rows
	for r := 0; r < 9; r++ {
		for num := 1; num <= 9; num++ {
			count := 0
			targetC := -1
			peerElimAssertions := 0
			for c := 0; c < 9; c++ {
				if b[r][c] == 0 {
					if s.IsValid(b, r, c, num) {
						count++
						targetC = c
					} else {
						// Column and box checks eliminating num from cell (r, c)
						for i := 0; i < 9; i++ {
							if b[i][c] == num {
								peerElimAssertions++
							}
						}
						startR, startC := (r/3)*3, (c/3)*3
						for br := startR; br < startR+3; br++ {
							for bc := startC; bc < startC+3; bc++ {
								if b[br][bc] == num {
									peerElimAssertions++
								}
							}
						}
					}
				}
			}
			if count == 1 {
				reasons := s.AnalyzeCellEliminations(b, r, targetC)
				assertions := peerElimAssertions + reasons.Total() + 1
				score := 1.8 + float64(reasons.Total())*0.04 + float64(assertions)*0.02
				desc := fmt.Sprintf("Hidden Single in Row %d at (%d,%d): %d is unique in row [assertions: %d, cross-h: %d, cross-v: %d, 3x3-sq: %d]",
					r, r, targetC, num, assertions, reasons.CrossHorizontal, reasons.CrossVertical, reasons.Box3x3)
				return models.Deduction{
					Row:         r,
					Col:         targetC,
					Val:         num,
					Technique:   "Hidden Single Row",
					Reasons:     reasons,
					Assertions:  assertions,
					StepScore:   score,
					Description: desc,
				}, true
			}
		}
	}

	// Check Cols
	for c := 0; c < 9; c++ {
		for num := 1; num <= 9; num++ {
			count := 0
			targetR := -1
			peerElimAssertions := 0
			for r := 0; r < 9; r++ {
				if b[r][c] == 0 {
					if s.IsValid(b, r, c, num) {
						count++
						targetR = r
					} else {
						// Row and box checks eliminating num from cell (r, c)
						for i := 0; i < 9; i++ {
							if b[r][i] == num {
								peerElimAssertions++
							}
						}
						startR, startC := (r/3)*3, (c/3)*3
						for br := startR; br < startR+3; br++ {
							for bc := startC; bc < startC+3; bc++ {
								if b[br][bc] == num {
									peerElimAssertions++
								}
							}
						}
					}
				}
			}
			if count == 1 {
				reasons := s.AnalyzeCellEliminations(b, targetR, c)
				assertions := peerElimAssertions + reasons.Total() + 1
				score := 1.8 + float64(reasons.Total())*0.04 + float64(assertions)*0.02
				desc := fmt.Sprintf("Hidden Single in Col %d at (%d,%d): %d is unique in col [assertions: %d, cross-h: %d, cross-v: %d, 3x3-sq: %d]",
					c, targetR, c, num, assertions, reasons.CrossHorizontal, reasons.CrossVertical, reasons.Box3x3)
				return models.Deduction{
					Row:         targetR,
					Col:         c,
					Val:         num,
					Technique:   "Hidden Single Col",
					Reasons:     reasons,
					Assertions:  assertions,
					StepScore:   score,
					Description: desc,
				}, true
			}
		}
	}

	return models.Deduction{}, false
}

func (s *Sudoku) FindNextDeduction(b *models.Board) (models.Deduction, bool) {
	if d, ok := s.FindNakedSingle(b); ok {
		return d, true
	}
	if d, ok := s.FindHiddenSingle(b); ok {
		return d, true
	}
	return models.Deduction{}, false
}

func (s *Sudoku) SolveAndEvaluate(puzzle models.Board) (models.DifficultyReport, bool) {
	work := puzzle
	report := models.DifficultyReport{
		TechniqueCounts: make(map[string]int),
	}

	for {
		filled := true
		for r := 0; r < 9; r++ {
			for c := 0; c < 9; c++ {
				if work[r][c] == 0 {
					filled = false
					break
				}
			}
			if !filled {
				break
			}
		}
		if filled {
			break
		}

		deduction, found := s.FindNextDeduction(&work)
		if !found {
			report.Rating = "Unsolvable by logical singles"
			report.CalculateMetricsWithBoard(&puzzle)
			return report, false
		}

		work[deduction.Row][deduction.Col] = deduction.Val
		report.StepDeductions = append(report.StepDeductions, deduction)
		report.TotalScore += deduction.StepScore
		report.TechniqueCounts[deduction.Technique]++
		report.ReasonCounts.CrossHorizontal += deduction.Reasons.CrossHorizontal
		report.ReasonCounts.CrossVertical += deduction.Reasons.CrossVertical
		report.ReasonCounts.Box3x3 += deduction.Reasons.Box3x3
	}

	switch {
	case report.TotalScore < 48 && len(report.StepDeductions) < 44:
		report.Rating = "Easy"
	case report.TotalScore < 58 && len(report.StepDeductions) < 50:
		report.Rating = "Medium"
	case report.TotalScore < 68 && len(report.StepDeductions) < 55:
		report.Rating = "Hard"
	default:
		report.Rating = "Expert"
	}

	report.CalculateMetricsWithBoard(&puzzle)
	return report, true
}

// CarveWithTargetDifficulty generates puzzles across wide difficulty spectrums
func (s *Sudoku) CarveWithTargetDifficulty(fullBoard models.Board, targetDifficulty string, targetBlanks int) (models.Board, models.DifficultyReport) {
	if targetBlanks <= 0 {
		switch strings.ToLower(targetDifficulty) {
		case "easy":
			targetBlanks = 40 + s.rng.Intn(6) // 40 - 45
		case "medium":
			targetBlanks = 47 + s.rng.Intn(6) // 47 - 52
		case "hard":
			targetBlanks = 53 + s.rng.Intn(5) // 53 - 57
		case "expert":
			targetBlanks = 58 + s.rng.Intn(7) // 58 - 64
		default:
			targetBlanks = 40 + s.rng.Intn(25)
		}
	}

	puzzle := fullBoard

	type pos struct{ r, c int }
	positions := make([]pos, 0, 81)
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			positions = append(positions, pos{r, c})
		}
	}

	s.rng.Shuffle(len(positions), func(i, j int) {
		positions[i], positions[j] = positions[j], positions[i]
	})

	var backtrack func(idx, blanksLeft int) bool
	backtrack = func(idx, blanksLeft int) bool {
		if blanksLeft == 0 {
			return true
		}
		if idx >= len(positions) {
			return false
		}

		p := positions[idx]
		origVal := puzzle[p.r][p.c]

		puzzle[p.r][p.c] = 0

		if _, ok := s.SolveAndEvaluate(puzzle); ok {
			if backtrack(idx+1, blanksLeft-1) {
				return true
			}
		}

		puzzle[p.r][p.c] = origVal
		return backtrack(idx+1, blanksLeft)
	}

	backtrack(0, targetBlanks)

	report, _ := s.SolveAndEvaluate(puzzle)
	return puzzle, report
}

// ApplyRuleBasedMutations applies validity-preserving isomorphic transformations:
// 1. Digit relabeling (bijective permutation of 1..9)
// 2. Row permutations within 3x3 bands
// 3. Column permutations within 3x3 stacks
// 4. Band permutations
// 5. Stack permutations
// 6. Transposition & Orthogonal reflections
func (s *Sudoku) ApplyRuleBasedMutations(puzzle *models.Board, solution *models.Board) {
	// 1. Digit Permutation
	perm := s.rng.Perm(9)
	mapping := make(map[int]int, 9)
	for i := 0; i < 9; i++ {
		mapping[i+1] = perm[i] + 1
	}
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			if puzzle[r][c] != 0 {
				puzzle[r][c] = mapping[puzzle[r][c]]
			}
			if solution != nil && solution[r][c] != 0 {
				solution[r][c] = mapping[solution[r][c]]
			}
		}
	}

	// 2. Row permutations within bands
	for band := 0; band < 3; band++ {
		p := s.rng.Perm(3)
		tempPuzzle := *puzzle
		var tempSolution models.Board
		if solution != nil {
			tempSolution = *solution
		}
		for i := 0; i < 3; i++ {
			fromR := band*3 + p[i]
			toR := band*3 + i
			puzzle[toR] = tempPuzzle[fromR]
			if solution != nil {
				solution[toR] = tempSolution[fromR]
			}
		}
	}

	// 3. Col permutations within stacks
	for stack := 0; stack < 3; stack++ {
		p := s.rng.Perm(3)
		tempPuzzle := *puzzle
		var tempSolution models.Board
		if solution != nil {
			tempSolution = *solution
		}
		for r := 0; r < 9; r++ {
			for i := 0; i < 3; i++ {
				fromC := stack*3 + p[i]
				toC := stack*3 + i
				puzzle[r][toC] = tempPuzzle[r][fromC]
				if solution != nil {
					solution[r][toC] = tempSolution[r][fromC]
				}
			}
		}
	}

	// 4. Band swaps
	bandPerm := s.rng.Perm(3)
	tempPuzzle := *puzzle
	var tempSolution models.Board
	if solution != nil {
		tempSolution = *solution
	}
	for b := 0; b < 3; b++ {
		fromBand := bandPerm[b]
		for r := 0; r < 3; r++ {
			puzzle[b*3+r] = tempPuzzle[fromBand*3+r]
			if solution != nil {
				solution[b*3+r] = tempSolution[fromBand*3+r]
			}
		}
	}

	// 5. Stack swaps
	stackPerm := s.rng.Perm(3)
	tempPuzzle = *puzzle
	if solution != nil {
		tempSolution = *solution
	}
	for r := 0; r < 9; r++ {
		for sIdx := 0; sIdx < 3; sIdx++ {
			fromStack := stackPerm[sIdx]
			for c := 0; c < 3; c++ {
				puzzle[r][sIdx*3+c] = tempPuzzle[r][fromStack*3+c]
				if solution != nil {
					solution[r][sIdx*3+c] = tempSolution[r][fromStack*3+c]
				}
			}
		}
	}

	// 6. Transposition & Reflection
	if s.rng.Intn(2) == 1 {
		tempPuzzle = *puzzle
		if solution != nil {
			tempSolution = *solution
		}
		for r := 0; r < 9; r++ {
			for c := 0; c < 9; c++ {
				puzzle[r][c] = tempPuzzle[c][r]
				if solution != nil {
					solution[r][c] = tempSolution[c][r]
				}
			}
		}
	}
}

// GenerateAndAssessPuzzle generates a full board, mutates it with rule-based transformations,
// carves blanks according to target difficulty, mutates again, then solves and dynamically assesses difficulty.
func (s *Sudoku) GenerateAndAssessPuzzle(targetDifficulty string, targetBlanks int) (models.Board, models.Board, models.DifficultyReport) {
	var fullGrid models.Board
	s.FillGrid(&fullGrid)

	// Mutate full grid
	s.ApplyRuleBasedMutations(&fullGrid, nil)

	// Carve blanks
	puzzleGrid, _ := s.CarveWithTargetDifficulty(fullGrid, targetDifficulty, targetBlanks)

	// Apply rule-based mutations to both puzzle and solution simultaneously
	s.ApplyRuleBasedMutations(&puzzleGrid, &fullGrid)

	// Run solver and evaluate difficulty dynamically
	report, _ := s.SolveAndEvaluate(puzzleGrid)

	return fullGrid, puzzleGrid, report
}

func PrintBoard(b *models.Board) {
	for r := 0; r < 9; r++ {
		if r%3 == 0 && r != 0 {
			fmt.Println("------+-------+------")
		}
		for c := 0; c < 9; c++ {
			if c%3 == 0 && c != 0 {
				fmt.Print("| ")
			}
			if b[r][c] == 0 {
				fmt.Print(". ")
			} else {
				fmt.Printf("%d ", b[r][c])
			}
		}
		fmt.Println()
	}
}

func PrintDifficultyReport(report models.DifficultyReport) {
	fmt.Printf("\n--- Sudoku Difficulty Evaluation Report ---\n")
	fmt.Printf("Aggregate Numerical Score : %.2f\n", report.TotalScore)
	fmt.Printf("Multi-Factor Composite    : %.2f\n", report.CompositeScore)
	fmt.Printf("Canonical Rating          : %s\n", report.Rating)
	fmt.Printf("Granular Difficulty Tier  : %s\n\n", report.GranularTier)

	fmt.Printf("Logical Complexity & Assertions:\n")
	fmt.Printf(" - Total Logical Assertions           : %d\n", report.Metrics.TotalAssertions)
	fmt.Printf(" - Peak Step Assertions (Bottleneck) : %d (Step #%d)\n", report.Metrics.MaxStepAssertions, report.Metrics.BottleneckStep)
	fmt.Printf(" - Average Assertions / Step          : %.2f\n", report.Metrics.AvgAssertionsPerStep)
	fmt.Printf(" - Assertion Density                  : %.2f assertions/blank\n", report.Metrics.AssertionDensity)
	fmt.Printf(" - Cognitive Complexity Index         : %.2f\n\n", report.Metrics.ComplexityRating)

	fmt.Printf("Individual Elimination Reason Breakdown:\n")
	fmt.Printf(" - Cross-Horizontal (Row) constraints : %d\n", report.ReasonCounts.CrossHorizontal)
	fmt.Printf(" - Cross-Vertical (Column) constraints: %d\n", report.ReasonCounts.CrossVertical)
	fmt.Printf(" - Impossible 3x3 Square constraints  : %d\n", report.ReasonCounts.Box3x3)
	fmt.Printf(" - Total Elimination Reasons          : %d\n\n", report.ReasonCounts.Total())

	fmt.Printf("Statistical Analytics & Trajectory:\n")
	fmt.Printf(" - Step Score Min / Max / Spread     : %.2f / %.2f / %.2f\n", report.Metrics.MinStepScore, report.Metrics.MaxStepScore, report.Metrics.ScoreSpread)
	fmt.Printf(" - Variance & Standard Deviation     : %.4f (StdDev: %.4f)\n", report.Metrics.ScoreVariance, report.Metrics.ScoreStdDev)
	fmt.Printf(" - Divergence (Mean Abs Deviation)   : %.4f\n", report.Metrics.ScoreDivergence)
	fmt.Printf(" - Suddenness (Max Step-to-Step Jump): %.4f\n", report.Metrics.Suddenness)
	fmt.Printf(" - Trajectory Pacing & Slope          : %s (%+.4f/step)\n", report.Metrics.DifficultyPacing, report.Metrics.PacingSlope)
	fmt.Printf(" - Longest Technique Streak           : %d consecutive [%s]\n", report.Metrics.MaxStreak, report.Metrics.MaxStreakTechnique)
	fmt.Printf(" - Most Frequent Technique            : %s\n", report.Metrics.MostFrequentTechnique)
	fmt.Printf(" - Least Frequent Technique           : %s\n\n", report.Metrics.LeastFrequentTechnique)

	fmt.Printf("Board Geometry & Search Entropy:\n")
	fmt.Printf(" - Givens / Blanks Count              : %d givens / %d blanks\n", report.Metrics.ClueCount, report.Metrics.BlanksCount)
	fmt.Printf(" - Clue Geometric Symmetry Score      : %.2f (%.0f%%)\n", report.Metrics.ClueSymmetryScore, report.Metrics.ClueSymmetryScore*100)
	fmt.Printf(" - Clue Distribution Variance         : %.3f\n", report.Metrics.ClueDistributionVariance)
	fmt.Printf(" - Max Single-Box Clue Congestion     : %d clues\n", report.Metrics.BoxCongestionMax)
	fmt.Printf(" - Max Band/Stack Clue Congestion     : %d clues\n", report.Metrics.BandCongestionMax)
	fmt.Printf(" - Estimated Candidate Breadth        : %.2f cands/cell\n\n", report.Metrics.AverageCandidates)
}

type Server struct {
	store *storage.Storage
	gen   *Sudoku
}

func NewServer(store *storage.Storage) *Server {
	return &Server{
		store: store,
		gen:   NewSudoku(),
	}
}

func (srv *Server) handleHomepage(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(indexHTML)
}

func (srv *Server) handleGenerateAndSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	diffTarget := r.URL.Query().Get("difficulty")
	blanksVal := 0
	if blanksParam := r.URL.Query().Get("blanks"); blanksParam != "" {
		if val, err := strconv.Atoi(blanksParam); err == nil && val >= 10 && val <= 60 {
			blanksVal = val
		}
	}

	fullGrid, puzzleGrid, report := srv.gen.GenerateAndAssessPuzzle(diffTarget, blanksVal)
	record, err := models.CreateRecord(fullGrid, puzzleGrid, report)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to format puzzle record: %v", err), http.StatusInternalServerError)
		return
	}

	if err := srv.store.SavePuzzle(&record); err != nil {
		http.Error(w, fmt.Sprintf("Failed to save puzzle to database: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(record)
}

func (srv *Server) handleListPuzzles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := 10
	offset := 0
	rating := r.URL.Query().Get("rating")

	if l := r.URL.Query().Get("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 {
			limit = val
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if val, err := strconv.Atoi(o); err == nil && val >= 0 {
			offset = val
		}
	}

	puzzles, err := srv.store.ListPuzzles(limit, offset, rating)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to retrieve puzzles: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(puzzles)
}

func (srv *Server) handleGetPuzzleByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Path
	if strings.HasSuffix(path, "/svg") || strings.HasSuffix(path, "/heatmap.svg") || strings.HasSuffix(path, "/trajectory.svg") || strings.HasSuffix(path, "/animated.svg") || strings.HasSuffix(path, "/player.svg") || strings.HasSuffix(path, "/replay.svg") {
		srv.handleGetPuzzleSVG(w, r)
		return
	}

	idStr := strings.TrimPrefix(r.URL.Path, "/api/puzzles/")
	idVal, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		http.Error(w, "Invalid puzzle ID", http.StatusBadRequest)
		return
	}

	record, err := srv.store.GetPuzzleByID(uint(idVal))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(record)
}

func (srv *Server) handleGetPuzzleSVG(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	var idStr string
	if strings.HasSuffix(path, "/heatmap.svg") {
		idStr = strings.TrimSuffix(strings.TrimPrefix(path, "/api/puzzles/"), "/heatmap.svg")
	} else if strings.HasSuffix(path, "/trajectory.svg") {
		idStr = strings.TrimSuffix(strings.TrimPrefix(path, "/api/puzzles/"), "/trajectory.svg")
	} else if strings.HasSuffix(path, "/animated.svg") {
		idStr = strings.TrimSuffix(strings.TrimPrefix(path, "/api/puzzles/"), "/animated.svg")
	} else if strings.HasSuffix(path, "/player.svg") {
		idStr = strings.TrimSuffix(strings.TrimPrefix(path, "/api/puzzles/"), "/player.svg")
	} else if strings.HasSuffix(path, "/replay.svg") {
		idStr = strings.TrimSuffix(strings.TrimPrefix(path, "/api/puzzles/"), "/replay.svg")
	} else {
		idStr = strings.TrimSuffix(strings.TrimPrefix(path, "/api/puzzles/"), "/svg")
	}

	idVal, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		http.Error(w, "Invalid puzzle ID", http.StatusBadRequest)
		return
	}

	record, err := srv.store.GetPuzzleByID(uint(idVal))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	board, err := models.StringToBoard(record.BoardState)
	if err != nil {
		http.Error(w, "Failed to parse board state", http.StatusInternalServerError)
		return
	}

	solution, err := models.StringToBoard(record.Solution)
	if err != nil {
		http.Error(w, "Failed to parse solution state", http.StatusInternalServerError)
		return
	}

	report, err := record.ToDifficultyReport()
	if err != nil {
		http.Error(w, "Failed to parse difficulty report", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/svg+xml")

	if strings.HasSuffix(path, "/heatmap.svg") {
		svg := render.RenderHeatmapSVG(board, report, render.DefaultOptions())
		w.Write([]byte(svg))
	} else if strings.HasSuffix(path, "/trajectory.svg") {
		svg := render.RenderTrajectorySVG(report, 600, 240)
		w.Write([]byte(svg))
	} else if strings.HasSuffix(path, "/animated.svg") {
		svg := render.RenderAnimatedSVG(board, report, render.DefaultOptions())
		w.Write([]byte(svg))
	} else if strings.HasSuffix(path, "/replay.svg") {
		svg := render.RenderReplaySVG(solution, board, report, render.DefaultOptions())
		w.Write([]byte(svg))
	} else if strings.HasSuffix(path, "/player.svg") {
		svg := render.RenderInteractivePlayerSVG(board, solution, report, render.DefaultOptions())
		w.Write([]byte(svg))
	} else {
		svg := render.RenderBoardSVG(board, render.DefaultOptions())
		w.Write([]byte(svg))
	}
}

func main() {
	var store *storage.Storage
	var err error

	postgresDSN := os.Getenv("POSTGRES_DSN")
	if postgresDSN != "" {
		log.Printf("Connecting to PostgreSQL using DSN...\n")
		store, err = storage.NewPostgresStorage(postgresDSN)
	} else {
		log.Printf("POSTGRES_DSN not set. Initializing GORM with local SQLite fallback (undoku.db)...\n")
		store, err = storage.NewSQLiteStorage("undoku.db")
	}

	if err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}

	// Generate 3 sample puzzles spanning different difficulty spectrums
	s := NewSudoku()
	diffs := []string{"easy", "medium", "hard"}
	for _, targetDiff := range diffs {
		fullGrid, puzzle, report := s.GenerateAndAssessPuzzle(targetDiff, 0)
		rec, err := models.CreateRecord(fullGrid, puzzle, report)
		if err == nil {
			if err := store.SavePuzzle(&rec); err == nil {
				log.Printf("[Init] Saved %s puzzle (ID: %d, Blanks: %d, Rating: %s, Score: %.2f)\n",
					targetDiff, rec.ID, rec.BlanksCount, rec.DifficultyRating, rec.TotalScore)

				if savedPath, err := render.SaveReplaySVG(fullGrid, puzzle, report, "exports", fmt.Sprintf("puzzle_%d_replay.svg", rec.ID)); err == nil {
					log.Printf("[Export] Saved animated replay SVG (unsolve + playthrough) to filesystem: %s\n", savedPath)
				}
				if savedPath, err := render.SaveAnimatedSVG(puzzle, report, "exports", fmt.Sprintf("puzzle_%d_animated.svg", rec.ID)); err == nil {
					log.Printf("[Export] Saved step-by-step animated SVG to filesystem: %s\n", savedPath)
				}
				if savedPath, err := render.SaveInteractivePlayerSVG(puzzle, fullGrid, report, "exports", fmt.Sprintf("puzzle_%d_player.svg", rec.ID)); err == nil {
					log.Printf("[Export] Saved interactive SVG player to filesystem: %s\n", savedPath)
				}
			}
		}
	}


	server := NewServer(store)
	http.HandleFunc("/", server.handleHomepage)
	http.HandleFunc("/api/puzzles/generate", server.handleGenerateAndSave)
	http.HandleFunc("/api/puzzles", server.handleListPuzzles)
	http.HandleFunc("/api/puzzles/", server.handleGetPuzzleByID)

	if _, err := os.Stat("wiki/dist"); err == nil {
		http.Handle("/wiki/", http.StripPrefix("/wiki/", http.FileServer(http.Dir("wiki/dist"))))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Undoku Web & REST API Server running on port %s...\n", port)
	log.Printf("Endpoints:\n")
	log.Printf("  GET  http://localhost:%s/ (Interactive Web Canvas Sudoku Engine)\n", port)
	log.Printf("  POST http://localhost:%s/api/puzzles/generate?difficulty=hard\n", port)
	log.Printf("  POST http://localhost:%s/api/puzzles/generate?difficulty=easy\n", port)
	log.Printf("  GET  http://localhost:%s/api/puzzles\n", port)
	log.Printf("  GET  http://localhost:%s/api/puzzles/:id\n", port)

	if os.Getenv("RUN_HTTP_SERVER") == "true" {
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Fatalf("Server failed: %v", err)
		}
	} else {
		log.Println("CLI Mode execution finished cleanly. Set RUN_HTTP_SERVER=true to keep HTTP server alive.")
	}
}
