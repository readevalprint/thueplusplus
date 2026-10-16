package harness

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	CeilingSteps        = 1_000_000
	CeilingEvals        = 5_000_000
	CeilingStateBytes   = 8 * 1024 * 1024
	CeilingTimeout      = 120
	MemoryCapBytes      = 256 * 1024 * 1024
	pollInterval        = 100 * time.Millisecond
	listRulesSteps      = 1_000_000
	listRulesEvals      = 1_000_000
	listRulesStateBytes = 8 * 1024 * 1024
)

// Limits are the explicit budgets for one guest run. Zero is refused.
type Limits struct {
	MaxSteps       int
	MaxEvals       int
	MaxStateBytes  int
	TimeoutSeconds int
}

func (l Limits) validate() error {
	if l.MaxSteps < 1 || l.MaxSteps > CeilingSteps {
		return fmt.Errorf("max steps %d outside 1..%d", l.MaxSteps, CeilingSteps)
	}
	if l.MaxEvals < 1 || l.MaxEvals > CeilingEvals {
		return fmt.Errorf("max evals %d outside 1..%d", l.MaxEvals, CeilingEvals)
	}
	if l.MaxStateBytes < 1 || l.MaxStateBytes > CeilingStateBytes {
		return fmt.Errorf("max state bytes %d outside 1..%d", l.MaxStateBytes, CeilingStateBytes)
	}
	if l.TimeoutSeconds < 1 || l.TimeoutSeconds > CeilingTimeout {
		return fmt.Errorf("timeout %d outside 1..%d seconds", l.TimeoutSeconds, CeilingTimeout)
	}
	return nil
}

func (l Limits) args() []string {
	return []string{
		"--max-steps", strconv.Itoa(l.MaxSteps),
		"--max-evals", strconv.Itoa(l.MaxEvals),
		"--max-state-bytes", strconv.Itoa(l.MaxStateBytes),
	}
}

func treeRSS(pid int) (int64, error) {
	seen := map[int]struct{}{}
	var walk func(int) (int64, error)
	walk = func(pid int) (int64, error) {
		if _, ok := seen[pid]; ok {
			return 0, nil
		}
		seen[pid] = struct{}{}
		rss, err := processRSS(pid)
		if err != nil {
			if os.IsNotExist(err) {
				return 0, nil
			}
			return 0, err
		}
		kids, err := processChildren(pid)
		if err != nil && !os.IsNotExist(err) {
			return 0, err
		}
		total := rss
		for _, child := range kids {
			part, err := walk(child)
			if err != nil {
				return 0, err
			}
			total += part
		}
		return total, nil
	}
	return walk(pid)
}

func processRSS(pid int) (int64, error) {
	text, err := os.ReadFile(fmt.Sprintf("/proc/%d/statm", pid))
	if err != nil {
		return 0, err
	}
	fields := strings.Fields(string(text))
	if len(fields) < 2 {
		return 0, fmt.Errorf("/proc/%d/statm has no resident field", pid)
	}
	pages, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("/proc/%d/statm resident: %w", pid, err)
	}
	return pages * int64(os.Getpagesize()), nil
}

func processChildren(pid int) ([]int, error) {
	text, err := os.ReadFile(fmt.Sprintf("/proc/%d/task/%d/children", pid, pid))
	if err != nil {
		return nil, err
	}
	var kids []int
	for _, field := range strings.Fields(string(text)) {
		child, err := strconv.Atoi(field)
		if err != nil {
			return nil, fmt.Errorf("/proc/%d children: %w", pid, err)
		}
		kids = append(kids, child)
	}
	return kids, nil
}

func killGroup(pid int) {
	_ = syscall.Kill(-pid, syscall.SIGKILL)
	_ = syscall.Kill(pid, syscall.SIGKILL)
}
