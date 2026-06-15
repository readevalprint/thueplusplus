// SPDX-License-Identifier: AGPL-3.0-or-later
//go:build js

package thuepp

import (
	"fmt"
	"time"
)

type processResource struct {
	name    string
	command string
}

func newProcessResource(name, command string) *processResource {
	return &processResource{name: name, command: command}
}

func (r *processResource) IsPipeResource() bool { return true }

func (r *processResource) unsupported() error {
	return fmt.Errorf("subprocess resources are not supported in this build")
}

func (r *processResource) ReadLines(count int, timeout time.Duration) (string, error) {
	return "", r.unsupported()
}
func (r *processResource) ReadBytes(count int, timeout time.Duration) ([]byte, error) {
	return nil, r.unsupported()
}
func (r *processResource) WriteString(content string) error { return r.unsupported() }
func (r *processResource) Cleanup()                         {}

type commandResource struct {
	name    string
	command string
}

func newCommandResource(name, command string) *commandResource {
	return &commandResource{name: name, command: command}
}

func (r *commandResource) InvokeCommand(content string, timeout time.Duration) string {
	return "!spawn||" + pctEncode("subprocess resources are not supported in this build")
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
