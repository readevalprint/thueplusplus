//go:build !js

package thuepp

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"time"
)

type processResource struct {
	name    string
	command string
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	stdout  io.ReadCloser
	stderr  bytes.Buffer
	outCh   chan string
	exitCh  chan error
}

func newProcessResource(name, command string) *processResource {
	return &processResource{name: name, command: command}
}

func (r *processResource) ensureStarted() error {
	if r.cmd != nil {
		return nil
	}
	r.cmd = exec.Command("/bin/sh", "-c", "stdbuf -oL "+r.command)
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
	r.outCh = make(chan string, 1024)
	r.exitCh = make(chan error, 1)
	if err := r.cmd.Start(); err != nil {
		return err
	}
	go func() {
		reader := bufio.NewReader(r.stdout)
		for {
			line, err := reader.ReadString('\n')
			if line != "" {
				r.outCh <- line
			}
			if err != nil {
				close(r.outCh)
				return
			}
		}
	}()
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

func (r *processResource) ReadLine(timeout time.Duration) (string, error) {
	if err := r.ensureStarted(); err != nil {
		return "", err
	}
	select {
	case line, ok := <-r.outCh:
		if !ok {
			return "", fmt.Errorf("EOF before newline")
		}
		stripped, complete := stripLineTerminator(line)
		if !complete {
			return "", fmt.Errorf("EOF before newline")
		}
		return stripped, nil
	case <-time.After(timeout):
		return "", fmt.Errorf("timeout")
	case err := <-r.exitCh:
		lineTimeout := 100 * time.Millisecond
		if timeout < lineTimeout {
			lineTimeout = timeout
		}
		select {
		case line, ok := <-r.outCh:
			if ok {
				stripped, complete := stripLineTerminator(line)
				if !complete {
					return "", fmt.Errorf("EOF before newline")
				}
				return stripped, nil
			}
		case <-time.After(lineTimeout):
		}
		if exitErr := r.exitError(err); exitErr != nil {
			return "", exitErr
		}
		return "", fmt.Errorf("EOF before newline")
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
		_ = r.cmd.Process.Kill()
		_, _ = r.cmd.Process.Wait()
	}
}
