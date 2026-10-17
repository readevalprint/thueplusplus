// Exact rationals for the numeric builtins. Canonical form matches Go's big.Rat:
// reduced, positive denominator, integer when the denominator is 1, never -0.

#ifndef THUE_RATIONAL_HPP_
#define THUE_RATIONAL_HPP_

#include <algorithm>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace thuelang {
namespace rat {
namespace {

class Big {
 public:
  Big() = default;

  static Big FromU64(uint64_t value) {
    Big out;
    if (value == 0) {
      return out;
    }
    out.limbs_.push_back(static_cast<uint32_t>(value));
    value >>= 32;
    if (value != 0) {
      out.limbs_.push_back(static_cast<uint32_t>(value));
    }
    return out;
  }

  static Big ParseDigits(const std::string& digits) {
    Big out;
    for (char ch : digits) {
      out = out.MulSmall(10);
      out = out.AddSmall(static_cast<uint32_t>(ch - '0'));
    }
    return out;
  }

  bool IsZero() const { return limbs_.empty(); }
  bool Negative() const { return neg_; }
  void SetNegative(bool neg) { neg_ = neg && !IsZero(); }
  void Negate() { SetNegative(!neg_); }

  int CmpAbs(const Big& other) const {
    if (limbs_.size() != other.limbs_.size()) {
      return limbs_.size() < other.limbs_.size() ? -1 : 1;
    }
    for (size_t i = limbs_.size(); i-- > 0;) {
      if (limbs_[i] != other.limbs_[i]) {
        return limbs_[i] < other.limbs_[i] ? -1 : 1;
      }
    }
    return 0;
  }

  int Cmp(const Big& other) const {
    if (IsZero() && other.IsZero()) {
      return 0;
    }
    if (neg_ != other.neg_) {
      return neg_ ? -1 : 1;
    }
    int abs = CmpAbs(other);
    return neg_ ? -abs : abs;
  }

  Big Add(const Big& other) const {
    if (neg_ == other.neg_) {
      Big out = AddAbs(*this, other);
      out.neg_ = neg_;
      return out;
    }
    int cmp = CmpAbs(other);
    if (cmp == 0) {
      return Big();
    }
    if (cmp > 0) {
      Big out = SubAbs(*this, other);
      out.neg_ = neg_;
      return out;
    }
    Big out = SubAbs(other, *this);
    out.neg_ = other.neg_;
    return out;
  }

  Big Sub(const Big& other) const {
    Big flipped = other;
    flipped.Negate();
    return Add(flipped);
  }

  Big Mul(const Big& other) const {
    if (IsZero() || other.IsZero()) {
      return Big();
    }
    Big out;
    out.limbs_.assign(limbs_.size() + other.limbs_.size(), 0);
    for (size_t i = 0; i < limbs_.size(); ++i) {
      uint64_t carry = 0;
      for (size_t j = 0; j < other.limbs_.size(); ++j) {
        uint64_t cur = out.limbs_[i + j] + carry +
                       static_cast<uint64_t>(limbs_[i]) * other.limbs_[j];
        out.limbs_[i + j] = static_cast<uint32_t>(cur);
        carry = cur >> 32;
      }
      out.limbs_[i + other.limbs_.size()] = static_cast<uint32_t>(carry);
    }
    out.Trim();
    out.neg_ = neg_ != other.neg_;
    return out;
  }

  // Quotient and non-negative remainder of |*this| / |divisor|.
  void DivModAbs(const Big& divisor, Big& quot, Big& rem) const {
    if (divisor.IsZero()) {
      throw std::logic_error("division by zero");
    }
    quot = Big();
    rem = Big();
    if (IsZero()) {
      return;
    }
    if (CmpAbs(divisor) < 0) {
      rem = Abs();
      return;
    }
    int bits = BitLength();
    for (int i = bits - 1; i >= 0; --i) {
      rem.Shl1();
      if (TestBit(i)) {
        rem = rem.AddSmall(1);
      }
      quot.Shl1();
      if (rem.CmpAbs(divisor) >= 0) {
        rem = SubAbs(rem, divisor.Abs());
        quot = quot.AddSmall(1);
      }
    }
  }

