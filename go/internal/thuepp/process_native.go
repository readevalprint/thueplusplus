// SPDX-License-Identifier: AGPL-3.0-or-later
//go:build !js

package thuepp

import (
	"bufio"
	"bytes"
	"context"
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
	stderr   io.ReadCloser
	eventCh  chan string
	stopOnce sync.Once
	mu       sync.Mutex
}

func newProcessResource(name, command string) *processResource {
	return &processResource{name: name, command: command}
}

func (r *processResource) IsPipeResource() bool { return true }

func (r *processResource) ensureStarted() error {
	if r.cmd != nil {
		return nil
	}
	r.cmd = exec.Command("/bin/sh", "-c", "stdbuf -oL "+r.command)
	r.cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	var err error
	r.stdin, err = r.cmd.StdinPipe()
	if err != nil {
		return err
	}
	r.stdout, err = r.cmd.StdoutPipe()
	if err != nil {
		return err
	}
	r.stderr, err = r.cmd.StderrPipe()
	if err != nil {
		return err
	}
	r.eventCh = make(chan string, 64)
	if err := r.cmd.Start(); err != nil {
		return err
	}
	var scannerWG sync.WaitGroup
	scannerWG.Add(2)
	go func() {
		defer scannerWG.Done()
		r.scanEvents("out", r.stdout)
	}()
	go func() {
		defer scannerWG.Done()
		r.scanEvents("err", r.stderr)
	}()
	go func() {
		scannerWG.Wait()
		err := r.cmd.Wait()
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				r.eventCh <- fmt.Sprintf("exit|%d", exitErr.ExitCode())
			} else {
				r.eventCh <- "fail|" + pctEncode(err.Error())
			}
			return
		}
		r.eventCh <- "exit|0"
	}()
	return nil
}

func (r *processResource) scanEvents(kind string, stream io.Reader) {
	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	for scanner.Scan() {
		r.eventCh <- kind + "|" + pctEncode(scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		r.eventCh <- "fail|" + pctEncode(err.Error())
	}
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
	deadline := time.After(timeout)
	events := make([]string, 0, count)
	for len(events) < count {
		select {
		case event := <-r.eventCh:
			events = append(events, event)
		case <-deadline:
			return "", fmt.Errorf("timeout")
		}
	}
	return strings.Join(events, "\n"), nil
}

func (r *processResource) ReadBytes(count int, timeout time.Duration) ([]byte, error) {
	if count == 0 {
		return []byte{}, nil
	}
	return nil, fmt.Errorf("byte reads are unsupported for pipe resources")
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

type commandResource struct {
	name    string
	command string
}

func newCommandResource(name, command string) *commandResource {
	return &commandResource{name: name, command: command}
}

func (r *commandResource) InvokeCommand(content string, timeout time.Duration) string {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "/bin/sh", "-c", r.command)
	cmd.Stdin = strings.NewReader(content)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return "!timeout|" + pctEncode(stdout.String()) + "|" + pctEncode(stderr.String())
	}
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return fmt.Sprintf("%d|%s|%s", exitErr.ExitCode(), pctEncode(stdout.String()), pctEncode(stderr.String()))
		}
		return "!spawn||" + pctEncode(err.Error())
	}
	return fmt.Sprintf("0|%s|%s", pctEncode(stdout.String()), pctEncode(stderr.String()))
}

func (r *commandResource) ReadLines(count int, timeout time.Duration) (string, error) {
	return "", fmt.Errorf("read requires pipe or input stream binding")
}
func (r *commandResource) ReadBytes(count int, timeout time.Duration) ([]byte, error) {
	return nil, fmt.Errorf("read requires pipe or input stream binding")
}
func (r *commandResource) WriteString(content string) error {
	return fmt.Errorf("write requires pipe or output stream binding")
}
func (r *commandResource) Cleanup() {}
