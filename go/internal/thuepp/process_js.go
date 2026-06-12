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
