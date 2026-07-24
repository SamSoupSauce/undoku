package main

import (
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
					score := 1.0 + float64(reasons.Total())*0.05
					desc := fmt.Sprintf("Naked Single at (%d,%d): only %d fits [cross-h: %d, cross-v: %d, 3x3-sq: %d]",
						r, c, val, reasons.CrossHorizontal, reasons.CrossVertical, reasons.Box3x3)
					return models.Deduction{
						Row:         r,
						Col:         c,
						Val:         val,
						Technique:   "Naked Single",
						Reasons:     reasons,
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
				for r := boxR; r < boxR+3; r++ {
					for c := boxC; c < boxC+3; c++ {
						if b[r][c] == 0 && s.IsValid(b, r, c, num) {
							count++
							targetR, targetC = r, c
						}
					}
				}
				if count == 1 {
					reasons := s.AnalyzeCellEliminations(b, targetR, targetC)
					score := 1.5 + float64(reasons.Total())*0.05
					desc := fmt.Sprintf("Hidden Single in 3x3 Box at (%d,%d): %d is unique in box [cross-h: %d, cross-v: %d, 3x3-sq: %d]",
						targetR, targetC, num, reasons.CrossHorizontal, reasons.CrossVertical, reasons.Box3x3)
					return models.Deduction{
						Row:         targetR,
						Col:         targetC,
						Val:         num,
						Technique:   "Hidden Single Box",
						Reasons:     reasons,
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
			for c := 0; c < 9; c++ {
				if b[r][c] == 0 && s.IsValid(b, r, c, num) {
					count++
					targetC = c
				}
			}
			if count == 1 {
				reasons := s.AnalyzeCellEliminations(b, r, targetC)
				score := 1.8 + float64(reasons.Total())*0.05
				desc := fmt.Sprintf("Hidden Single in Row %d at (%d,%d): %d is unique in row [cross-h: %d, cross-v: %d, 3x3-sq: %d]",
					r, r, targetC, num, reasons.CrossHorizontal, reasons.CrossVertical, reasons.Box3x3)
				return models.Deduction{
					Row:         r,
					Col:         targetC,
					Val:         num,
					Technique:   "Hidden Single Row",
					Reasons:     reasons,
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
			for r := 0; r < 9; r++ {
				if b[r][c] == 0 && s.IsValid(b, r, c, num) {
					count++
					targetR = r
				}
			}
			if count == 1 {
				reasons := s.AnalyzeCellEliminations(b, targetR, c)
				score := 1.8 + float64(reasons.Total())*0.05
				desc := fmt.Sprintf("Hidden Single in Col %d at (%d,%d): %d is unique in col [cross-h: %d, cross-v: %d, 3x3-sq: %d]",
					c, targetR, c, num, reasons.CrossHorizontal, reasons.CrossVertical, reasons.Box3x3)
				return models.Deduction{
					Row:         targetR,
					Col:         c,
					Val:         num,
					Technique:   "Hidden Single Col",
					Reasons:     reasons,
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
	case report.TotalScore < 45:
		report.Rating = "Easy"
	case report.TotalScore < 75:
		report.Rating = "Medium"
	case report.TotalScore < 115:
		report.Rating = "Hard"
	default:
		report.Rating = "Expert"
	}

	report.CalculateMetrics()
	return report, true
}

// CarveWithTargetDifficulty generates puzzles across wide difficulty spectrums
func (s *Sudoku) CarveWithTargetDifficulty(fullBoard models.Board, targetDifficulty string, targetBlanks int) (models.Board, models.DifficultyReport) {
	if targetBlanks <= 0 {
		switch strings.ToLower(targetDifficulty) {
		case "easy":
			targetBlanks = 28 + s.rng.Intn(8) // 28 - 35
		case "medium":
			targetBlanks = 36 + s.rng.Intn(8) // 36 - 43
		case "hard":
			targetBlanks = 44 + s.rng.Intn(8) // 44 - 51
		case "expert":
			targetBlanks = 52 + s.rng.Intn(6) // 52 - 57
		default:
			// Randomly choose across full spectrum (28 to 57 blanks)
			targetBlanks = 28 + s.rng.Intn(30)
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
	fmt.Printf("Assigned Difficulty Rating: %s\n\n", report.Rating)

	fmt.Printf("Individual Elimination Reason Breakdown:\n")
	fmt.Printf(" - Cross-Horizontal (Row) constraints : %d\n", report.ReasonCounts.CrossHorizontal)
	fmt.Printf(" - Cross-Vertical (Column) constraints: %d\n", report.ReasonCounts.CrossVertical)
	fmt.Printf(" - Impossible 3x3 Square constraints  : %d\n", report.ReasonCounts.Box3x3)
	fmt.Printf(" - Total Elimination Reasons          : %d\n\n", report.ReasonCounts.Total())

	fmt.Printf("Statistical Analytics & Complexity Metrics:\n")
	fmt.Printf(" - Step Score Min / Max / Spread     : %.2f / %.2f / %.2f\n", report.Metrics.MinStepScore, report.Metrics.MaxStepScore, report.Metrics.ScoreSpread)
	fmt.Printf(" - Variance & Standard Deviation     : %.4f (StdDev: %.4f)\n", report.Metrics.ScoreVariance, report.Metrics.ScoreStdDev)
	fmt.Printf(" - Divergence (Mean Abs Deviation)   : %.4f\n", report.Metrics.ScoreDivergence)
	fmt.Printf(" - Suddenness (Max Step-to-Step Jump): %.4f\n", report.Metrics.Suddenness)
	fmt.Printf(" - Longest Technique Streak           : %d consecutive [%s]\n", report.Metrics.MaxStreak, report.Metrics.MaxStreakTechnique)
	fmt.Printf(" - Most Frequent Technique            : %s\n", report.Metrics.MostFrequentTechnique)
	fmt.Printf(" - Least Frequent Technique           : %s\n\n", report.Metrics.LeastFrequentTechnique)
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

	var fullGrid models.Board
	srv.gen.FillGrid(&fullGrid)

	puzzleGrid, report := srv.gen.CarveWithTargetDifficulty(fullGrid, diffTarget, blanksVal)
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
	if strings.HasSuffix(path, "/svg") || strings.HasSuffix(path, "/heatmap.svg") || strings.HasSuffix(path, "/trajectory.svg") || strings.HasSuffix(path, "/animated.svg") || strings.HasSuffix(path, "/player.svg") {
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
		var fullGrid models.Board
		s.FillGrid(&fullGrid)

		puzzle, report := s.CarveWithTargetDifficulty(fullGrid, targetDiff, 0)
		rec, err := models.CreateRecord(fullGrid, puzzle, report)
		if err == nil {
			if err := store.SavePuzzle(&rec); err == nil {
				log.Printf("[Init] Saved %s puzzle (ID: %d, Blanks: %d, Rating: %s, Score: %.2f)\n",
					targetDiff, rec.ID, rec.BlanksCount, rec.DifficultyRating, rec.TotalScore)

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
	http.HandleFunc("/api/puzzles/generate", server.handleGenerateAndSave)
	http.HandleFunc("/api/puzzles", server.handleListPuzzles)
	http.HandleFunc("/api/puzzles/", server.handleGetPuzzleByID)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Undoku REST API Server running on port %s...\n", port)
	log.Printf("Endpoints:\n")
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
