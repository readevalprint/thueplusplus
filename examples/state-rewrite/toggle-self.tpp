# SPDX-License-Identifier: AGPL-3.0-or-later
^START:toggle$ ::= HALT:toggle
^HALT:toggle$ ::> stdout toggled self\n
::=
START:toggle
