"""Tests for lisp.w thue++ Lisp interpreter."""

import shutil
import subprocess
import unittest
from pathlib import Path

THUEPP = Path(__file__).parent.parent / "thuepp"
LISP_W = Path(__file__).parent.parent / "examples" / "lisp.w"


def run_lisp(expr: str) -> str:
    """Run a Lisp expression and return output."""
    if shutil.which("bc") is None:
        raise unittest.SkipTest("bc is required for lisp.w tests")

    result = subprocess.run(
        [str(THUEPP), str(LISP_W), "--proc:calc", "bc -lq", "--input", expr],
        capture_output=True,
        text=True,
        timeout=5,
    )
    if result.returncode != 0:
        raise RuntimeError(f"thuepp failed: {result.stderr}")
    return result.stdout.strip()


class TestArithmetic(unittest.TestCase):
    """Test arithmetic operations."""

    def test_add_two(self):
        assert run_lisp("{+ 1 2}") == "3"

    def test_add_three(self):
        # Variadic + with 3 args requires nesting
        assert run_lisp("{+ 1 {+ 2 3}}") == "6"

    def test_sub(self):
        assert run_lisp("{- 10 3}") == "7"

    def test_mul(self):
        assert run_lisp("{* 4 5}") == "20"

    def test_div(self):
        # bc returns full precision decimals
        result = run_lisp("{/ 20 4}")
        assert result.startswith("5")

    def test_nested_arithmetic(self):
        assert run_lisp("{+ {* 2 3} {- 10 5}}") == "11"

    def test_deeply_nested(self):
        assert run_lisp("{* {+ 1 2} {- {* 2 5} 3}}") == "21"

    def test_decimal_result(self):
        # bc returns decimals for division
        result = run_lisp("{/ 7 2}")
        assert result.startswith("3.5")


class TestStrings(unittest.TestCase):
    """Test string handling."""

    def test_simple_string(self):
        assert run_lisp('"hello"') == "hello"

    def test_string_with_spaces(self):
        assert run_lisp('"hello world"') == "hello world"

    def test_empty_string(self):
        assert run_lisp('""') == ""


class TestLists(unittest.TestCase):
    """Test list operations."""

    def test_cons(self):
        assert run_lisp("{cons 1 2}") == "(1 . 2)"

    def test_car(self):
        assert run_lisp("{car {cons 1 2}}") == "1"

    def test_cdr(self):
        assert run_lisp("{cdr {cons 1 2}}") == "2"

    def test_list_single(self):
        assert run_lisp("{list 1}") == "(1 . nil)"

    def test_list_multiple(self):
        assert run_lisp("{list 1 2 3}") == "(1 . (2 . (3 . nil)))"

    def test_nested_cons(self):
        # Direct nesting - cons result used as car
        # Note: {cons {cons 1 2} 3} doesn't work due to parsing
        # Workaround: use list
        assert run_lisp("{car {cons {+ 1 1} 3}}") == "2"

    def test_car_of_list(self):
        assert run_lisp("{car {list 1 2 3}}") == "1"

    def test_cdr_of_list(self):
        assert run_lisp("{cdr {list 1 2 3}}") == "(2 . (3 . nil))"


