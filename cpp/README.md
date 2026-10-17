# C++ host

C++17 library and CLI for Thue++ spec v0.5. Patterns use the same regex syntax as the other hosts. The header is `include/thuelang/thuelang.hpp`. The CMake library target is `thuelang` (`thuelang::thuelang`). The CLI target is `thue-cli` and its output name is `thue`, so the static library and the binary do not share a filename.

This tree does not publish the library. `vcpkg.json` and `conanfile.py` are packaging sketches for a later release. Both use the name `thuelang`, matching the CMake target. Do not upload them to a registry from this repository.

## Build

Requirements: `g++` (C++17), CMake 3.16 or newer, `pkg-config`, and the regex library development package. Pass `g++` explicitly. On some images `/usr/bin/c++` is clang and cannot link `libstdc++`.

```bash
cmake -S cpp -B build/cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=g++
cmake --build build/cpp --parallel
```

`make cpp` runs those two commands. `make test` builds this host and runs the core conformance tier with `--impl cpp=./build/cpp/thue`. `make test-full` runs every manifest on this host and the others.

The CLI matches the other hosts. `--metrics PATH` writes the shared counters JSON, and `metrics()` returns that value. The program path is the first argument. Defaults are 1000000 applied steps, 1000000 probes, and 8388608 bytes of state. `unlimited` clears one limit. `0` is a real limit. Exit codes are 0, 1, 2, 10, 11, 12, and 13. `--trace` writes one JSON object per event. Every run outside the conformance runner still needs an explicit step limit, probe limit, and state limit, plus an OS timeout and a memory cap.

```bash
timeout -k 1 10 build/cpp/thue program.thue \
  --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608
```

## Library

```cpp
#include "thuelang/thuelang.hpp"

thuelang::Interpreter interp;
interp.LoadProgram("hello.thue");
int code = interp.Run();
```

`Run` returns the exit code on quiescence or `::-`. A limit throws `thuelang::LimitError` (`kind()`, `code()`, `what()`). Any other failure throws `std::runtime_error`. `std::nullopt` clears a limit. Eval count accumulates across `Run`. Applied steps and the trace reset on each `Run`.

Install with `cmake --install`. That installs the static library `thuelang`, the `thue` binary, and `include/thuelang/thuelang.hpp`.

## Tasks and metrics

`hosts.toml` registers this host for the metrics benchmark. Guest tasks run on native Go. The build line is `make cpp`, one command, because the task runner does not use a shell. The environment label is `cpp`. Older bench files omit `cpp`; a missing host is a gap, not an error.

## vcpkg

`vcpkg.json` lists the regex library. It is a manifest for a checkout, not a port in the vcpkg registry.

```bash
vcpkg install --triplet x64-linux
cmake -S cpp -B build/cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=g++ \
  -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
cmake --build build/cpp --parallel
```

The CMake build finds that library with `pkg-config`. A vcpkg install exports that file when `PKG_CONFIG_PATH` includes the triplet's `lib/pkgconfig`. Classic mode is the same dependency without the manifest.

## Conan

`conanfile.py` is a Conan 2 recipe. It requires the regex library and generates `pkg-config` files so the existing CMake build can find it. It is not in Conan Center.

```bash
cd cpp
conan profile detect --force
conan create . --build=missing
```

`conan create` builds this recipe. It does not publish it. Omit `conan upload`.
