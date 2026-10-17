import { repositoryUrl, siteHosts, type SiteHost } from './hosts'

export const installNotes: Record<string, string> = {
  go: 'The native Go engine and the thue command.',
  python: 'The Python package and the thue console script.',
  wasm: 'The thuelang package with the thue CLI.',
  rust: 'The thuelang package with the thue CLI.',
  cpp: 'The CMake library and the thue command.',
  ruby: 'The thuelang gem and the thue command.',
  csharp: 'The Thuelang library and the thue command.',
}

for (const host of siteHosts) {
  if (!installNotes[host.id]) throw new Error(`install page has no note for ${host.id}`)
}
if (installNotes.wasm !== installNotes.rust) {
  throw new Error('the JavaScript install note must match the Rust package and CLI')
}

const blob = `${repositoryUrl}/blob/main`
const hostApi = { href: `${blob}/docs/host-api.md`, label: 'docs/host-api.md' }

export interface InstallBlock {
  lead: string
  body: string
}

export interface InstallApiLink {
  href: string
  label: string
}

export interface InstallSection {
  prose: string
  installLead: string
  install: string
  installAfter?: string
  installAfterBody?: string
  moreInstall: InstallBlock[]
  libraryLead: string
  library: string
  cliLead: string
  cli: string
  api: InstallApiLink[]
}

