# SPDX-License-Identifier: AGPL-3.0-or-later
NUMBER <- [0-9]+

PAYLOAD <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

@RANDOM_NUMBER@ ::< 5s 1 lines random

@PROMPT@ ::> stdout Guess:\n
@USER_GUESS@ ::< 30s 1 lines stdin

@INVALID_NUMBER@ ::> stdout Please enter digits only.\n
@TOO_LOW@ ::> stdout Too low.\n
@TOO_HIGH@ ::> stdout Too high.\n

@EQUAL\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! numeq guess secret
@LESS_THAN\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! lt guess secret

^SECRET<(?:out\|)?(?<secret>$NUMBER)>$ ::= @PROMPT@GUESS<{{secret}}|@USER_GUESS@>

^GUESS<(?<secret>$NUMBER)\|(?<guess>$NUMBER)>$ ::= CHECK<{{secret}}|{{guess}}|@EQUAL[{{guess}},{{secret}}]@>

^GUESS<(?<secret>$NUMBER)\|(?<bad>$PAYLOAD)>$ ::= @INVALID_NUMBER@SECRET<{{secret}}>

^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::> stdout Correct!\n
^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= DIRECTION<{{secret}}|{{guess}}|@LESS_THAN[{{guess}},{{secret}}]@>

^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::= @TOO_LOW@SECRET<{{secret}}>
^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= @TOO_HIGH@SECRET<{{secret}}>

::=
SECRET<@RANDOM_NUMBER@>