  Big Quo(const Big& divisor) const {
    Big q;
    Big r;
    DivModAbs(divisor, q, r);
    q.neg_ = !q.IsZero() && (neg_ != divisor.neg_);
    return q;
  }

  // Non-negative remainder. Both values are non-negative integers.
  Big Mod(const Big& divisor) const {
    Big q;
    Big r;
    DivModAbs(divisor, q, r);
    return r;
  }

  std::string Decimal() const {
    if (IsZero()) {
      return "0";
    }
    Big cursor = Abs();
    std::string digits;
    while (!cursor.IsZero()) {
      uint32_t rem = 0;
      cursor = cursor.DivSmall(10, rem);
      digits.push_back(static_cast<char>('0' + rem));
    }
    if (neg_) {
      digits.push_back('-');
    }
    std::reverse(digits.begin(), digits.end());
    return digits;
  }

  Big Abs() const {
    Big out = *this;
    out.neg_ = false;
    return out;
  }

  static Big Gcd(Big a, Big b) {
    a = a.Abs();
    b = b.Abs();
    while (!b.IsZero()) {
      Big q;
      Big r;
      a.DivModAbs(b, q, r);
      a = std::move(b);
      b = std::move(r);
    }
    return a;
  }

 private:
  bool neg_ = false;
  std::vector<uint32_t> limbs_;

  void Trim() {
    while (!limbs_.empty() && limbs_.back() == 0) {
      limbs_.pop_back();
    }
    if (limbs_.empty()) {
      neg_ = false;
    }
  }

  static Big AddAbs(const Big& a, const Big& b) {
    Big out;
    size_t n = std::max(a.limbs_.size(), b.limbs_.size());
    out.limbs_.resize(n, 0);
    uint64_t carry = 0;
    for (size_t i = 0; i < n; ++i) {
      uint64_t av = i < a.limbs_.size() ? a.limbs_[i] : 0;
      uint64_t bv = i < b.limbs_.size() ? b.limbs_[i] : 0;
      uint64_t cur = av + bv + carry;
      out.limbs_[i] = static_cast<uint32_t>(cur);
      carry = cur >> 32;
    }
    if (carry != 0) {
      out.limbs_.push_back(static_cast<uint32_t>(carry));
    }
    return out;
  }

  static Big SubAbs(const Big& a, const Big& b) {
    Big out;
    out.limbs_.resize(a.limbs_.size(), 0);
    int64_t borrow = 0;
    for (size_t i = 0; i < a.limbs_.size(); ++i) {
      int64_t bv = i < b.limbs_.size() ? b.limbs_[i] : 0;
      int64_t cur = static_cast<int64_t>(a.limbs_[i]) - bv - borrow;
      if (cur < 0) {
        cur += 1LL << 32;
        borrow = 1;
      } else {
        borrow = 0;
      }
      out.limbs_[i] = static_cast<uint32_t>(cur);
    }
    out.Trim();
    return out;
  }

  Big MulSmall(uint32_t m) const {
    if (m == 0 || IsZero()) {
      return Big();
    }
    Big out;
    out.limbs_.resize(limbs_.size() + 1, 0);
    uint64_t carry = 0;
    for (size_t i = 0; i < limbs_.size(); ++i) {
      uint64_t cur = static_cast<uint64_t>(limbs_[i]) * m + carry;
      out.limbs_[i] = static_cast<uint32_t>(cur);
      carry = cur >> 32;
    }
    if (carry != 0) {
      out.limbs_[limbs_.size()] = static_cast<uint32_t>(carry);
    }
    out.Trim();
    out.neg_ = neg_;
    return out;
  }

  Big AddSmall(uint32_t m) const {
    Big other = FromU64(m);
    other.neg_ = false;
    Big self = *this;
    bool saved = self.neg_;
    self.neg_ = false;
    Big out = AddAbs(self, other);
    out.neg_ = saved;
    return out;
  }

