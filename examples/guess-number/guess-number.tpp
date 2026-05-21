# Guess the number.
#
# The startup proc named "random" prints one secret number. For example:
#   --proc:random "python3 -c 'import random; print(random.randint(1, 10))'"
#
# The game then reads guesses from stdin until the guess equals the secret.
# Resource reads enter state as PCT payloads, so invalid guesses can be
# matched safely by PAYLOAD and rejected before numeric builtins see them.

# Decimal whole numbers accepted for the secret and valid guesses.
NUMBER <- [0-9]+

# Any PCT-encoded stdin payload; used only by the invalid-guess fallback.
PAYLOAD <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

# Load the secret from the external random-number proc.
@RANDOM_NUMBER@ ::< 5 random

# Prompt and input resources.
@PROMPT@ ::> stdout Guess:\n
@USER_GUESS@ ::< 30 stdin

# Output messages.
@INVALID_NUMBER@ ::> stdout Please enter digits only.\n
@TOO_LOW@ ::> stdout Too low.\n
@TOO_HIGH@ ::> stdout Too high.\n

# Numeric builtin markers. They replace themselves with 1 for true or 0 for false.
@EQUAL\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! numeq guess secret
@LESS_THAN\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! lt guess secret

# Ask for a guess while preserving the secret.
^SECRET<(?<secret>$NUMBER)>$ ::= @PROMPT@GUESS<{{secret}}|@USER_GUESS@>

# Valid digit guesses go to equality checking.
^GUESS<(?<secret>$NUMBER)\|(?<guess>$NUMBER)>$ ::= CHECK<{{secret}}|{{guess}}|@EQUAL[{{guess}},{{secret}}]@>

# Anything else is an invalid PCT payload; print an error and ask again.
^GUESS<(?<secret>$NUMBER)\|(?<bad>$PAYLOAD)>$ ::= @INVALID_NUMBER@SECRET<{{secret}}>

# Equality succeeds: print the final message. The empty replacement stops execution.
^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::> stdout Correct!\n
# Equality fails: compute whether the guess is below the secret.
^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= DIRECTION<{{secret}}|{{guess}}|@LESS_THAN[{{guess}},{{secret}}]@>

# Direction result 1 means guess < secret. Direction result 0 means guess > secret.
^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::= @TOO_LOW@SECRET<{{secret}}>
^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= @TOO_HIGH@SECRET<{{secret}}>

# Initial state: load the random number, then enter SECRET<...>.
SECRET<@RANDOM_NUMBER@>