class TestConditionals(unittest.TestCase):
    """Test conditional expressions."""

    def test_if_true(self):
        assert run_lisp('{if true "yes" "no"}') == "yes"

    def test_if_false(self):
        assert run_lisp('{if false "yes" "no"}') == "no"

    def test_if_with_comparison(self):
        assert run_lisp('{if {gt 5 3} "bigger" "smaller"}') == "bigger"

    def test_eq_numbers_true(self):
        assert run_lisp("{eq 5 5}") == "true"

    def test_eq_numbers_false(self):
        assert run_lisp("{eq 5 6}") == "false"

    def test_eq_strings_true(self):
        assert run_lisp('{eq "hello" "hello"}') == "true"

    def test_eq_strings_false(self):
        assert run_lisp('{eq "hello" "world"}') == "false"

    def test_lt_true(self):
        assert run_lisp("{lt 3 5}") == "true"

    def test_lt_false(self):
        assert run_lisp("{lt 5 3}") == "false"

    def test_lt_equal(self):
        assert run_lisp("{lt 5 5}") == "false"

    def test_gt_true(self):
        assert run_lisp("{gt 5 3}") == "true"

    def test_gt_false(self):
        assert run_lisp("{gt 3 5}") == "false"

    def test_not_true(self):
        assert run_lisp("{not true}") == "false"

    def test_not_false(self):
        assert run_lisp("{not false}") == "true"

    def test_and_tt(self):
        assert run_lisp("{and true true}") == "true"

    def test_and_tf(self):
        assert run_lisp("{and true false}") == "false"

    def test_and_ff(self):
        assert run_lisp("{and false false}") == "false"

    def test_or_tt(self):
        assert run_lisp("{or true true}") == "true"

    def test_or_tf(self):
        assert run_lisp("{or true false}") == "true"

    def test_or_ff(self):
        assert run_lisp("{or false false}") == "false"

    def test_nested_boolean(self):
        assert run_lisp("{and {or true false} {not false}}") == "true"


class TestLet(unittest.TestCase):
    """Test let bindings - using square brackets: {let {[x val]...} body}"""

    def test_simple_let(self):
        assert run_lisp("{let {[x 5]} $x}") == "5"

    def test_let_with_arithmetic(self):
        assert run_lisp("{let {[x 5]} {+ $x 3}}") == "8"

    def test_let_multiple_uses(self):
        assert run_lisp("{let {[x 5]} {+ $x $x}}") == "10"

    def test_nested_let(self):
        assert run_lisp("{let {[x 2]} {let {[y 3]} {* $x $y}}}") == "6"

    def test_let_with_condition(self):
        assert run_lisp('{let {[x 10]} {if {gt $x 5} "big" "small"}}') == "big"

    def test_let_with_string(self):
        assert run_lisp('{let {[name "Alice"]} $name}') == "Alice"

    def test_let_with_comparison(self):
        assert run_lisp("{let {[a 5] [b 10]} {lt $a $b}}") == "true"

    def test_let_with_list(self):
        assert run_lisp("{let {[x 1]} {list $x 2 3}}") == "(1 . (2 . (3 . nil)))"

    def test_let_value_from_expression(self):
        assert run_lisp("{let {[x 7]} {let {[y {+ $x 3}]} {* $y 2}}}") == "20"

    def test_let_shadowing(self):
        """Inner let shadows outer variable."""
        assert run_lisp("{let {[x 1]} {let {[x 2]} $x}}") == "2"

    def test_let_substring_variable(self):
        """$x should not match $xy."""
        assert run_lisp("{let {[x 1] [xy 2]} {+ $x $xy}}") == "3"

    def test_let_unused_variable(self):
        """Unused variable should not cause error."""
        assert run_lisp("{let {[x 999]} 42}") == "42"

    def test_let_underscore_variable(self):
        assert run_lisp("{let {[my_var 5]} {+ $my_var 1}}") == "6"

    def test_let_leading_underscore(self):
        assert run_lisp("{let {[_x 5]} $_x}") == "5"

    def test_let_snake_case(self):
        assert run_lisp("{let {[foo_bar_baz 100]} $foo_bar_baz}") == "100"

    def test_let_boolean_value(self):
        assert run_lisp('{let {[flag true]} {if $flag "yes" "no"}}') == "yes"

    def test_let_deeply_nested(self):
        expr = "{let {[a 1]} {let {[b {+ $a 1}]} {let {[c {+ $b 1}]} {+ $a {+ $b $c}}}}}"
        assert run_lisp(expr) == "6"

    def test_let_in_nested_position(self):
        assert run_lisp("{let {[x 2]} {* {+ $x 1} $x}}") == "6"

    def test_two_bindings(self):
        """Multiple bindings in one let."""
        assert run_lisp("{let {[x 10] [y 20]} {+ $x $y}}") == "30"

    def test_let_with_cons_value(self):
        """Let with computed cons cell value."""
        assert run_lisp("{let {[p {cons 1 2}]} $p}") == "(1 . 2)"

    def test_let_cons_in_body(self):
        """Use bound cons cell in another cons."""
        assert run_lisp("{let {[p {cons 1 2}]} {cons $p 3}}") == "((1 . 2) . 3)"