  Big DivSmall(uint32_t d, uint32_t& rem) const {
    Big out;
    out.limbs_.assign(limbs_.size(), 0);
    uint64_t rest = 0;
    for (size_t i = limbs_.size(); i-- > 0;) {
      rest = (rest << 32) | limbs_[i];
      out.limbs_[i] = static_cast<uint32_t>(rest / d);
      rest %= d;
    }
    out.Trim();
    rem = static_cast<uint32_t>(rest);
    return out;
  }

  int BitLength() const {
    if (limbs_.empty()) {
      return 0;
    }
    uint32_t top = limbs_.back();
    int bits = static_cast<int>((limbs_.size() - 1) * 32);
    while (top != 0) {
      ++bits;
      top >>= 1;
    }
    return bits;
  }

  bool TestBit(int index) const {
    size_t limb = static_cast<size_t>(index) / 32;
    if (limb >= limbs_.size()) {
      return false;
    }
    return (limbs_[limb] >> (index % 32)) & 1u;
  }

  void Shl1() {
    if (IsZero()) {
      return;
    }
    uint32_t carry = 0;
    for (uint32_t& limb : limbs_) {
      uint32_t next = limb >> 31;
      limb = (limb << 1) | carry;
      carry = next;
    }
    if (carry != 0) {
      limbs_.push_back(carry);
    }
  }
};

struct Rational {
  Big num;
  Big den = Big::FromU64(1);

  bool IsZero() const { return num.IsZero(); }
  bool IsInt() const { return den.Cmp(Big::FromU64(1)) == 0; }
  int Sign() const { return num.IsZero() ? 0 : (num.Negative() ? -1 : 1); }

  void Normalize() {
    if (num.IsZero()) {
      num = Big();
      den = Big::FromU64(1);
      return;
    }
    den.SetNegative(false);
    Big g = Big::Gcd(num, den);
    if (g.Cmp(Big::FromU64(1)) != 0) {
      num = num.Quo(g);
      den = den.Quo(g);
    }
    den.SetNegative(false);
  }

  std::string Canonical() const {
    if (IsInt()) {
      return num.Decimal();
    }
    return num.Decimal() + "/" + den.Decimal();
  }
};

inline Rational Make(Big num, Big den) {
  Rational out;
  out.num = std::move(num);
  out.den = std::move(den);
  out.Normalize();
  return out;
}

inline Rational ParseCanonical(const std::string& text) {
  // Caller already checked the numeric grammar and the zero-denominator pattern.
  std::string body = text;
  bool neg = false;
  if (!body.empty() && body[0] == '-') {
    neg = true;
    body.erase(body.begin());
  }
  auto slash = body.find('/');
  auto dot = body.find('.');
  Rational out;
  if (slash != std::string::npos) {
    out.num = Big::ParseDigits(body.substr(0, slash));
    out.den = Big::ParseDigits(body.substr(slash + 1));
  } else if (dot != std::string::npos) {
    std::string whole = body.substr(0, dot);
    std::string frac = body.substr(dot + 1);
    out.num = Big::ParseDigits(whole + frac);
    std::string den_digits = "1" + std::string(frac.size(), '0');
    out.den = Big::ParseDigits(den_digits);
  } else {
    out.num = Big::ParseDigits(body);
    out.den = Big::FromU64(1);
  }
  if (neg) {
    out.num.Negate();
  }
  out.Normalize();
  return out;
}

inline Rational Add(const Rational& a, const Rational& b) {
  return Make(a.num.Mul(b.den).Add(b.num.Mul(a.den)), a.den.Mul(b.den));
}

inline Rational Sub(const Rational& a, const Rational& b) {
  return Make(a.num.Mul(b.den).Sub(b.num.Mul(a.den)), a.den.Mul(b.den));
}

inline Rational Mul(const Rational& a, const Rational& b) {
  return Make(a.num.Mul(b.num), a.den.Mul(b.den));
}

inline Rational Div(const Rational& a, const Rational& b) {
  Big den = a.den.Mul(b.num);
  Big num = a.num.Mul(b.den);
  if (den.Negative()) {
    den.Negate();
    num.Negate();
  }
  return Make(std::move(num), std::move(den));
}

}  // namespace
}  // namespace rat
}  // namespace thuelang

#endif  // THUE_RATIONAL_HPP_
