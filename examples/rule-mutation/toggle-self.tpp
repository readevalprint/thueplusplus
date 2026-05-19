# Whole-document replacement can transform a marked data row before output.
^START:toggle$ ::= HALT:toggle
^HALT:toggle$ ::> stdout toggled self\n
START:toggle
