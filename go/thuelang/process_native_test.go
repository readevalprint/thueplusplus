//go:build !js

package thuelang

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestProcessReadLineSurvivesConcurrentExit(t *testing.T) {
	const n = 32
	var wg sync.WaitGroup
	errCh := make(chan error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resource := newProcessResource("worker", "printf 'alpha\\n'")
			defer resource.Cleanup()
			line, err := resource.ReadLine(2 * time.Second)
			if err != nil {
				errCh <- err
				return
			}
			if line != "alpha" {
				errCh <- fmt.Errorf("got %q", line)
			}
		}()
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Error(err)
	}
}
