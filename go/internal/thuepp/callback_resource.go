package thuepp

import "time"

// CallbackResource is a host-supplied resource implementation for embedders
// such as the Go WASM bridge. All methods should fail loudly when unsupported.
type CallbackResource interface {
	ReadAll() (string, error)
	ReadLine(timeout time.Duration) (string, error)
	WriteString(content string) error
	Cleanup()
}

// AddCallbackBinding binds a host callback resource to a literal resource name.
func (i *Interpreter) AddCallbackBinding(name, pathOrCommand string, resource CallbackResource) {
	i.Bindings[name] = &Binding{Name: name, PathOrCommand: pathOrCommand, Resource: resource}
}
