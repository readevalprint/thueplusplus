// SPDX-License-Identifier: AGPL-3.0-or-later
//go:build !js

package thuepp

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
)

type processResource struct {
	name     string
	command  string
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	stdout   io.ReadCloser
	reader   *bufio.Reader
	stderr   bytes.Buffer
	exitCh   chan error
	stopOnce sync.Once
	mu       sync.Mutex
}

func newProcessResource(name, command string) *processResource {
	return &processResource{name: name, command: command}
}

func (r *processResource) ensureStarted() error {
	if r.cmd != nil {
		return nil
	}
	r.cmd = exec.Command("/bin/sh", "-c", "stdbuf -oL "+r.command)
	r.cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	r.cmd.Stderr = &r.stderr
	var err error
	r.stdin, err = r.cmd.StdinPipe()
	if err != nil {
		return err
	}
	r.stdout, err = r.cmd.StdoutPipe()
	if err != nil {
		return err
	}
	r.reader = bufio.NewReader(r.stdout)
	r.exitCh = make(chan error, 1)
	if err := r.cmd.Start(); err != nil {
		return err
	}
	go func() { r.exitCh <- r.cmd.Wait() }()
	return nil
}

func (r *processResource) exitError(err error) error {
	if err == nil {
		return nil
	}
	msg := strings.TrimSpace(r.stderr.String())
	if msg == "" {
		msg = fmt.Sprintf("process exited %d", r.cmd.ProcessState.ExitCode())
	}
	return fmt.Errorf("%s", msg)
}

func (r *processResource) eofOrExitError(fallback string) error {
	select {
	case err := <-r.exitCh:
		if exitErr := r.exitError(err); exitErr != nil {
			return exitErr
		}
	case <-time.After(50 * time.Millisecond):
	}
	return fmt.Errorf("%s", fallback)
}

func (r *processResource) ReadLines(count int, timeout time.Duration) (string, error) {
	if count == 0 {
		return "", nil
	}
	if err := r.ensureStarted(); err != nil {
		return "", err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	resultCh := make(chan struct {
		content string
		err     error
	}, 1)
	go func() {
		lines := make([]string, 0, count)
		for idx := 0; idx < count; idx++ {
			line, err := r.reader.ReadString('\n')
			if err != nil {
				resultCh <- struct {
					content string
					err     error
				}{"", r.eofOrExitError(fmt.Sprintf("EOF before %d lines", count))}
				return
			}
			stripped, complete := stripLineTerminator(line)
			if !complete {
				resultCh <- struct {
					content string
					err     error
				}{"", fmt.Errorf("EOF before %d lines", count)}
				return
			}
			lines = append(lines, stripped)
		}
		resultCh <- struct {
			content string
			err     error
		}{strings.Join(lines, "\n"), nil}
	}()
	select {
	case result := <-resultCh:
		return result.content, result.err
	case <-time.After(timeout):
		return "", fmt.Errorf("timeout")
	}
}

func (r *processResource) ReadBytes(count int, timeout time.Duration) ([]byte, error) {
	if count == 0 {
		return []byte{}, nil
	}
	if err := r.ensureStarted(); err != nil {
		return nil, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	resultCh := make(chan struct {
		content []byte
		err     error
	}, 1)
	go func() {
		buf := make([]byte, count)
		_, err := io.ReadFull(r.reader, buf)
		if err != nil {
			resultCh <- struct {
				content []byte
				err     error
			}{nil, r.eofOrExitError(fmt.Sprintf("EOF before %d bytes", count))}
			return
		}
		resultCh <- struct {
			content []byte
			err     error
		}{buf, nil}
	}()
	select {
	case result := <-resultCh:
		return result.content, result.err
	case <-time.After(timeout):
		return nil, fmt.Errorf("timeout")
	}
}

func (r *processResource) WriteString(content string) error {
	if err := r.ensureStarted(); err != nil {
		return err
	}
	_, err := io.WriteString(r.stdin, content)
	return err
}

func (r *processResource) Cleanup() {
	if r.cmd != nil && r.cmd.Process != nil {
		r.stopOnce.Do(func() { _ = syscall.Kill(-r.cmd.Process.Pid, syscall.SIGKILL) })
	}
}
