# SPDX-License-Identifier: AGPL-3.0-or-later
BAD <- (?P<x>[a-z]+)
^$BAD$ ::> stdout nope\n
abc
