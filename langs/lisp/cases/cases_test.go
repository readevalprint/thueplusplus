package cases

import (
	"testing"

	"github.com/readevalprint/thueplusplus/problems/harness"
)

func TestCommonCases(t *testing.T) {
	harness.RunCommonLang(t, "lisp", "lisp")
}
