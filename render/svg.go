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
