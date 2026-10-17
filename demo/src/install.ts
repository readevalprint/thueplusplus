import { repositoryUrl, siteHosts, type SiteHost } from './hosts'

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
    prose: 'The Go interpreter is the host behind go/cmd/thuepp and behind the WebAssembly module. A new interpreter binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits.',
    installLead: 'The module is not a released tag. This tracks main:',
    install: 'go get github.com/thuelang/thueplusplus/go@main',
    moreInstall: [],
    libraryLead: 'Import github.com/thuelang/thueplusplus/go/thuepp.',
    library: `import "github.com/thuelang/thueplusplus/go/thuepp"

interp := thuepp.New()
if err := interp.LoadProgram("hello.tpp"); err != nil {
    panic(err)
}
code, err := interp.Run()
if err != nil {
    panic(err)
}
_ = code`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: '(cd go && go run ./cmd/thuepp ../program.tpp --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608)',
    api: [hostApi],
  },
  python: {
    prose: 'The Python host is a native implementation. It uses the regex engine and the same default limits. Process bindings stay opt-in, the same way they do in Go.',
    installLead: 'The distribution is not on PyPI. From a checkout of this repository:',
    install: 'uv run thuepp program.tpp',
    moreInstall: [],
    libraryLead: 'The package name is thuepp.',
    library: `from thuepp import ThueppInterpreter

interp = ThueppInterpreter()
interp.load_program("hello.tpp")
code = interp.run()`,
    cliLead: 'The console script is thuepp. Omitted limits use the defaults.',
    cli: 'uv run thuepp program.tpp --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608',
    api: [hostApi],
  },
  wasm: {
    prose: 'The JavaScript host is the Go interpreter compiled to WebAssembly, not a second language written in JavaScript. This site\'s playground loads that module. It rejects process bindings. Runs from the page pass a step limit.',
    installLead: 'The package is not on npm. A checkout depends on the js/ directory:',
    install: '"thuepp": "file:../js"',
    moreInstall: [],
    libraryLead: 'The npm package name is thuepp. sourceText is the program.',
    library: `import { initThuePP } from 'thuepp'

const engine = await initThuePP()
const result = await engine.run({
  sourcePath: 'hello.tpp',
  sourceText,
})`,
    cliLead: 'Build the WebAssembly module with make wasm first, or set THUEPP_WASM. From a checkout:',
    cli: 'node js/src/cli.js program.tpp --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608',
    api: [hostApi, { href: `${blob}/js/README.md`, label: 'js/README.md' }],
  },
  rust: {
    prose: 'The Rust host is a native implementation. The library crate and the command are both named thuepp. It uses the regex engine and the same default limits. Process bindings stay opt-in.',
    installLead: 'The crate is not published, so cargo add thuepp cannot find it. Add the git dependency:',
    install: `cargo add thuepp --git ${repositoryUrl}`,
    installAfter: 'That records:',
    installAfterBody: `thuepp = { git = "${repositoryUrl}", version = "0.5.0" }`,
    moreInstall: [],
    libraryLead: 'Interpreter::new binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits. None clears one.',
    library: `use thuepp::Interpreter;

let mut interp = Interpreter::new();
interp.load_program("hello.tpp")?;
let code = interp.run()?;`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: `thuepp <program.tpp> [--max-steps N] [--max-evals N] [--max-state-bytes N]

cargo build --release --manifest-path rust/Cargo.toml
./rust/target/release/thuepp program.tpp`,
    api: [hostApi, { href: `${blob}/rust/README.md`, label: 'rust/README.md' }],
  },
  cpp: {
    prose: 'The C++ host is a native implementation. The CMake target is thuepp and the command is thuepp. It uses the regex engine and the same default limits. Process bindings stay opt-in. The library is not published.',
    installLead: 'The library is not published. FetchContent adds the CMake target from this repository. Install the regex library with pkg-config before configuring:',
    install: `include(FetchContent)
FetchContent_Declare(
  thuepp
  GIT_REPOSITORY "${repositoryUrl}"
  GIT_TAG main
  SOURCE_SUBDIR cpp
)
FetchContent_MakeAvailable(thuepp)
target_link_libraries(your_target PRIVATE thuepp::thuepp)`,
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
    library: `#include "thuepp/thuepp.hpp"

thuepp::Interpreter interp;
interp.LoadProgram("hello.tpp");
int code = interp.Run();`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: `thuepp <program.tpp> [--max-steps N] [--max-evals N] [--max-state-bytes N]

make cpp
build/cpp/thuepp program.tpp`,
    api: [hostApi, { href: `${blob}/cpp/README.md`, label: 'cpp/README.md' }],
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
