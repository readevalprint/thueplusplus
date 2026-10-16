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

type ProgramRun struct {
	Stdout   string
	Stderr   string
	Exit     int
	Steps    *int
	Probes   *int
	Duration time.Duration
	Err      error
}

func runBounded(argv []string, timeoutSeconds int, stdin string) ProgramRun {
	started := time.Now()
	finish := func(run ProgramRun) ProgramRun {
		run.Duration = time.Since(started)
		return run
	}
	if _, err := os.Stat("/proc/self"); err != nil {
		return finish(ProgramRun{Err: fmt.Errorf("task runs need /proc to enforce the memory cap: %w", err)})
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
	cmd.Env = append(env, fmt.Sprintf("GOMEMLIMIT=%dB", MemoryCapBytes))
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
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	deadline := time.Now().Add(time.Duration(timeoutSeconds) * time.Second)
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	var reason error
	var waitErr error
	waited := false
	for !waited && reason == nil {
		select {
		case waitErr = <-done:
			waited = true
		case <-ticker.C:
			rss, rssErr := treeRSS(cmd.Process.Pid)
			if rssErr != nil {
				reason = fmt.Errorf("memory cap check failed: %w", rssErr)
				killGroup(cmd.Process.Pid)
				break
			}
			if rss > MemoryCapBytes {
				reason = fmt.Errorf("memory cap (%d bytes) exceeded (rss %d bytes)", MemoryCapBytes, rss)
				killGroup(cmd.Process.Pid)
				break
			}
			if !time.Now().Before(deadline) {
				reason = fmt.Errorf("timed out after %ds", timeoutSeconds)
				killGroup(cmd.Process.Pid)
			}
		}
	}
	if !waited {
		select {
		case waitErr = <-done:
		case <-time.After(5 * time.Second):
			reason = fmt.Errorf("bounded run did not exit after kill")
		}
	}
	readers.Wait()
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

func readCounts(path string) (int, int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, 0, err
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return 0, 0, fmt.Errorf("counts: %w", err)
	}
	steps, ok := raw["applied_steps"]
	if !ok {
		return 0, 0, fmt.Errorf("counts missing applied_steps")
	}
	probes, ok := raw["probes"]
	if !ok {
		return 0, 0, fmt.Errorf("counts missing probes")
	}
	stepN, err := whole(steps)
	if err != nil {
		return 0, 0, fmt.Errorf("applied_steps: %w", err)
	}
	probeN, err := whole(probes)
	if err != nil {
		return 0, 0, fmt.Errorf("probes: %w", err)
	}
	return stepN, probeN, nil
}

func whole(value any) (int, error) {
	number, ok := value.(float64)
	if !ok || number < 0 || number != float64(int(number)) {
		return 0, fmt.Errorf("not a non-negative integer (%v)", value)
	}
	return int(number), nil
}
