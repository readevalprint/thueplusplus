# Line-by-line row processing demonstration
# Comments are always skipped. Rules rewrite or consume only the first matching
# non-rule, non-comment row below the active rule, then restart from the top.

^result:$ ::> stdout Trimmed:\n\n
^[ \t]*(?<text>[^ \t].*[^ \t])[ \t]*$ ::> stdout {{text}}\n
result:
  hello world  
   indented line   
 another line 
