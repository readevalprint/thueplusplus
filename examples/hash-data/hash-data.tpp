# SPDX-License-Identifier: AGPL-3.0-or-later
^(?<row>#wide:[^\n]*)$ ::= BROAD:{{row}}
^BROAD:(?<row>.*)$ ::> stdout broad={{row}}\n
^\#literal$ ::= ESCAPED
^ESCAPED$ ::> stdout escaped\n
^#(?<x>.*)$ ::= HASH:{{x}}
^HASH:(?<x>.*)$ ::> stdout hash={{x}}\n
::=
#abc
