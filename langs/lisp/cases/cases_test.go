package cases

import (
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
)

func TestCommonCases(t *testing.T) {
	harness.RunCommonLang(t, "lisp", "lisp")
}
