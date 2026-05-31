# SPDX-License-Identifier: AGPL-3.0-or-later
^#(?<x>.*)$ ::= HASH:{{x}}
^HASH:(?<x>.*)$ ::> stdout {{x}}
::=
#abc
