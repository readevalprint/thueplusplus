// SPDX-License-Identifier: AGPL-3.0-or-later
package thuepp

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strings"
	"time"
)

type runtimeResource interface {
	ReadLines(count int, timeout time.Duration) (string, error)
	ReadBytes(count int, timeout time.Duration) ([]byte, error)
	WriteString(content string) error
	Cleanup()
}

type commandInvoker interface {
	InvokeCommand(content string, timeout time.Duration) string
}

type pipeEventResource interface {
	IsPipeResource() bool
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

func (r *stdinResource) ReadLines(count int, timeout time.Duration) (string, error) {
	if count == 0 {
		return "", nil
	}
	lines := make([]string, 0, count)
	for idx := 0; idx < count; idx++ {
		line, err := r.reader.ReadString('\n')
		if err != nil {
			return "", fmt.Errorf("EOF before %d lines", count)
		}
		stripped, ok := stripLineTerminator(line)
		if !ok {
			return "", fmt.Errorf("EOF before %d lines", count)
		}
		lines = append(lines, stripped)
	}
	return strings.Join(lines, "\n"), nil
}

func (r *stdinResource) ReadBytes(count int, timeout time.Duration) ([]byte, error) {
	buf := make([]byte, count)
	_, err := io.ReadFull(r.reader, buf)
	if err != nil {
		return nil, fmt.Errorf("EOF before %d bytes", count)
	}
	return buf, nil
}

func (r *stdinResource) WriteString(content string) error {
	return fmt.Errorf("write requires process or output stream binding")
}

func (r *stdinResource) Cleanup() {}

type outputResource struct {
	writer *io.Writer
}

func (r *outputResource) ReadLines(count int, timeout time.Duration) (string, error) {
	return "", unnamedResourceError("cannot_read_output_stream")
}

func (r *outputResource) ReadBytes(count int, timeout time.Duration) ([]byte, error) {
	return nil, unnamedResourceError("cannot_read_output_stream")
}

func (r *outputResource) WriteString(content string) error {
	_, err := io.WriteString(*r.writer, content)
	return err
}

func (r *outputResource) Cleanup() {}

type HostResources struct {
	Stdin  io.Reader
	Stdout io.Writer
	Stderr io.Writer
}

func NativeHostResources() HostResources {
	return HostResources{Stdin: os.Stdin, Stdout: os.Stdout, Stderr: os.Stderr}
}
