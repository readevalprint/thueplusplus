package harness

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Metrics struct {
	Cost         int
	Steps        int
	RegexEvals   int
	RegexMatches int
	StateBytes   int
	StatePeak    int
	RuleCount    int
	RuleChars    int
}

type ProgramRun struct {
	Stdout   string
	Stderr   string
	Exit     int
	Metrics  *Metrics
	Duration time.Duration
	Err      error
}

func runBounded(argv []string, timeoutSeconds int, memoryCap int, stdin string) ProgramRun {
	started := time.Now()
	finish := func(run ProgramRun) ProgramRun {
		run.Duration = time.Since(started)
		return run
	}
	if _, err := os.Stat("/proc/self"); err != nil {
		return finish(ProgramRun{Err: fmt.Errorf("runs need /proc to enforce the memory cap: %w", err)})
	}
	timeoutBin, err := exec.LookPath("timeout")
	if err != nil {
		return finish(ProgramRun{Err: fmt.Errorf("timeout(1) is required: %w", err)})
	}
	backstop := timeoutSeconds + 2
	wrapped := append([]string{timeoutBin, "-k", "1", fmt.Sprintf("%d", backstop)}, argv...)
	cmd := exec.Command(wrapped[0], wrapped[1:]...)
	cmd.Stdin = strings.NewReader(stdin)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Pdeathsig: syscall.SIGKILL}
	env := make([]string, 0, len(os.Environ())+1)
	for _, item := range os.Environ() {
		if strings.HasPrefix(item, "GOMEMLIMIT=") {
			continue
		}
		env = append(env, item)
	}
	cmd.Env = append(env, fmt.Sprintf("GOMEMLIMIT=%dB", memoryCap))
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return finish(ProgramRun{Err: err})
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return finish(ProgramRun{Err: err})
	}
	if err := cmd.Start(); err != nil {
		return finish(ProgramRun{Err: err})
	}
	var outBuf, errBuf bytes.Buffer
	var readers sync.WaitGroup
	readers.Add(2)
	go func() {
		defer readers.Done()
		_, _ = io.Copy(&outBuf, stdout)
	}()
	go func() {
		defer readers.Done()
		_, _ = io.Copy(&errBuf, stderr)
	}()
	// Wait closes the pipes. Reading them first keeps the bytes the child wrote.
	pipes := make(chan struct{})
	go func() {
		readers.Wait()
		close(pipes)
	}()
	deadline := time.Now().Add(time.Duration(timeoutSeconds) * time.Second)
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	var reason error
	closed := false
	for !closed && reason == nil {
		select {
		case <-pipes:
			closed = true
		case <-ticker.C:
			rss, rssErr := treeRSS(cmd.Process.Pid)
			if rssErr != nil {
				if os.IsNotExist(rssErr) {
					continue
				}
				reason = fmt.Errorf("memory cap check failed: %w", rssErr)
				killGroup(cmd.Process.Pid)
				break
			}
			if rss > int64(memoryCap) {
				reason = fmt.Errorf("memory cap (%d bytes) exceeded (rss %d bytes)", memoryCap, rss)
				killGroup(cmd.Process.Pid)
				break
			}
			if !time.Now().Before(deadline) {
				reason = fmt.Errorf("timed out after %ds", timeoutSeconds)
				killGroup(cmd.Process.Pid)
			}
		}
	}
	if !closed {
		select {
		case <-pipes:
		case <-time.After(5 * time.Second):
			reason = fmt.Errorf("bounded run did not exit after kill")
		}
	}
	waitErr := cmd.Wait()
	run := ProgramRun{Stdout: outBuf.String(), Stderr: errBuf.String()}
	if reason != nil {
		run.Err = reason
		return finish(run)
	}
	code := 0
	if waitErr != nil {
		exit, ok := waitErr.(*exec.ExitError)
		if !ok {
			run.Err = waitErr
			return finish(run)
		}
		code = exit.ExitCode()
	}
	if code == 124 || code == 137 {
		run.Err = fmt.Errorf("timed out after %ds (timeout(1) status %d)", timeoutSeconds, code)
		return finish(run)
	}
	run.Exit = code
	return finish(run)
}

func readMetrics(path string) (Metrics, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Metrics{}, err
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return Metrics{}, fmt.Errorf("metrics: %w", err)
	}
	keys := []string{
		"cost", "applied_steps", "regex_evals", "regex_matches",
		"state_bytes", "state_peak", "rule_count", "rule_chars",
	}
	if len(raw) != len(keys) {
		return Metrics{}, fmt.Errorf("metrics keys = %v", keysOf(raw))
	}
	vals := make([]int, len(keys))
	for i, key := range keys {
		value, ok := raw[key]
		if !ok {
			return Metrics{}, fmt.Errorf("metrics missing %s", key)
		}
		n, err := whole(value)
		if err != nil {
			return Metrics{}, fmt.Errorf("%s: %w", key, err)
		}
		vals[i] = n
	}
	return Metrics{
		Cost: vals[0], Steps: vals[1], RegexEvals: vals[2], RegexMatches: vals[3],
		StateBytes: vals[4], StatePeak: vals[5], RuleCount: vals[6], RuleChars: vals[7],
	}, nil
}

func keysOf(raw map[string]any) []string {
	out := make([]string, 0, len(raw))
	for key := range raw {
		out = append(out, key)
	}
	return out
}

func whole(value any) (int, error) {
	number, ok := value.(float64)
	if !ok || number < 0 || number != float64(int(number)) {
		return 0, fmt.Errorf("not a non-negative integer (%v)", value)
	}
	return int(number), nil
}
