package thuepp

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"time"
)

type runtimeResource interface {
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

func (r *outputResource) ReadLine(timeout time.Duration) (string, error) {
	return "", unnamedResourceError("cannot_read_output_stream")
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
