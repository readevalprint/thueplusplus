# SPDX-License-Identifier: AGPL-3.0-or-later
^START:cycle$ ::= HALT:cycle
^HALT:cycle$ ::> stdout cycled self\n
::=
START:cycle
