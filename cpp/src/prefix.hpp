#ifndef THUE_PREFIX_HPP_
#define THUE_PREFIX_HPP_

#include <string>

namespace thuelang {

// Literal text that begins every match of lhs. Empty means the runner
// must search. A miss is not a match. A hit still runs the regex.
std::string LiteralPrefix(const std::string& lhs);

}  // namespace thuelang

#endif  // THUE_PREFIX_HPP_
