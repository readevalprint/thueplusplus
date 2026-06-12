(write "Content-Type: text/plain\r\n\r\n")
(write "method=")
(write (arg "REQUEST_METHOD"))
(write "
path=")
(write (arg "PATH_INFO"))
(write "
query=")
(write (arg "QUERY_STRING"))
(write "
")
