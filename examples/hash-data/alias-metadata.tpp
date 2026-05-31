# SPDX-License-Identifier: AGPL-3.0-or-later
TOKEN <- ok
^$TOKEN$ ::= matched
^matched$ ::> stdout matched\n
^(?<any>.+)$ ::> stdout fallback:{{any}}\n
