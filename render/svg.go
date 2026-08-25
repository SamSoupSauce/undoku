package render

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	"samuel-meyers.com/undoku/models"
)

type SVGOptions struct {
	Size       int    // Canvas size in pixels (e.g. 540)
	DarkMode   bool   // Enable sleek dark mode palette
	ShowValues bool   // Show solved values vs blanks
	HighlightR int    // Row to highlight (-1 if none)
	HighlightC int    // Col to highlight (-1 if none)
}

func DefaultOptions() SVGOptions {
	return SVGOptions{
		Size:       540,
		DarkMode:   true,
		ShowValues: true,
		HighlightR: -1,
		HighlightC: -1,
	}
}

// RenderBoardSVG generates a crisp, modern vector SVG representation of a Sudoku board
func RenderBoardSVG(b models.Board, opts SVGOptions) string {
	if opts.Size <= 0 {
		opts.Size = 540
	}

	cellSize := opts.Size / 9
	actualSize := cellSize * 9

	bgColor := "#090d16"
	gridLineColor := "#1f293d"
	boxLineColor := "#6366f1"
	textColorGiven := "#f9fafb"
	textColorBlank := "#6b7280"
	cellBgDark := "#0d1322"
	cellBgAlt := "#111827"

	if !opts.DarkMode {
		bgColor = "#ffffff"
		gridLineColor = "#e5e7eb"
		boxLineColor = "#4f46e5"
		textColorGiven = "#111827"
		textColorBlank = "#9ca3af"
		cellBgDark = "#f9fafb"
		cellBgAlt = "#f3f4f6"
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">`,
		actualSize, actualSize, actualSize, actualSize))
	sb.WriteString("\n<style>\n")
	sb.WriteString(`  .num-given { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ` + fmt.Sprintf("%dpx", cellSize*55/100) + `; text-anchor: middle; dominant-baseline: central; fill: ` + textColorGiven + `; }` + "\n")
	sb.WriteString(`  .num-blank { font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-size: ` + fmt.Sprintf("%dpx", cellSize*40/100) + `; text-anchor: middle; dominant-baseline: central; fill: ` + textColorBlank + `; }` + "\n")
	sb.WriteString("</style>\n")

	// Background
	sb.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" fill="%s"/>`+"\n", actualSize, actualSize, bgColor))

	// Cell backgrounds
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			x, y := c*cellSize, r*cellSize
			bg := cellBgDark
			if (r/3+c/3)%2 == 1 {
				bg = cellBgAlt
			}
			if r == opts.HighlightR && c == opts.HighlightC {
				bg = "rgba(99, 102, 241, 0.35)"
			}

			sb.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>`+"\n",
				x, y, cellSize, cellSize, bg))

			val := b[r][c]
			if val != 0 {
				centerX := x + cellSize/2
				centerY := y + cellSize/2
				sb.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="num-given">%d</text>`+"\n",
					centerX, centerY, val))
			}
		}
	}

	// Minor Grid Lines
	for i := 1; i < 9; i++ {
		if i%3 != 0 {
			pos := i * cellSize
			sb.WriteString(fmt.Sprintf(`<line x1="%d" y1="0" x2="%d" y2="%d" stroke="%s" stroke-width="1"/>`+"\n",
				pos, pos, actualSize, gridLineColor))
			sb.WriteString(fmt.Sprintf(`<line x1="0" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="1"/>`+"\n",
				pos, actualSize, pos, gridLineColor))
		}
	}

	// Major 3x3 Box Lines
	for i := 0; i <= 9; i += 3 {
		pos := i * cellSize
		w := 3
		if i == 0 || i == 9 {
			w = 4
		}
		sb.WriteString(fmt.Sprintf(`<line x1="%d" y1="0" x2="%d" y2="%d" stroke="%s" stroke-width="%d"/>`+"\n",
			pos, pos, actualSize, boxLineColor, w))
		sb.WriteString(fmt.Sprintf(`<line x1="0" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="%d"/>`+"\n",
			pos, actualSize, pos, boxLineColor, w))
	}

	sb.WriteString("</svg>")
	return sb.String()
}

// RenderHeatmapSVG renders an elimination reason density heatmap SVG
func RenderHeatmapSVG(b models.Board, report models.DifficultyReport, opts SVGOptions) string {
	if opts.Size <= 0 {
		opts.Size = 540
	}
	cellSize := opts.Size / 9
	actualSize := cellSize * 9

	cellElims := make(map[string]int)
	maxElim := 1
	for _, d := range report.StepDeductions {
		key := fmt.Sprintf("%d,%d", d.Row, d.Col)
		tot := d.Reasons.Total()
		cellElims[key] = tot
		if tot > maxElim {
			maxElim = tot
		}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">`,
		actualSize, actualSize, actualSize, actualSize))
	sb.WriteString("\n<style>\n")
	sb.WriteString(`  .cell-text { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ` + fmt.Sprintf("%dpx", cellSize*40/100) + `; text-anchor: middle; dominant-baseline: central; fill: #ffffff; }` + "\n")
	sb.WriteString("</style>\n")

	sb.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" fill="#090d16"/>`+"\n", actualSize, actualSize))

	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			x, y := c*cellSize, r*cellSize
			key := fmt.Sprintf("%d,%d", r, c)
			elims := cellElims[key]

			var opacity float64
			if elims > 0 {
				opacity = 0.2 + (float64(elims)/float64(maxElim))*0.75
			} else {
				opacity = 0.05
			}

			color := fmt.Sprintf("rgba(129, 140, 248, %.2f)", opacity)
			if elims > maxElim*7/10 {
				color = fmt.Sprintf("rgba(244, 114, 182, %.2f)", opacity)
			}

			sb.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>`+"\n",
				x, y, cellSize, cellSize, color))

			val := b[r][c]
			if val != 0 {
				sb.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="cell-text">%d</text>`+"\n",
					x+cellSize/2, y+cellSize/2, val))
			} else if elims > 0 {
				sb.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="cell-text" opacity="0.8">%d</text>`+"\n",
					x+cellSize/2, y+cellSize/2, elims))
			}
		}
	}

	for i := 0; i <= 9; i += 3 {
		pos := i * cellSize
		sb.WriteString(fmt.Sprintf(`<line x1="%d" y1="0" x2="%d" y2="%d" stroke="#818cf8" stroke-width="3"/>`+"\n",
			pos, pos, actualSize))
		sb.WriteString(fmt.Sprintf(`<line x1="0" y1="%d" x2="%d" y2="%d" stroke="#818cf8" stroke-width="3"/>`+"\n",
			pos, actualSize, pos))
	}

	sb.WriteString("</svg>")
	return sb.String()
}

// RenderTrajectorySVG renders a step-by-step difficulty score graph as an SVG
func RenderTrajectorySVG(report models.DifficultyReport, width, height int) string {
	if width <= 0 {
		width = 600
	}
	if height <= 0 {
		height = 240
	}

	padding := 40
	chartWidth := width - 2*padding
	chartHeight := height - 2*padding

	n := len(report.StepDeductions)
	if n == 0 {
		return fmt.Sprintf(`<svg viewBox="0 0 %d %d"><text x="50%%" y="50%%" fill="#fff">No step data</text></svg>`, width, height)
	}

	minScore := report.Metrics.MinStepScore
	maxScore := report.Metrics.MaxStepScore
	if maxScore == minScore {
		maxScore += 1.0
	}

	var points []string
	for i, d := range report.StepDeductions {
		x := padding + int(float64(i)/float64(n-1)*float64(chartWidth))
		normY := (d.StepScore - minScore) / (maxScore - minScore)
		y := padding + chartHeight - int(normY*float64(chartHeight))
		points = append(points, fmt.Sprintf("%d,%d", x, y))
	}

	polyPoints := strings.Join(points, " ")

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">`,
		width, height, width, height))
	sb.WriteString("\n<style>\n")
	sb.WriteString(`  .axis { stroke: #374151; stroke-width: 1; }` + "\n")
	sb.WriteString(`  .line { fill: none; stroke: #818cf8; stroke-width: 3; stroke-linejoin: round; }` + "\n")
	sb.WriteString(`  .title { font-family: sans-serif; font-size: 14px; font-weight: bold; fill: #f3f4f6; }` + "\n")
	sb.WriteString(`  .label { font-family: sans-serif; font-size: 10px; fill: #9ca3af; }` + "\n")
	sb.WriteString("</style>\n")

	sb.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" fill="#090d16" rx="8"/>`+"\n", width, height))
	sb.WriteString(fmt.Sprintf(`<text x="%d" y="24" class="title">Difficulty Step Trajectory (Rating: %s, Score: %.2f)</text>`+"\n",
		padding, report.Rating, report.TotalScore))

	sb.WriteString(fmt.Sprintf(`<line x1="%d" y1="%d" x2="%d" y2="%d" class="axis"/>`+"\n",
		padding, padding+chartHeight, width-padding, padding+chartHeight))

	sb.WriteString(fmt.Sprintf(`<polyline points="%s" class="line"/>`+"\n", polyPoints))

	for i, pt := range points {
		coords := strings.Split(pt, ",")
		color := "#818cf8"
		if i > 0 {
			diff := math.Abs(report.StepDeductions[i].StepScore - report.StepDeductions[i-1].StepScore)
			if diff >= report.Metrics.Suddenness*0.9 && report.Metrics.Suddenness > 0.1 {
				color = "#f472b6"
			}
		}
		sb.WriteString(fmt.Sprintf(`<circle cx="%s" cy="%s" r="4" fill="%s"/>`+"\n", coords[0], coords[1], color))
	}

	sb.WriteString("</svg>")
	return sb.String()
}