const copy: Record<string, InstallSection> = {
  go: {
    prose: 'The Go interpreter is the host behind go/cmd/thue and behind the WebAssembly module. A new interpreter binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits.',
    installLead: 'The module is not a released tag. This tracks main:',
    install: 'go get github.com/thuelang/thueplusplus/go@main',
    moreInstall: [],
    libraryLead: 'Import github.com/thuelang/thueplusplus/go/thuelang.',
    library: `import "github.com/thuelang/thueplusplus/go/thuelang"

interp := thuelang.New()
if err := interp.LoadProgram("hello.thue"); err != nil {
    panic(err)
}
code, err := interp.Run()
if err != nil {
    panic(err)
}
_ = code`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: '(cd go && go run ./cmd/thue ../program.thue --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608)',
    api: [hostApi],
  },
  python: {
    prose: 'The Python host is a native implementation. It uses the regex engine and the same default limits. Process bindings stay opt-in, the same way they do in Go.',
    installLead: 'The distribution is not on PyPI. From a checkout of this repository:',
    install: 'uv run thue program.thue',
    moreInstall: [],
    libraryLead: 'The PyPI distribution is thuelang. The import is thuelang.',
    library: `from thuelang import ThueInterpreter

interp = ThueInterpreter()
interp.load_program("hello.thue")
code = interp.run()`,
    cliLead: 'The console script is thue. Omitted limits use the defaults.',
    cli: 'uv run thue program.thue --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608',
    api: [hostApi],
  },
  wasm: {
    prose: 'The JavaScript host is the Go interpreter compiled to WebAssembly, not a second language written in JavaScript. This site\'s playground loads that module. It rejects process bindings. Runs from the page pass a step limit.',
    installLead: 'The package is not on npm. A checkout depends on the js/ directory:',
    install: '"thuelang": "file:../js"',
    moreInstall: [],
    libraryLead: 'The npm package name is thuelang. sourceText is the program.',
    library: `import { initThue } from 'thuelang'

const engine = await initThue()
const result = await engine.run({
  sourcePath: 'hello.thue',
  sourceText,
})`,
    cliLead: 'Build the WebAssembly module with make wasm first, or set THUE_WASM. From a checkout:',
    cli: 'node js/src/cli.js program.thue --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608',
    api: [hostApi, { href: `${blob}/js/README.md`, label: 'js/README.md' }],
  },
  rust: {
    prose: 'The Rust host is a native implementation. The crates.io package name and the Rust library are thuelang. The command is thue. It uses the regex engine and the same default limits. Process bindings stay opt-in.',
    installLead: 'The crate is not published, so cargo add thuelang cannot find it. Add the git dependency:',
    install: `cargo add thuelang --git ${repositoryUrl}`,
    installAfter: 'That records:',
    installAfterBody: `thuelang = { git = "${repositoryUrl}", version = "0.5.0" }`,
    moreInstall: [],
    libraryLead: 'Interpreter::new binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits. None clears one.',
    library: `use thuelang::Interpreter;

let mut interp = Interpreter::new();
interp.load_program("hello.thue")?;
let code = interp.run()?;`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: `thue <program.thue> [--max-steps N] [--max-evals N] [--max-state-bytes N]

cargo build --release --manifest-path rust/Cargo.toml
./rust/target/release/thue program.thue`,
    api: [hostApi, { href: `${blob}/rust/README.md`, label: 'rust/README.md' }],
  },
  cpp: {
    prose: 'The C++ host is a native implementation. The CMake target and namespace are thuelang and the command is thue. It uses the regex engine and the same default limits. Process bindings stay opt-in. The library is not published.',
    installLead: 'The library is not published. FetchContent adds the CMake target from this repository. Install the regex library with pkg-config before configuring:',
    install: `include(FetchContent)
FetchContent_Declare(
  thuelang
  GIT_REPOSITORY "${repositoryUrl}"
  GIT_TAG main
  SOURCE_SUBDIR cpp
)
FetchContent_MakeAvailable(thuelang)
target_link_libraries(your_target PRIVATE thuelang::thuelang)`,
    moreInstall: [
      {
        lead: 'vcpkg.json in cpp/ is an unpublished manifest, not a registry port. Do not upload it. From the repository root:',
        body: `(cd cpp && vcpkg install --triplet x64-linux)
cmake -S cpp -B build/cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=g++ \\
  -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
cmake --build build/cpp --parallel`,
      },
      {
        lead: 'conanfile.py is an unpublished Conan 2 recipe. conan create builds it. Do not upload it:',
        body: `cd cpp
conan profile detect --force
conan create . --build=missing`,
      },
    ],
    libraryLead: 'A new interpreter binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits. nullopt clears one.',
    library: `#include "thuelang/thuelang.hpp"

thuelang::Interpreter interp;
interp.LoadProgram("hello.thue");
int code = interp.Run();`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: `thue <program.thue> [--max-steps N] [--max-evals N] [--max-state-bytes N]

make cpp
build/cpp/thue program.thue`,
    api: [hostApi, { href: `${blob}/cpp/README.md`, label: 'cpp/README.md' }],
  },
  ruby: {
    prose: 'The Ruby host is a native implementation. The gem is thuelang and the command is thue. It uses the regex engine and the same default limits. Process bindings stay opt-in. The gem is not published.',
    installLead: 'The gem is not published. From a checkout of this repository:',
    install: `cd ruby
bundle config set --local path vendor/bundle
bundle install
bundle exec thue ../program.thue`,
    moreInstall: [],
    libraryLead: 'Interpreter.new binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits. nil clears one.',
    library: `require "thuelang"

interp = Thuelang::Interpreter.new
interp.load_program("hello.thue")
code = interp.run`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: `thue <program.thue> [--max-steps N] [--max-evals N] [--max-state-bytes N]

make ruby
ruby/exe/thue program.thue`,
    api: [hostApi, { href: `${blob}/ruby/README.md`, label: 'ruby/README.md' }],
  },
  csharp: {
    prose: 'The C# host is a native implementation on the current .NET LTS. The NuGet package id is Thuelang and the command is thue. It uses the .NET regex engine and the same default limits. Process bindings stay opt-in. The package is not published.',
    installLead: 'The package is not published, so dotnet add package Thuelang cannot find it. Reference the project from a checkout:',
    install: `dotnet add reference csharp/src/Thuelang/Thuelang.csproj`,
    moreInstall: [],
    libraryLead: 'A new Interpreter binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits. null clears one.',
    library: `using Thuelang;

using var interp = new Interpreter();
interp.LoadProgram("hello.thue");
var code = interp.Run();`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: `thue <program.thue> [--max-steps N] [--max-evals N] [--max-state-bytes N]

dotnet publish csharp/src/Thuelang.Cli/Thuelang.Cli.csproj -c Release -o build/csharp
build/csharp/thue program.thue`,
    api: [hostApi, { href: `${blob}/csharp/README.md`, label: 'csharp/README.md' }],
  },
}

export interface InstallPageModel extends SiteHost, InstallSection {}

export function installPage(path: string): InstallPageModel {
  const host = siteHosts.find(item => item.href === path)
  if (!host) throw new Error(`no install page for ${path}`)
  const body = copy[host.id]
  if (!body) throw new Error(`install page has no copy for ${host.id}`)
  if (body.api.length === 0) throw new Error(`install page ${host.id} has no API link`)
  return { ...host, ...body }
}

for (const host of siteHosts) {
  installPage(host.href)
}