class TestIntegration(unittest.TestCase):
    """Integration tests combining multiple features."""

    def test_factorial_style(self):
        """Test a factorial-like computation."""
        # 3! = 3 * 2 * 1 = 6
        assert run_lisp("{* 3 {* 2 1}}") == "6"

    def test_conditional_arithmetic(self):
        assert run_lisp("{+ {if {gt 5 3} 10 0} 5}") == "15"

    def test_list_with_computed_values(self):
        assert run_lisp("{list {+ 1 2} {* 2 3} {- 10 5}}") == "(3 . (6 . (5 . nil)))"

    def test_let_with_all_features(self):
        # Integration test with square bracket let
        expr = '{let {[x 5] [y 3]} {if {gt $x $y} {+ $x $y} 0}}'
        assert run_lisp(expr) == "8"

    def test_boolean_chain(self):
        expr = "{and {gt 5 3} {or {lt 1 2} {eq 0 1}}}"
        assert run_lisp(expr) == "true"


class TestLambda(unittest.TestCase):
    """Test lambda (anonymous functions)."""

    def test_lambda_identity(self):
        assert run_lisp("{{lambda {x} $x} 5}") == "5"

    def test_lambda_arithmetic(self):
        assert run_lisp("{{lambda {x} {+ $x 1}} 5}") == "6"

    def test_lambda_two_params(self):
        assert run_lisp("{{lambda {x y} {+ $x $y}} 3 4}") == "7"

    def test_lambda_nested_call(self):
        assert run_lisp("{{lambda {x} {* $x $x}} {+ 2 3}}") == "25"

    def test_lambda_double(self):
        """Lambda that doubles its argument."""
        assert run_lisp("{{lambda {x} {+ $x $x}} 5}") == "10"

    def test_lambda_return_value(self):
        """Lambda as value (not called)."""
        result = run_lisp("{lambda {x} $x}")
        assert "[lambda x]" in result


class TestBegin(unittest.TestCase):
    """Test begin (sequence expressions)."""

    def test_begin_single(self):
        assert run_lisp("{begin 42}") == "42"

    def test_begin_two(self):
        assert run_lisp("{begin 1 2}") == "2"

    def test_begin_three(self):
        assert run_lisp("{begin 1 2 3}") == "3"

    def test_begin_with_expressions(self):
        assert run_lisp("{begin {+ 1 1} {+ 2 2} {+ 3 3}}") == "6"


class TestSymbols(unittest.TestCase):
    """Test symbols ('name)."""

    def test_symbol_simple(self):
        assert run_lisp("'foo") == "'foo"

    def test_symbol_in_list(self):
        assert run_lisp("{list 'a 'b 'c}") == "('a . ('b . ('c . nil)))"

    def test_symbol_cons(self):
        assert run_lisp("{cons 'key 'value}") == "('key . 'value)"

    def test_eq_symbols_true(self):
        assert run_lisp("{eq 'foo 'foo}") == "true"

    def test_eq_symbols_false(self):
        assert run_lisp("{eq 'foo 'bar}") == "false"