// RenderAnimatedSVG generates a step-by-step animated vector SVG of the Sudoku solution trajectory
func RenderAnimatedSVG(b models.Board, report models.DifficultyReport, opts SVGOptions) string {
	if opts.Size <= 0 {
		opts.Size = 540
	}
	cellSize := opts.Size / 9
	boardSize := cellSize * 9
	totalHeight := boardSize + 70 // Extra space for animated status bar

	n := len(report.StepDeductions)
	if n == 0 {
		return RenderBoardSVG(b, opts)
	}

	durationSec := float64(n) * 0.9

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">`,
		boardSize, totalHeight, boardSize, totalHeight))
	sb.WriteString("\n<style>\n")
	sb.WriteString(`  .text-given { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ` + fmt.Sprintf("%dpx", cellSize*55/100) + `; text-anchor: middle; dominant-baseline: central; fill: #f9fafb; }` + "\n")
	sb.WriteString(`  .text-step { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ` + fmt.Sprintf("%dpx", cellSize*55/100) + `; text-anchor: middle; dominant-baseline: central; fill: #818cf8; }` + "\n")
	sb.WriteString(`  .status-text { font-family: 'Inter', system-ui, sans-serif; font-weight: 600; font-size: 13px; fill: #f3f4f6; }` + "\n")
	sb.WriteString(`  .sub-status { font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-size: 11px; fill: #9ca3af; }` + "\n")

	// Keyframes for step animations
	for i := range report.StepDeductions {
		startPct := (float64(i) / float64(n)) * 100.0
		activePct := (float64(i+1) / float64(n)) * 100.0

		// Keyframe for cell visibility
		sb.WriteString(fmt.Sprintf("@keyframes anim-step-%d {\n", i))
		sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { opacity: 0; }\n", startPct))
		sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { opacity: 1; }\n", activePct))
		sb.WriteString("}\n")

		// Keyframe for cell background highlight
		sb.WriteString(fmt.Sprintf("@keyframes anim-bg-%d {\n", i))
		sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { fill: #0d1322; }\n", startPct))
		sb.WriteString(fmt.Sprintf("  %.2f%% { fill: rgba(245, 158, 11, 0.45); }\n", startPct+0.1))
		sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { fill: rgba(99, 102, 241, 0.2); }\n", activePct))
		sb.WriteString("}\n")

		// Keyframe for status bar text
		sb.WriteString(fmt.Sprintf("@keyframes anim-status-%d {\n", i))
		sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { opacity: 0; }\n", startPct))
		sb.WriteString(fmt.Sprintf("  %.2f%%, %.2f%% { opacity: 1; }\n", startPct+0.05, activePct))
		sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { opacity: 0; }\n", activePct+0.05))
		sb.WriteString("}\n")

		sb.WriteString(fmt.Sprintf(".step-val-%d { animation: anim-step-%d %.1fs infinite; }\n", i, i, durationSec))
		sb.WriteString(fmt.Sprintf(".step-bg-%d { animation: anim-bg-%d %.1fs infinite; }\n", i, i, durationSec))
		sb.WriteString(fmt.Sprintf(".step-status-%d { animation: anim-status-%d %.1fs infinite; }\n", i, i, durationSec))
	}

	sb.WriteString("</style>\n")

	// Canvas background
	sb.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" fill="#090d16"/>`+"\n", boardSize, totalHeight))

	// Map initial givens
	givenCells := make(map[string]bool)
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			x, y := c*cellSize, r*cellSize
			bg := "#0d1322"
			if (r/3+c/3)%2 == 1 {
				bg = "#111827"
			}
			if b[r][c] != 0 {
				givenCells[fmt.Sprintf("%d,%d", r, c)] = true
				sb.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>`+"\n", x, y, cellSize, cellSize, bg))
				sb.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="text-given">%d</text>`+"\n", x+cellSize/2, y+cellSize/2, b[r][c]))
			}
		}
	}

	// Render step deduction cells with keyframed animation classes
	for i, d := range report.StepDeductions {
		x, y := d.Col*cellSize, d.Row*cellSize
		sb.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" class="step-bg-%d"/>`+"\n",
			x, y, cellSize, cellSize, i))
		sb.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="text-step step-val-%d">%d</text>`+"\n",
			x+cellSize/2, y+cellSize/2, i, d.Val))
	}

	// Minor & Major Grid Lines
	for i := 1; i < 9; i++ {
		if i%3 != 0 {
			pos := i * cellSize
			sb.WriteString(fmt.Sprintf(`<line x1="%d" y1="0" x2="%d" y2="%d" stroke="#1f293d" stroke-width="1"/>`+"\n", pos, pos, boardSize))
			sb.WriteString(fmt.Sprintf(`<line x1="0" y1="%d" x2="%d" y2="%d" stroke="#1f293d" stroke-width="1"/>`+"\n", pos, boardSize, pos))
		}
	}
	for i := 0; i <= 9; i += 3 {
		pos := i * cellSize
		w := 3
		if i == 0 || i == 9 {
			w = 4
		}
		sb.WriteString(fmt.Sprintf(`<line x1="%d" y1="0" x2="%d" y2="%d" stroke="#6366f1" stroke-width="%d"/>`+"\n", pos, pos, boardSize, w))
		sb.WriteString(fmt.Sprintf(`<line x1="0" y1="%d" x2="%d" y2="%d" stroke="#6366f1" stroke-width="%d"/>`+"\n", pos, boardSize, pos, w))
	}

	// Status Bar Container at bottom
	sb.WriteString(fmt.Sprintf(`<rect x="0" y="%d" width="%d" height="70" fill="#0d1322" stroke="#1f293d" stroke-width="1"/>`+"\n", boardSize, boardSize))

	// Animated Status Messages
	for i, d := range report.StepDeductions {
		sb.WriteString(fmt.Sprintf(`<g class="step-status-%d">`+"\n", i))
		sb.WriteString(fmt.Sprintf(`  <text x="16" y="%d" class="status-text">Step %d / %d: [%s] at (%d,%d) = %d</text>`+"\n",
			boardSize+26, i+1, n, d.Technique, d.Row, d.Col, d.Val))
		sb.WriteString(fmt.Sprintf(`  <text x="16" y="%d" class="sub-status">%s (Step Score: %.2f)</text>`+"\n",
			boardSize+48, d.Description, d.StepScore))
		sb.WriteString("</g>\n")
	}

	sb.WriteString("</svg>")
	return sb.String()
}

// RenderReplaySVG generates a self-contained animated SVG that demonstrates:
// 1. Showcase full solved board followed by deliberate, high-impact unsolving with dissolve rings
// 2. Fast-paced, visually rich step-by-step deduction playthrough with crosshair laser beams, box highlights, and pop-in animations
// 3. Victory celebration phase
func RenderReplaySVG(solution models.Board, carved models.Board, report models.DifficultyReport, opts SVGOptions) string {
	if opts.Size <= 0 {
		opts.Size = 540
	}
	cellSize := opts.Size / 9
	boardSize := cellSize * 9
	totalHeight := boardSize + 75

	n := len(report.StepDeductions)
	if n == 0 {
		return RenderBoardSVG(carved, opts)
	}

	// Dynamic timing: showcase + rhythmic unsolving + fast solver playback + victory
	showcaseSec := 0.8
	unsolveCarveSec := 2.7
	unsolveTotalSec := showcaseSec + unsolveCarveSec // 3.5s total unsolving
	stepSec := 0.32                                  // snappy 320ms per deduction step
	playthroughSec := float64(n) * stepSec
	victorySec := 2.2
	totalSec := unsolveTotalSec + playthroughSec + victorySec

	showcasePct := (showcaseSec / totalSec) * 100.0
	unsolvePct := (unsolveTotalSec / totalSec) * 100.0
	playthroughPct := ((unsolveTotalSec + playthroughSec) / totalSec) * 100.0

	// Identify carved blank cells
	type cellPos struct{ r, c, val int }
	var blanks []cellPos
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			if carved[r][c] == 0 {
				blanks = append(blanks, cellPos{r: r, c: c, val: solution[r][c]})
			}
		}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">`,
		boardSize, totalHeight, boardSize, totalHeight))
	sb.WriteString("\n<style>\n")
	sb.WriteString(`  .text-given { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ` + fmt.Sprintf("%dpx", cellSize*55/100) + `; text-anchor: middle; dominant-baseline: central; fill: #f9fafb; }` + "\n")
	sb.WriteString(`  .text-unsolve { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ` + fmt.Sprintf("%dpx", cellSize*55/100) + `; text-anchor: middle; dominant-baseline: central; fill: #38bdf8; }` + "\n")
	sb.WriteString(`  .text-step { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: ` + fmt.Sprintf("%dpx", cellSize*55/100) + `; text-anchor: middle; dominant-baseline: central; fill: #818cf8; }` + "\n")
	sb.WriteString(`  .status-text { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: 13px; fill: #f3f4f6; }` + "\n")
	sb.WriteString(`  .sub-status { font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-size: 11px; fill: #9ca3af; }` + "\n")
	sb.WriteString(`  .status-unsolve { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: 13px; fill: #38bdf8; }` + "\n")
	sb.WriteString(`  .status-victory { font-family: 'Inter', system-ui, sans-serif; font-weight: 700; font-size: 13px; fill: #fbbf24; }` + "\n")

	// Phase 1: Showcase & Unsolving Keyframes for each carved blank cell
	numBlanks := len(blanks)
	if numBlanks == 0 {
		numBlanks = 1
	}
	for i, b := range blanks {
		dissolveStartPct := showcasePct + (float64(i)/float64(numBlanks))*(unsolveCarveSec/totalSec)*100.0*0.88
		dissolveEndPct := dissolveStartPct + ((unsolveCarveSec/totalSec)*100.0*0.18)
		if dissolveEndPct > unsolvePct {
			dissolveEndPct = unsolvePct
		}

		// Digit keyframe: visible during showcase, dissolves out during carve
		sb.WriteString(fmt.Sprintf("@keyframes anim-unsolve-val-%d-%d {\n", b.r, b.c))
		sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { opacity: 1; transform: scale(1); }\n", dissolveStartPct))
		sb.WriteString(fmt.Sprintf("  %.2f%% { opacity: 0.9; transform: scale(1.3); fill: #f43f5e; }\n", (dissolveStartPct+dissolveEndPct)/2))
		sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { opacity: 0; transform: scale(0.2); }\n", dissolveEndPct))
		sb.WriteString("}\n")

		// Cell background keyframe: flash on carve with cyan vaporize glow
		sb.WriteString(fmt.Sprintf("@keyframes anim-unsolve-bg-%d-%d {\n", b.r, b.c))
		sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { fill: #0d1322; }\n", dissolveStartPct))
		sb.WriteString(fmt.Sprintf("  %.2f%% { fill: rgba(244, 63, 94, 0.45); }\n", (dissolveStartPct+dissolveEndPct)/2))
		sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { fill: #0d1322; }\n", dissolveEndPct))
		sb.WriteString("}\n")

		sb.WriteString(fmt.Sprintf(".unsolve-val-%d-%d { animation: anim-unsolve-val-%d-%d %.1fs infinite; transform-origin: %dpx %dpx; }\n",
			b.r, b.c, b.r, b.c, totalSec, b.c*cellSize+cellSize/2, b.r*cellSize+cellSize/2))
		sb.WriteString(fmt.Sprintf(".unsolve-bg-%d-%d { animation: anim-unsolve-bg-%d-%d %.1fs infinite; }\n",
			b.r, b.c, b.r, b.c, totalSec))
	}

	// Phase 2: Step Playthrough Keyframes with Laser Crosshairs, Box Highlights, and Digit Pop-in
	for i, d := range report.StepDeductions {
		stepStartPct := unsolvePct + (float64(i)/float64(n))*(playthroughPct-unsolvePct)
		stepActivePct := unsolvePct + (float64(i+1)/float64(n))*(playthroughPct-unsolvePct)
		stepPeakPct := stepStartPct + (stepActivePct-stepStartPct)*0.4

		// Keyframe for deduced digit pop-in (scale bounce)
		sb.WriteString(fmt.Sprintf("@keyframes anim-replay-step-%d {\n", i))
		sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { opacity: 0; transform: scale(0.2); }\n", stepStartPct))
		sb.WriteString(fmt.Sprintf("  %.2f%% { opacity: 1; transform: scale(1.35); fill: #fbbf24; }\n", stepPeakPct))
		sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { opacity: 1; transform: scale(1); fill: #818cf8; }\n", stepActivePct))
		sb.WriteString("}\n")

		// Keyframe for cell highlight during deduction
		sb.WriteString(fmt.Sprintf("@keyframes anim-replay-bg-%d {\n", i))
		sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { fill: #0d1322; }\n", stepStartPct))
		sb.WriteString(fmt.Sprintf("  %.2f%% { fill: rgba(245, 158, 11, 0.6); }\n", stepPeakPct))
		sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { fill: rgba(99, 102, 241, 0.2); }\n", stepActivePct))
		sb.WriteString("}\n")

		// Keyframe for laser crosshair & box scanning beams
		sb.WriteString(fmt.Sprintf("@keyframes anim-beam-%d {\n", i))
		sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { opacity: 0; }\n", stepStartPct))
		sb.WriteString(fmt.Sprintf("  %.2f%%, %.2f%% { opacity: 1; }\n", stepStartPct+0.01, stepActivePct))
		sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { opacity: 0; }\n", stepActivePct+0.01))
		sb.WriteString("}\n")

		// Keyframe for status bar step text
		sb.WriteString(fmt.Sprintf("@keyframes anim-replay-status-%d {\n", i))
		sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { opacity: 0; }\n", stepStartPct))
		sb.WriteString(fmt.Sprintf("  %.2f%%, %.2f%% { opacity: 1; }\n", stepStartPct+0.01, stepActivePct))
		sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { opacity: 0; }\n", stepActivePct+0.01))
		sb.WriteString("}\n")

		sb.WriteString(fmt.Sprintf(".replay-step-val-%d { animation: anim-replay-step-%d %.1fs infinite; transform-origin: %dpx %dpx; }\n",
			i, i, totalSec, d.Col*cellSize+cellSize/2, d.Row*cellSize+cellSize/2))
		sb.WriteString(fmt.Sprintf(".replay-step-bg-%d { animation: anim-replay-bg-%d %.1fs infinite; }\n", i, i, totalSec))
		sb.WriteString(fmt.Sprintf(".replay-beam-%d { animation: anim-beam-%d %.1fs infinite; }\n", i, i, totalSec))
		sb.WriteString(fmt.Sprintf(".replay-step-status-%d { animation: anim-replay-status-%d %.1fs infinite; }\n", i, i, totalSec))
	}

	// Status Keyframe for Unsolve Phase
	sb.WriteString(fmt.Sprintf("@keyframes anim-status-unsolve-phase {\n"))
	sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { opacity: 1; }\n", unsolvePct))
	sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { opacity: 0; }\n", unsolvePct+0.05))
	sb.WriteString("}\n")
	sb.WriteString(fmt.Sprintf(".status-phase-unsolve { animation: anim-status-unsolve-phase %.1fs infinite; }\n", totalSec))

	// Status Keyframe for Victory Phase
	sb.WriteString(fmt.Sprintf("@keyframes anim-status-victory-phase {\n"))
	sb.WriteString(fmt.Sprintf("  0%%, %.2f%% { opacity: 0; }\n", playthroughPct))
	sb.WriteString(fmt.Sprintf("  %.2f%%, 100%% { opacity: 1; }\n", playthroughPct+0.05))
	sb.WriteString("}\n")
	sb.WriteString(fmt.Sprintf(".status-phase-victory { animation: anim-status-victory-phase %.1fs infinite; }\n", totalSec))

	sb.WriteString("</style>\n")

	// Canvas background
	sb.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" fill="#090d16"/>`+"\n", boardSize, totalHeight))

	// Cell backgrounds & Givens
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			x, y := c*cellSize, r*cellSize
			bg := "#0d1322"
			if (r/3+c/3)%2 == 1 {
				bg = "#111827"
			}
			if carved[r][c] != 0 {
				// Static given clue
				sb.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>`+"\n", x, y, cellSize, cellSize, bg))
				sb.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="text-given">%d</text>`+"\n", x+cellSize/2, y+cellSize/2, carved[r][c]))
			} else {
				// Carved blank: unsolving animation layer
				sb.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" fill="%s" class="unsolve-bg-%d-%d"/>`+"\n",
					x, y, cellSize, cellSize, bg, r, c))
				sb.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="text-unsolve unsolve-val-%d-%d">%d</text>`+"\n",
					x+cellSize/2, y+cellSize/2, r, c, solution[r][c]))
			}
		}
	}

	// Laser Crosshairs and 3x3 Box Deduction Scanning Highlights
	for i, d := range report.StepDeductions {
		x, y := d.Col*cellSize, d.Row*cellSize
		boxR := (d.Row / 3) * 3 * cellSize
		boxC := (d.Col / 3) * 3 * cellSize

		// Group of crosshair laser lines and box highlight
		sb.WriteString(fmt.Sprintf(`<g class="replay-beam-%d">`+"\n", i))
		// Row laser beam
		sb.WriteString(fmt.Sprintf(`  <rect x="0" y="%d" width="%d" height="%d" fill="rgba(99, 102, 241, 0.12)"/>`+"\n", y, boardSize, cellSize))
		sb.WriteString(fmt.Sprintf(`  <line x1="0" y1="%d" x2="%d" y2="%d" stroke="rgba(99, 102, 241, 0.35)" stroke-width="1.5"/>`+"\n", y+cellSize/2, boardSize, y+cellSize/2))
		// Column laser beam
		sb.WriteString(fmt.Sprintf(`  <rect x="%d" y="0" width="%d" height="%d" fill="rgba(99, 102, 241, 0.12)"/>`+"\n", x, cellSize, boardSize))
		sb.WriteString(fmt.Sprintf(`  <line x1="%d" y1="0" x2="%d" y2="%d" stroke="rgba(99, 102, 241, 0.35)" stroke-width="1.5"/>`+"\n", x+cellSize/2, x+cellSize/2, boardSize))
		// Box 3x3 quadrant soft glow
		sb.WriteString(fmt.Sprintf(`  <rect x="%d" y="%d" width="%d" height="%d" fill="rgba(168, 85, 247, 0.10)" stroke="rgba(168, 85, 247, 0.4)" stroke-width="1.5"/>`+"\n",
			boxC, boxR, cellSize*3, cellSize*3))
		sb.WriteString("</g>\n")
	}

	// Deduction playthrough cell backgrounds and pop-in digits
	for i, d := range report.StepDeductions {
		x, y := d.Col*cellSize, d.Row*cellSize
		sb.WriteString(fmt.Sprintf(`<rect x="%d" y="%d" width="%d" height="%d" class="replay-step-bg-%d"/>`+"\n",
			x, y, cellSize, cellSize, i))
		sb.WriteString(fmt.Sprintf(`<text x="%d" y="%d" class="text-step replay-step-val-%d">%d</text>`+"\n",
			x+cellSize/2, y+cellSize/2, i, d.Val))
	}

	// Minor & Major Grid Lines
	for i := 1; i < 9; i++ {
		if i%3 != 0 {
			pos := i * cellSize
			sb.WriteString(fmt.Sprintf(`<line x1="%d" y1="0" x2="%d" y2="%d" stroke="#1f293d" stroke-width="1"/>`+"\n", pos, pos, boardSize))
			sb.WriteString(fmt.Sprintf(`<line x1="0" y1="%d" x2="%d" y2="%d" stroke="#1f293d" stroke-width="1"/>`+"\n", pos, boardSize, pos))
		}
	}
	for i := 0; i <= 9; i += 3 {
		pos := i * cellSize
		w := 3
		if i == 0 || i == 9 {
			w = 4
		}
		sb.WriteString(fmt.Sprintf(`<line x1="%d" y1="0" x2="%d" y2="%d" stroke="#6366f1" stroke-width="%d"/>`+"\n", pos, pos, boardSize, w))
		sb.WriteString(fmt.Sprintf(`<line x1="0" y1="%d" x2="%d" y2="%d" stroke="#6366f1" stroke-width="%d"/>`+"\n", pos, boardSize, pos, w))
	}

	// Status Container
	sb.WriteString(fmt.Sprintf(`<rect x="0" y="%d" width="%d" height="75" fill="#0d1322" stroke="#1f293d" stroke-width="1"/>`+"\n", boardSize, boardSize))

	// 1. Phase 1 Unsolve Status
	sb.WriteString(`<g class="status-phase-unsolve">` + "\n")
	sb.WriteString(fmt.Sprintf(`  <text x="16" y="%d" class="status-unsolve">⚡ Phase 1: Rapid Unsolving &amp; Carving</text>`+"\n", boardSize+26))
	sb.WriteString(fmt.Sprintf(`  <text x="16" y="%d" class="sub-status">Carving solved board into %d unique clues (Difficulty: %s)...</text>`+"\n",
		boardSize+48, 81-numBlanks, report.Rating))
	sb.WriteString("</g>\n")

	// 2. Phase 2 Step Playthrough Statuses
	for i, d := range report.StepDeductions {
		sb.WriteString(fmt.Sprintf(`<g class="replay-step-status-%d">`+"\n", i))
		sb.WriteString(fmt.Sprintf(`  <text x="16" y="%d" class="status-text">Step %d / %d: [%s] at (%d,%d) = %d</text>`+"\n",
			boardSize+26, i+1, n, d.Technique, d.Row, d.Col, d.Val))
		sb.WriteString(fmt.Sprintf(`  <text x="16" y="%d" class="sub-status">%s (Score: %.2f | Reasons: ⬌%d ⬍%d ▦%d)</text>`+"\n",
			boardSize+48, d.Description, d.StepScore, d.Reasons.CrossHorizontal, d.Reasons.CrossVertical, d.Reasons.Box3x3))
		sb.WriteString("</g>\n")
	}

	// 3. Phase 3 Victory Status
	sb.WriteString(`<g class="status-phase-victory">` + "\n")
	sb.WriteString(fmt.Sprintf(`  <text x="16" y="%d" class="status-victory">🏆 Victory: Puzzle 100%% Logically Proven</text>`+"\n", boardSize+26))
	sb.WriteString(fmt.Sprintf(`  <text x="16" y="%d" class="sub-status">Rating: %s | Total Score: %.2f | Solved in %d steps</text>`+"\n",
		boardSize+48, report.Rating, report.TotalScore, n))
	sb.WriteString("</g>\n")

	sb.WriteString("</svg>")
	return sb.String()
}

// SaveReplaySVG renders and writes the full unsolve -> playthrough animated SVG to the filesystem
func SaveReplaySVG(solution models.Board, carved models.Board, report models.DifficultyReport, outputDir, filename string) (string, error) {
	if outputDir == "" {
		outputDir = "exports"
	}
	if filename == "" {
		filename = "puzzle_replay.svg"
	}
	if !strings.HasSuffix(filename, ".svg") {
		filename += ".svg"
	}

	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory %s: %w", outputDir, err)
	}

	filePath := filepath.Join(outputDir, filename)
	svgContent := RenderReplaySVG(solution, carved, report, DefaultOptions())

	if err := os.WriteFile(filePath, []byte(svgContent), 0644); err != nil {
		return "", fmt.Errorf("failed to write Replay SVG animation file to %s: %w", filePath, err)
	}

	return filePath, nil
}

// SaveAnimatedSVG renders and writes the step-by-step animated SVG to the specified directory on the filesystem
func SaveAnimatedSVG(b models.Board, report models.DifficultyReport, outputDir, filename string) (string, error) {
	if outputDir == "" {
		outputDir = "exports"
	}
	if filename == "" {
		filename = "puzzle_animated.svg"
	}
	if !strings.HasSuffix(filename, ".svg") {
		filename += ".svg"
	}

	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory %s: %w", outputDir, err)
	}

	filePath := filepath.Join(outputDir, filename)
	svgContent := RenderAnimatedSVG(b, report, DefaultOptions())

	if err := os.WriteFile(filePath, []byte(svgContent), 0644); err != nil {
		return "", fmt.Errorf("failed to write SVG animation file to %s: %w", filePath, err)
	}

	return filePath, nil
}

// RenderInteractivePlayerSVG renders a fully interactive, self-contained SVG Sudoku puzzle player with embedded JavaScript and CSS
func RenderInteractivePlayerSVG(b models.Board, solution models.Board, report models.DifficultyReport, opts SVGOptions) string {
	cellSize := 60
	boardSize := cellSize * 9 // 540px
	leftMargin := 30
	topHeight := 50
	canvasWidth := 600
	canvasHeight := 750
	keypadY := topHeight + boardSize + 12 // 602px

	bgColor := "#090d16"
	cellBgDark := "#0d1322"
	cellBgAlt := "#111827"
	gridLineColor := "#1f293d"
	boxLineColor := "#6366f1"
	textColorGiven := "#f9fafb"
	textColorUser := "#818cf8"
	textColorMatch := "#c084fc"
	ghostColor := "#818cf8"
	btnBg := "#1f293d"
	btnHover := "#374151"
	btnText := "#f3f4f6"
	colorScheme := "dark"

	if !opts.DarkMode {
		bgColor = "#f8fafc"
		cellBgDark = "#ffffff"
		cellBgAlt = "#f1f5f9"
		gridLineColor = "#e2e8f0"
		boxLineColor = "#4f46e5"
		textColorGiven = "#0f172a"
		textColorUser = "#4f46e5"
		textColorMatch = "#7c3aed"
		ghostColor = "#6366f1"
		btnBg = "#e2e8f0"
		btnHover = "#cbd5e1"
		btnText = "#0f172a"
		colorScheme = "light"
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="100%%" height="100%%" tabIndex="0" id="undoku-svg-player">`,
		canvasWidth, canvasHeight))

	sb.WriteString("\n<style>\n")
	sb.WriteString(fmt.Sprintf(`  :root, #undoku-svg-player { color-scheme: %s; forced-color-adjust: none; outline: none; font-family: 'Inter', system-ui, -apple-system, sans-serif; user-select: none; -webkit-user-select: none; max-width: 600px; max-height: 750px; width: 100%%; height: auto; display: block; margin-left: auto; margin-right: 0; }`, colorScheme) + "\n")
	sb.WriteString(fmt.Sprintf(`  .header-title { font-size: 16px; font-weight: 700; fill: %s; }`, textColorGiven) + "\n")
	sb.WriteString(fmt.Sprintf(`  .header-badge { font-size: 12px; font-weight: 600; fill: %s; }`, boxLineColor) + "\n")
	sb.WriteString(`  .timer-text { font-size: 14px; font-weight: 600; fill: #9ca3af; text-anchor: end; }` + "\n")
	sb.WriteString(`  .cell-rect { cursor: pointer; transition: fill 0.15s ease; }` + "\n")
	sb.WriteString(fmt.Sprintf(`  .cell-rect:hover { fill: %s !important; opacity: 0.85; }`, ghostColor) + "\n")
	sb.WriteString(fmt.Sprintf(`  .text-given { font-size: 33px; font-weight: 700; text-anchor: middle; dominant-baseline: central; fill: %s; pointer-events: none; }`, textColorGiven) + "\n")
	sb.WriteString(fmt.Sprintf(`  .text-user { font-size: 33px; font-weight: 700; text-anchor: middle; dominant-baseline: central; fill: %s; pointer-events: none; }`, textColorUser) + "\n")
	sb.WriteString(fmt.Sprintf(`  .text-match { fill: %s !important; font-weight: 800 !important; }`, textColorMatch) + "\n")
	sb.WriteString(`  .text-error { fill: #f87171 !important; }` + "\n")
	sb.WriteString(fmt.Sprintf(`  .btn-bg { fill: %s; rx: 8px; cursor: pointer; transition: fill 0.15s ease; }`, btnBg) + "\n")
	sb.WriteString(fmt.Sprintf(`  .btn-bg:hover { fill: %s; }`, btnHover) + "\n")
	sb.WriteString(fmt.Sprintf(`  .btn-digit-text { font-size: 20px; font-weight: 700; fill: %s; text-anchor: middle; dominant-baseline: central; pointer-events: none; }`, btnText) + "\n")
	sb.WriteString(fmt.Sprintf(`  .btn-action-text { font-size: 14px; font-weight: 700; fill: %s; text-anchor: middle; dominant-baseline: central; pointer-events: none; }`, btnText) + "\n")
	sb.WriteString(fmt.Sprintf(`  .btn-action { fill: %s; }`, btnHover) + "\n")
	sb.WriteString(fmt.Sprintf(`  #svg-keypad { transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); opacity: 1; transform: translateY(%dpx); }`, keypadY) + "\n")
	sb.WriteString(fmt.Sprintf(`  .keypad-vanish { opacity: 0 !important; transform: translateY(%dpx) scale(0.95) !important; pointer-events: none !important; }`, keypadY+25) + "\n")
	sb.WriteString(`  .status-banner { font-size: 20px; font-weight: 800; fill: #10b981; text-anchor: middle; dominant-baseline: central; transition: opacity 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); opacity: 0; transform: translateY(15px) scale(0.85); pointer-events: none; }` + "\n")
	sb.WriteString(`  .status-banner-appear { opacity: 1 !important; transform: translateY(0px) scale(1) !important; }` + "\n")
	sb.WriteString("</style>\n")

	// Canvas background
	sb.WriteString(fmt.Sprintf(`<rect width="%d" height="%d" fill="%s" rx="12"/>`+"\n", canvasWidth, canvasHeight, bgColor))

	// Top Header Bar
	sb.WriteString(fmt.Sprintf(`<text x="%d" y="30" class="header-title">Undoku 🧩 <tspan class="header-badge">[%s - Score: %.1f]</tspan></text>`+"\n",
		leftMargin, report.Rating, report.TotalScore))
	sb.WriteString(fmt.Sprintf(`<text x="%d" y="30" id="svg-timer" class="timer-text">00:00</text>`+"\n", leftMargin+boardSize))

	// Board Background & Cells Group
	sb.WriteString(fmt.Sprintf(`<g id="svg-board-cells" transform="translate(%d, %d)">`+"\n", leftMargin, topHeight))

	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			x, y := c*cellSize, r*cellSize
			bg := cellBgDark
			if (r/3+c/3)%2 == 1 {
				bg = cellBgAlt
			}

			givenVal := b[r][c]
			solVal := solution[r][c]
			isGiven := givenVal != 0

			valStr := ""
			if isGiven {
				valStr = fmt.Sprintf("%d", givenVal)
			}

			textClass := "text-user"
			if isGiven {
				textClass = "text-given"
			}

			sb.WriteString(fmt.Sprintf(`  <g id="cell-%d-%d" data-r="%d" data-c="%d" data-given="%t" data-val="%d" data-sol="%d" onclick="window.undokuSelectCell(%d,%d)">`+"\n",
				r, c, r, c, isGiven, givenVal, solVal, r, c))
			sb.WriteString(fmt.Sprintf(`    <rect id="rect-%d-%d" class="cell-rect" x="%d" y="%d" width="%d" height="%d" fill="%s" stroke="%s" stroke-width="1"/>`+"\n",
				r, c, x, y, cellSize, cellSize, bg, gridLineColor))
			sb.WriteString(fmt.Sprintf(`    <rect id="match-%d-%d" x="%d" y="%d" width="%d" height="%d" fill="none" stroke="%s" stroke-width="1.5" stroke-dasharray="3,3" rx="6" opacity="0" pointer-events="none"/>`+"\n",
				r, c, x+6, y+6, cellSize-12, cellSize-12, textColorMatch))
			sb.WriteString(fmt.Sprintf(`    <text id="text-%d-%d" x="%d" y="%d" class="%s">%s</text>`+"\n",
				r, c, x+cellSize/2, y+cellSize/2, textClass, valStr))
			sb.WriteString(`  </g>` + "\n")
		}
	}

	// Minor & Major Grid Lines
	for i := 1; i < 9; i++ {
		if i%3 != 0 {
			pos := i * cellSize
			sb.WriteString(fmt.Sprintf(`  <line x1="%d" y1="0" x2="%d" y2="%d" stroke="%s" stroke-width="1"/>`+"\n", pos, pos, boardSize, gridLineColor))
			sb.WriteString(fmt.Sprintf(`  <line x1="0" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="1"/>`+"\n", pos, boardSize, pos, gridLineColor))
		}
	}
	for i := 0; i <= 9; i += 3 {
		pos := i * cellSize
		w := 3
		if i == 0 || i == 9 {
			w = 4
		}
		sb.WriteString(fmt.Sprintf(`  <line x1="%d" y1="0" x2="%d" y2="%d" stroke="%s" stroke-width="%d"/>`+"\n", pos, pos, boardSize, boxLineColor, w))
		sb.WriteString(fmt.Sprintf(`  <line x1="0" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="%d"/>`+"\n", pos, boardSize, pos, boxLineColor, w))
	}

	// V-H Axis Ghost Trails & Active Focus Indicators (Overlay Layer)
	sb.WriteString(fmt.Sprintf(`  <line id="vh-ghost-h" x1="0" y1="-100" x2="%d" y2="-100" stroke="%s" stroke-width="2" stroke-dasharray="5,4" opacity="0" pointer-events="none"/>`+"\n", boardSize, ghostColor))
	sb.WriteString(fmt.Sprintf(`  <line id="vh-ghost-v" x1="-100" y1="0" x2="-100" y2="%d" stroke="%s" stroke-width="2" stroke-dasharray="5,4" opacity="0" pointer-events="none"/>`+"\n", boardSize, ghostColor))
	sb.WriteString(fmt.Sprintf(`  <rect id="active-cell-focus" x="-100" y="-100" width="%d" height="%d" fill="none" stroke="%s" stroke-width="3" rx="4" opacity="0" pointer-events="none"/>`+"\n", cellSize, cellSize, ghostColor))
	sb.WriteString(fmt.Sprintf(`  <rect id="active-box-focus" x="-100" y="-100" width="%d" height="%d" fill="none" stroke="%s" stroke-width="2" stroke-dasharray="6,6" rx="6" opacity="0" pointer-events="none"/>`+"\n", cellSize*3, cellSize*3, boxLineColor))

	sb.WriteString("</g>\n") // End Board Group

	// Bottom Control Keypad Group (2 Rows)
	sb.WriteString(fmt.Sprintf(`<g id="svg-keypad" transform="translate(0, %d)">`+"\n", keypadY))

	// Row 1: Digits 1-9 (Spacious & Big Touch Targets)
	digitBtnW := 54
	digitBtnH := 48
	digitGap := 6
	digitStartX := leftMargin + 3 // 33px

	for i := 1; i <= 9; i++ {
		kx := digitStartX + (i-1)*(digitBtnW+digitGap)
		sb.WriteString(fmt.Sprintf(`  <rect class="btn-bg" x="%d" y="0" width="%d" height="%d" onclick="window.undokuInputDigit(%d)"/>`+"\n", kx, digitBtnW, digitBtnH, i))
		sb.WriteString(fmt.Sprintf(`  <text class="btn-digit-text" x="%d" y="%d">%d</text>`+"\n", kx+digitBtnW/2, digitBtnH/2, i))
	}

	// Row 2: Action Buttons (⌫ ERASE, 💡 HINT, ↺ RESET)
	actionY := 56
	actionBtnW := 168
	actionBtnH := 44
	actionGap := 15
	actionStartX := leftMargin + 3

	// Erase
	actX := actionStartX
	sb.WriteString(fmt.Sprintf(`  <rect class="btn-bg btn-action" x="%d" y="%d" width="%d" height="%d" onclick="window.undokuErase()"/>`+"\n", actX, actionY, actionBtnW, actionBtnH))
	sb.WriteString(fmt.Sprintf(`  <text class="btn-action-text" x="%d" y="%d">⌫ ERASE</text>`+"\n", actX+actionBtnW/2, actionY+actionBtnH/2))

	// Hint
	actX += actionBtnW + actionGap
	sb.WriteString(fmt.Sprintf(`<rect class="btn-bg btn-action" x="%d" y="%d" width="%d" height="%d" onclick="window.undokuHint()"/>`+"\n", actX, actionY, actionBtnW, actionBtnH))
	sb.WriteString(fmt.Sprintf(`  <text class="btn-action-text" x="%d" y="%d">💡 HINT</text>`+"\n", actX+actionBtnW/2, actionY+actionBtnH/2))

	// Reset
	actX += actionBtnW + actionGap
	sb.WriteString(fmt.Sprintf(`<rect class="btn-bg btn-action" x="%d" y="%d" width="%d" height="%d" onclick="window.undokuReset()"/>`+"\n", actX, actionY, actionBtnW, actionBtnH))
	sb.WriteString(fmt.Sprintf(`  <text class="btn-action-text" x="%d" y="%d">↺ RESET</text>`+"\n", actX+actionBtnW/2, actionY+actionBtnH/2))

	sb.WriteString("</g>\n")

	// Victory / Status Banner (positioned gracefully where keypad was)
	sb.WriteString(fmt.Sprintf(`<text id="svg-status-banner" x="%d" y="%d" class="status-banner">🎉 PUZZLE SOLVED!</text>`+"\n",
		canvasWidth/2, keypadY+45))

	// Embedded JavaScript Engine
	sb.WriteString("<script><![CDATA[\n")
	sb.WriteString(fmt.Sprintf(`(function() {
		var selR = -1, selC = -1;
		var seconds = 0;
		var timerInterval = null;
		var bgDark = "%s";
		var bgAlt = "%s";
		var gridStroke = "%s";

		function formatTime(s) {
			var m = Math.floor(s / 60);
			var sec = s %% 60;
			return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec);
		}

		function startTimer() {
			if (!timerInterval) {
				timerInterval = setInterval(function() {
					seconds++;
					var timerEl = document.getElementById('svg-timer');
					if (timerEl) timerEl.textContent = formatTime(seconds);
				}, 1000);
			}
		}

		function highlightBoard() {
			var ghostH = document.getElementById('vh-ghost-h');
			var ghostV = document.getElementById('vh-ghost-v');
			var focusCell = document.getElementById('active-cell-focus');
			var focusBox = document.getElementById('active-box-focus');

			var targetVal = (selR >= 0 && selC >= 0) ? document.getElementById('cell-' + selR + '-' + selC).getAttribute('data-val') : '0';

			if (selR >= 0 && selC >= 0) {
				var cy = selR * 60 + 30;
				var cx = selC * 60 + 30;

				if (ghostH) {
					ghostH.setAttribute('y1', cy);
					ghostH.setAttribute('y2', cy);
					ghostH.setAttribute('opacity', '0.75');
				}
				if (ghostV) {
					ghostV.setAttribute('x1', cx);
					ghostV.setAttribute('x2', cx);
					ghostV.setAttribute('opacity', '0.75');
				}
				if (focusCell) {
					focusCell.setAttribute('x', selC * 60);
					focusCell.setAttribute('y', selR * 60);
					focusCell.setAttribute('opacity', '1');
				}
				if (focusBox) {
					focusBox.setAttribute('x', Math.floor(selC / 3) * 180);
					focusBox.setAttribute('y', Math.floor(selR / 3) * 180);
					focusBox.setAttribute('opacity', '1');
				}
			} else {
				if (ghostH) ghostH.setAttribute('opacity', '0');
				if (ghostV) ghostV.setAttribute('opacity', '0');
				if (focusCell) focusCell.setAttribute('opacity', '0');
				if (focusBox) focusBox.setAttribute('opacity', '0');
			}

			for (var r = 0; r < 9; r++) {
				for (var c = 0; c < 9; c++) {
					var cell = document.getElementById('cell-' + r + '-' + c);
					var rect = document.getElementById('rect-' + r + '-' + c);
					var text = document.getElementById('text-' + r + '-' + c);
					var matchRing = document.getElementById('match-' + r + '-' + c);
					var defaultBg = ((Math.floor(r/3) + Math.floor(c/3)) %% 2 === 1) ? bgAlt : bgDark;

					rect.setAttribute('fill', defaultBg);
					rect.setAttribute('stroke', gridStroke);
					rect.setAttribute('stroke-width', '1');

					var val = cell.getAttribute('data-val');

					if (targetVal !== '0' && val === targetVal) {
						text.classList.add('text-match');
						if (matchRing) matchRing.setAttribute('opacity', '1');
					} else {
						text.classList.remove('text-match');
						if (matchRing) matchRing.setAttribute('opacity', '0');
					}
				}
			}
		}

		window.undokuSelectCell = function(r, c) {
			selR = r;
			selC = c;
			highlightBoard();
		};

		window.undokuInputDigit = function(num) {
			if (selR < 0 || selC < 0) return;
			var cell = document.getElementById('cell-' + selR + '-' + selC);
			if (cell.getAttribute('data-given') === 'true') return;

			cell.setAttribute('data-val', num.toString());
			var text = document.getElementById('text-' + selR + '-' + selC);
			text.textContent = num.toString();
			text.classList.remove('text-error');

			highlightBoard();
			checkWinCondition();
		};

		window.undokuErase = function() {
			if (selR < 0 || selC < 0) return;
			var cell = document.getElementById('cell-' + selR + '-' + selC);
			if (cell.getAttribute('data-given') === 'true') return;

			cell.setAttribute('data-val', '0');
			var text = document.getElementById('text-' + selR + '-' + selC);
			text.textContent = '';
			text.classList.remove('text-error');

			highlightBoard();
		};

		window.undokuHint = function() {
			if (selR < 0 || selC < 0) return;
			var cell = document.getElementById('cell-' + selR + '-' + selC);
			if (cell.getAttribute('data-given') === 'true') return;

			var sol = cell.getAttribute('data-sol');
			window.undokuInputDigit(parseInt(sol, 10));
		};

		window.undokuReset = function() {
			var keypad = document.getElementById('svg-keypad');
			if (keypad) keypad.classList.remove('keypad-vanish');

			var banner = document.getElementById('svg-status-banner');
			if (banner) banner.classList.remove('status-banner-appear');

			for (var r = 0; r < 9; r++) {
				for (var c = 0; c < 9; c++) {
					var cell = document.getElementById('cell-' + r + '-' + c);
					if (cell.getAttribute('data-given') !== 'true') {
						cell.setAttribute('data-val', '0');
						var text = document.getElementById('text-' + r + '-' + c);
						text.textContent = '';
						text.classList.remove('text-error');
					}
				}
			}
			selR = -1;
			selC = -1;
			highlightBoard();
		};

		function checkWinCondition() {
			var filled = 0;
			var correct = 0;
			for (var r = 0; r < 9; r++) {
				for (var c = 0; c < 9; c++) {
					var cell = document.getElementById('cell-' + r + '-' + c);
					var val = cell.getAttribute('data-val');
					var sol = cell.getAttribute('data-sol');
					if (val !== '0') filled++;
					if (val === sol) correct++;
				}
			}
			if (filled === 81 && correct === 81) {
				var keypad = document.getElementById('svg-keypad');
				if (keypad) keypad.classList.add('keypad-vanish');

				var banner = document.getElementById('svg-status-banner');
				if (banner) banner.classList.add('status-banner-appear');

				if (timerInterval) clearInterval(timerInterval);
				selR = -1;
				selC = -1;
				highlightBoard();
			}
		}

		document.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				selR = -1;
				selC = -1;
				highlightBoard();
				return;
			}
			if (selR < 0 || selC < 0) return;
			if (e.key >= '1' && e.key <= '9') {
				window.undokuInputDigit(parseInt(e.key, 10));
			} else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
				window.undokuErase();
			} else if (e.key === 'ArrowUp') {
				selR = (selR + 8) %% 9;
				highlightBoard();
			} else if (e.key === 'ArrowDown') {
				selR = (selR + 1) %% 9;
				highlightBoard();
			} else if (e.key === 'ArrowLeft') {
				selC = (selC + 8) %% 9;
				highlightBoard();
			} else if (e.key === 'ArrowRight') {
				selC = (selC + 1) %% 9;
				highlightBoard();
			}
		});

		startTimer();
		highlightBoard();
	})();
	]]></script>`, cellBgDark, cellBgAlt, gridLineColor) + "\n")

	sb.WriteString("</svg>")
	return sb.String()
}

// SaveInteractivePlayerSVG renders and writes the interactive SVG player file to the filesystem
func SaveInteractivePlayerSVG(b models.Board, solution models.Board, report models.DifficultyReport, outputDir, filename string) (string, error) {
	if outputDir == "" {
		outputDir = "exports"
	}
	if filename == "" {
		filename = "puzzle_player.svg"
	}
	if !strings.HasSuffix(filename, ".svg") {
		filename += ".svg"
	}

	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory %s: %w", outputDir, err)
	}

	filePath := filepath.Join(outputDir, filename)
	svgContent := RenderInteractivePlayerSVG(b, solution, report, DefaultOptions())

	if err := os.WriteFile(filePath, []byte(svgContent), 0644); err != nil {
		return "", fmt.Errorf("failed to write SVG player file to %s: %w", filePath, err)
	}

	// Also copy to wiki/public if wiki directory exists
	wikiPublicDir := "wiki/public"
	if _, err := os.Stat("wiki"); err == nil {
		os.MkdirAll(wikiPublicDir, 0755)
		os.WriteFile(filepath.Join(wikiPublicDir, filename), []byte(svgContent), 0644)
	}

	return filePath, nil
}
