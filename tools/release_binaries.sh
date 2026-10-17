#!/bin/sh
# Build thue for this machine and pack one archive per host.
# The C++ binary links RE2 statically. The argument is the expected target
# triple: linux-x86_64, linux-arm64, darwin-x86_64, or darwin-arm64.

set -eu

triple=${1:?usage: release_binaries.sh linux-x86_64|linux-arm64|darwin-x86_64|darwin-arm64}

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) actual=linux-x86_64 ;;
  Linux-aarch64|Linux-arm64) actual=linux-arm64 ;;
  Darwin-x86_64) actual=darwin-x86_64 ;;
  Darwin-arm64) actual=darwin-arm64 ;;
  *)
    echo "unsupported host $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac
if [ "$triple" != "$actual" ]; then
  echo "runner is $actual, argument is $triple" >&2
  exit 1
fi

python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' || {
  echo "python3 >= 3.11 is required" >&2
  exit 127
}

for cmd in git cmake g++ pkg-config go cargo python3 make tar; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "missing $cmd" >&2
    exit 127
  }
done

version=$(python3 tools/check_versions.py --print)
out="$root/build/release"
prefix="$root/build/re2-static"
src="$root/build/re2-src"
absl="$root/build/abseil-src"

rm -rf "$out" "$prefix" "$src" "$absl" "$root/build/cpp"
mkdir -p "$out"

# re2 2024-07-02 requires abseil-cpp 20240116.2 (see re2 MODULE.bazel).
git clone --depth 1 --branch 20240116.2 https://github.com/abseil/abseil-cpp.git "$absl"
cmake -S "$absl" -B "$absl/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$prefix" \
  -DCMAKE_CXX_STANDARD=17 \
  -DCMAKE_CXX_COMPILER=g++ \
  -DABSL_PROPAGATE_CXX_STD=ON \
  -DABSL_BUILD_TESTING=OFF \
  -DABSL_ENABLE_INSTALL=ON \
  -DBUILD_SHARED_LIBS=OFF
cmake --build "$absl/build" --parallel --target install

git clone --depth 1 --branch 2024-07-02 https://github.com/google/re2.git "$src"
cmake -S "$src" -B "$src/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DRE2_BUILD_TESTING=OFF \
  -DCMAKE_INSTALL_PREFIX="$prefix" \
  -DCMAKE_PREFIX_PATH="$prefix" \
  -DCMAKE_CXX_STANDARD=17 \
  -DCMAKE_CXX_COMPILER=g++
cmake --build "$src/build" --parallel --target install

pc=$(find "$prefix" -name re2.pc | head -n 1)
if [ -z "$pc" ]; then
  echo "re2.pc was not installed under $prefix" >&2
  exit 1
fi
export PKG_CONFIG_PATH="$(dirname "$pc")${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
echo "re2 static link line: $(pkg-config --static --libs re2)"

make cpp THUELANG_RE2_STATIC=1

case "$triple" in
  linux-*)
    if ldd "$root/build/cpp/thue" | grep -E 'libre2\.so|libabsl'; then
      echo "C++ thue dynamically links RE2 or Abseil" >&2
      exit 1
    fi
    ;;
  darwin-*)
    if otool -L "$root/build/cpp/thue" | grep -E 'libre2|libabsl'; then
      echo "C++ thue dynamically links RE2 or Abseil" >&2
      exit 1
    fi
    ;;
esac

CGO_ENABLED=0 go build -C go -trimpath -ldflags '-s -w' -o "$out/thue-go" ./cmd/thue
cargo build --locked --release --manifest-path rust/Cargo.toml
cp rust/target/release/thue "$out/thue-rust"
cp "$root/build/cpp/thue" "$out/thue-cpp"

for host in go rust cpp; do
  bin="$out/thue-$host"
  status=0
  "$bin" >/dev/null 2>&1 || status=$?
  if [ "$status" -ne 2 ]; then
    echo "$bin with no args exited $status, want 2" >&2
    exit 1
  fi
  stage=$(mktemp -d)
  cp "$bin" "$stage/thue"
  chmod 755 "$stage/thue"
  COPYFILE_DISABLE=1 tar -C "$stage" -czf "$out/thue-${version}-${host}-${triple}.tar.gz" thue
  rm -rf "$stage"
  rm -f "$bin"
done

echo "wrote $(find "$out" -name '*.tar.gz' | wc -l | tr -d ' ') archives in $out"