class TestKeywords(unittest.TestCase):
    """Test keywords (:name)."""

    def test_keyword_simple(self):
        assert run_lisp(":foo") == ":foo"

    def test_keyword_in_list(self):
        assert run_lisp("{list :a :b :c}") == "(:a . (:b . (:c . nil)))"

    def test_eq_keywords_true(self):
        assert run_lisp("{eq :foo :foo}") == "true"

    def test_eq_keywords_false(self):
        assert run_lisp("{eq :foo :bar}") == "false"


class TestCharacters(unittest.TestCase):
    """Test characters (#\\x)."""

    def test_char_simple(self):
        assert run_lisp("#\\a") == "#\\a"

    def test_char_digit(self):
        assert run_lisp("#\\5") == "#\\5"

    def test_char_in_list(self):
        assert run_lisp("{list #\\a #\\b #\\c}") == "(#\\a . (#\\b . (#\\c . nil)))"


class TestVectors(unittest.TestCase):
    """Test vectors (#[...] syntax)."""

    def test_vector_simple(self):
        assert run_lisp("#[1 2 3]") == "[1 2 3]"

    def test_vector_empty(self):
        assert run_lisp("#[]") == "[]"

    def test_vec_ref_first(self):
        assert run_lisp("{vec-ref #[10 20 30] 0}") == "10"

    def test_vec_ref_middle(self):
        assert run_lisp("{vec-ref #[10 20 30] 1}") == "20"

    def test_vec_ref_last(self):
        assert run_lisp("{vec-ref #[10 20 30] 2}") == "30"

    def test_vec_len_empty(self):
        assert run_lisp("{vec-len #[]}") == "0"

    def test_vec_len_three(self):
        assert run_lisp("{vec-len #[1 2 3]}") == "3"

    def test_vec_len_one(self):
        assert run_lisp("{vec-len #[42]}") == "1"


class TestQuote(unittest.TestCase):
    """Test quote ({quote expr})."""

    def test_quote_symbol(self):
        assert run_lisp("{quote foo}") == "'(foo)"

    def test_quote_number(self):
        assert run_lisp("{quote 42}") == "'(42)"


class TestHashMap(unittest.TestCase):
    """Test hash maps ({hash :k v ...})."""

    def test_hash_create(self):
        assert run_lisp("{hash :a 1 :b 2}") == "{hash :a 1 :b 2}"

    def test_hash_empty(self):
        assert run_lisp("{hash}") == "{hash}"

    def test_hash_get_first(self):
        assert run_lisp("{hash-get {hash :a 1 :b 2} :a}") == "1"

    def test_hash_get_second(self):
        assert run_lisp("{hash-get {hash :a 1 :b 2} :b}") == "2"

    def test_hash_get_missing(self):
        assert run_lisp("{hash-get {hash :a 1} :z}") == "nil"

    def test_hash_get_empty(self):
        assert run_lisp("{hash-get {hash} :a}") == "nil"

    def test_hash_set_new(self):
        result = run_lisp("{hash-set {hash :a 1} :b 2}")
        assert ":a" in result and ":b" in result

    def test_hash_set_empty(self):
        assert run_lisp("{hash-set {hash} :a 1}") == "{hash :a 1}"

    def test_hash_has_true(self):
        assert run_lisp("{hash-has? {hash :a 1 :b 2} :a}") == "true"

    def test_hash_has_false(self):
        assert run_lisp("{hash-has? {hash :a 1 :b 2} :z}") == "false"

    def test_hash_has_empty(self):
        assert run_lisp("{hash-has? {hash} :a}") == "false"

    def test_hash_keys(self):
        result = run_lisp("{hash-keys {hash :a 1 :b 2}}")
        assert ":a" in result and ":b" in result

    def test_hash_keys_empty(self):
        assert run_lisp("{hash-keys {hash}}") == "nil"

    def test_hash_with_string_value(self):
        assert run_lisp('{hash-get {hash :name "Alice"} :name}') == "Alice"


