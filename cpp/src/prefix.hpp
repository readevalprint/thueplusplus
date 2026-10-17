#ifndef THUEPP_PREFIX_HPP_
#define THUEPP_PREFIX_HPP_

#include <string>

namespace thuepp {

// Literal text that begins every match of lhs. Empty means the runner
// must search. A miss is not a match. A hit still runs the regex.
std::string LiteralPrefix(const std::string& lhs);

}  // namespace thuepp

#endif  // THUEPP_PREFIX_HPP_
