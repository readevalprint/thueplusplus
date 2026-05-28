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
	return fmt.Errorf("subprocess resources are not supported in GOOS=js/wasm (binding %q, command %q)", r.name, r.command)
}

func (r *processResource) ReadLine(timeout time.Duration) (string, error) { return "", r.unsupported() }
func (r *processResource) WriteString(content string) error               { return r.unsupported() }
func (r *processResource) Cleanup()                                       {}