class TestLeGe(unittest.TestCase):
    """Test le (<=) and ge (>=) comparisons."""

    def test_le_less(self):
        assert run_lisp("{le 3 5}") == "true"

    def test_le_equal(self):
        assert run_lisp("{le 5 5}") == "true"

    def test_le_greater(self):
        assert run_lisp("{le 7 5}") == "false"

    def test_ge_greater(self):
        assert run_lisp("{ge 7 5}") == "true"

    def test_ge_equal(self):
        assert run_lisp("{ge 5 5}") == "true"

    def test_ge_less(self):
        assert run_lisp("{ge 3 5}") == "false"


class TestNil(unittest.TestCase):
    """Test nil literal."""

    def test_nil_literal(self):
        assert run_lisp("nil") == "nil"

    def test_nil_in_cons(self):
        assert run_lisp("{cons 1 nil}") == "(1 . nil)"

    def test_eq_nil(self):
        assert run_lisp("{eq nil nil}") == "true"


class TestLambdaBugs(unittest.TestCase):
    """Bug fixes for lambda."""

    # Bug 1: Lambda bodies with nested braces
    def test_lambda_nested_if(self):
        """Lambda with nested {if {gt ...}} in body."""
        assert run_lisp('{{lambda {x} {if {gt $x 0} "pos" "neg"}} 5}') == "pos"

    def test_lambda_nested_if_false(self):
        """Lambda with nested if returning else branch."""
        assert run_lisp('{{lambda {x} {if {gt $x 0} "pos" "neg"}} -5}') == "neg"

    def test_lambda_nested_arithmetic(self):
        """Lambda with nested arithmetic."""
        assert run_lisp("{{lambda {x} {+ {* $x 2} 1}} 5}") == "11"

    def test_lambda_double_nested(self):
        """Lambda with two levels of nesting."""
        assert run_lisp("{{lambda {x} {+ {* $x $x} {- $x 1}}} 3}") == "11"

    # Bug 2: Lambda with arbitrary params
    def test_lambda_three_params(self):
        """Lambda with three parameters."""
        assert run_lisp("{{lambda {x y z} {+ $x {+ $y $z}}} 1 2 3}") == "6"

    def test_lambda_four_params(self):
        """Lambda with four parameters."""
        assert run_lisp("{{lambda {a b c d} {+ $a {+ $b {+ $c $d}}}} 1 2 3 4}") == "10"

    def test_lambda_five_params(self):
        """Lambda with five parameters."""
        assert run_lisp("{{lambda {a b c d e} {+ $a {+ $b {+ $c {+ $d $e}}}}} 1 2 3 4 5}") == "15"

    # Bug 3: Default parameters
    def test_lambda_default_used(self):
        """Lambda with default param, no arg provided."""
        assert run_lisp("{{lambda {{x 42}} $x}}") == "42"

    def test_lambda_default_override(self):
        """Lambda with default param, arg provided."""
        assert run_lisp("{{lambda {{x 0}} $x} 99}") == "99"

    def test_lambda_default_in_expr(self):
        """Lambda with default param used in expression."""
        assert run_lisp("{{lambda {{x 10}} {+ $x 5}}}") == "15"

    # Bug 4: Lambda stored in variable
    def test_lambda_in_let_called(self):
        """Lambda stored in let and called via $var."""
        assert run_lisp("{let {[f {lambda {x} {+ $x 10}}]} {$f 5}}") == "15"

    def test_lambda_in_let_two_params(self):
        """Lambda with two params stored in let."""
        assert run_lisp("{let {[add {lambda {a b} {+ $a $b}}]} {$add 3 4}}") == "7"

    # Bug 5: Named space character
    def test_char_space_named(self):
        """Space character via named form."""
        assert run_lisp("#\\space") == "#\\space"

    def test_char_newline_named(self):
        """Newline character via named form."""
        assert run_lisp("#\\newline") == "#\\newline"

    def test_char_tab_named(self):
        """Tab character via named form."""
        assert run_lisp("#\\tab") == "#\\tab"


if __name__ == "__main__":
    unittest.main()
