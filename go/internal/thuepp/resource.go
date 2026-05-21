package thuepp

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

type runtimeResource interface {
	ReadAll() (string, error)
	ReadLine(timeout time.Duration) (string, error)
	WriteString(content string) error
	Cleanup()
}

type resourceError struct {
	message  string
	omitName bool
}

func (e resourceError) Error() string { return e.message }

func unnamedResourceError(message string) error {
	return resourceError{message: message, omitName: true}
}

type stdinResource struct {
	name   string
	reader *bufio.Reader
}

func newStdinResource(name string, input io.Reader) *stdinResource {
	return &stdinResource{name: name, reader: bufio.NewReader(input)}
}

func (r *stdinResource) ReadAll() (string, error) {
	data, err := io.ReadAll(r.reader)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (r *stdinResource) ReadLine(timeout time.Duration) (string, error) {
	line, err := r.reader.ReadString('\n')
	if err != nil {
		return "", fmt.Errorf("EOF before newline")
	}
	stripped, ok := stripLineTerminator(line)
	if !ok {
		return "", fmt.Errorf("EOF before newline")
	}
	return stripped, nil
}

func (r *stdinResource) WriteString(content string) error {
	return fmt.Errorf("write requires process or output stream binding")
}

func (r *stdinResource) Cleanup() {}

type outputResource struct {
	writer *io.Writer
}

func (r *outputResource) ReadAll() (string, error) {
	return "", unnamedResourceError("cannot_read_output_stream")
}

func (r *outputResource) ReadLine(timeout time.Duration) (string, error) {
	return "", unnamedResourceError("cannot_read_output_stream")
}

func (r *outputResource) WriteString(content string) error {
	_, err := io.WriteString(*r.writer, content)
	return err
}

func (r *outputResource) Cleanup() {}

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

func (r *processResource) ReadAll() (string, error) {
	if err := r.ensureStarted(); err != nil {
		return "", err
	}
	var out strings.Builder
	deadline := time.After(100 * time.Millisecond)
	for {
		select {
		case s, ok := <-r.outCh:
			if ok {
				out.WriteString(s)
				deadline = time.After(100 * time.Millisecond)
				continue
			}
			return out.String(), nil
		case <-deadline:
			if out.Len() > 0 {
				return out.String(), nil
			}
			goto waitFirst
		case err := <-r.exitCh:
			if exitErr := r.exitError(err); exitErr != nil {
				return "", exitErr
			}
			return out.String(), nil
		}
	}

waitFirst:
	select {
	case s, ok := <-r.outCh:
		if ok {
			out.WriteString(s)
			return out.String(), nil
		}
		return "", nil
	case <-time.After(5 * time.Second):
		return "", nil
	case err := <-r.exitCh:
		if exitErr := r.exitError(err); exitErr != nil {
			return "", exitErr
		}
		return "", nil
	}
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
		select {
		case line, ok := <-r.outCh:
			if ok {
				stripped, complete := stripLineTerminator(line)
				if !complete {
					return "", fmt.Errorf("EOF before newline")
				}
				return stripped, nil
			}
		default:
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

type HostResources struct {
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
}

func NativeHostResources() HostResources {
	return HostResources{Stdin: os.Stdin, Stdout: os.Stdout, Stderr: os.Stderr}
}
