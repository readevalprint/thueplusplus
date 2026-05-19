# Whole-document replacement can transform a marked data row before output.
^START:cycle$ ::= HALT:cycle
^HALT:cycle$ ::> stdout cycled self\n
START:cycle
