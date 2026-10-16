<script setup lang="ts">
import { Package } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import { repositoryUrl, shippedHosts, siteHosts } from '@/hosts'
import { pages } from '@/site'

const page = pages.hosts
const blob = `${repositoryUrl}/blob/main`

interface HostSection {
  prose: string
  installLead: string
  install: string
  installAfter?: string
  installAfterBody?: string
  libraryLead: string
  library: string
  cliLead: string
  cli: string
  readmeHref: string
  readmeLabel: string
}

const copy: Record<string, HostSection> = {
  go: {
    prose: 'The Go interpreter is the host behind go/cmd/thuepp and behind the WebAssembly module. A new interpreter binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits.',
    installLead: 'The module is not a released tag. This tracks main:',
    install: 'go get github.com/readevalprint/thueplusplus/go@main',
    libraryLead: 'Import github.com/readevalprint/thueplusplus/go/thuepp.',
    library: `import "github.com/readevalprint/thueplusplus/go/thuepp"

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
    readmeHref: `${blob}/docs/host-api.md`,
    readmeLabel: 'docs/host-api.md',
  },
  python: {
    prose: 'The Python host is a native implementation. It uses the regex engine and the same default limits. Process bindings stay opt-in, the same way they do in Go.',
    installLead: 'The distribution is not on PyPI. From a checkout of this repository:',
    install: 'uv run thuepp program.tpp',
    libraryLead: 'The package name is thuepp.',
    library: `from thuepp import ThueppInterpreter

interp = ThueppInterpreter()
interp.load_program("hello.tpp")
code = interp.run()`,
    cliLead: 'The console script is thuepp. Omitted limits use the defaults.',
    cli: 'uv run thuepp program.tpp --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608',
    readmeHref: `${blob}/docs/host-api.md`,
    readmeLabel: 'docs/host-api.md',
  },
  wasm: {
    prose: 'The JavaScript host is the Go interpreter compiled to WebAssembly, not a second language written in JavaScript. This site\'s playground loads that module. It rejects process bindings. Runs from the page pass a step limit.',
    installLead: 'The package is not on npm. A checkout depends on the js/ directory:',
    install: '"thuepp": "file:../js"',
    libraryLead: 'The npm package name is thuepp. sourceText is the program.',
    library: `import { initThuePP } from 'thuepp'

const engine = await initThuePP()
const result = await engine.run({
  sourcePath: 'hello.tpp',
  sourceText,
})`,
    cliLead: 'Build the WebAssembly module with make wasm first, or set THUEPP_WASM. From a checkout:',
    cli: 'node js/src/cli.js program.tpp --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608',
    readmeHref: `${blob}/js/README.md`,
    readmeLabel: 'js/README.md',
  },
  rust: {
    prose: 'The Rust host is a native implementation. The library crate and the command are both named thuepp. It uses the regex engine and the same default limits. Process bindings stay opt-in.',
    installLead: 'The crate is not published, so cargo add thuepp cannot find it. Add the git dependency:',
    install: `cargo add thuepp --git ${repositoryUrl}`,
    installAfter: 'That records:',
    installAfterBody: `thuepp = { git = "${repositoryUrl}", version = "0.5.0" }`,
    libraryLead: 'Interpreter::new binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits. None clears one.',
    library: `use thuepp::Interpreter;

let mut interp = Interpreter::new();
interp.load_program("hello.tpp")?;
let code = interp.run()?;`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: `thuepp <program.tpp> [--max-steps N] [--max-evals N] [--max-state-bytes N]

cargo build --release --manifest-path rust/Cargo.toml
./rust/target/release/thuepp program.tpp`,
    readmeHref: `${blob}/rust/README.md`,
    readmeLabel: 'rust/README.md',
  },
  cpp: {
    prose: 'The C++ host is a native implementation. The CMake target is thuepp and the command is thuepp. It uses the regex engine and the same default limits. Process bindings stay opt-in. The library is not published.',
    installLead: 'There is no vcpkg port and no Conan package. From a checkout of this repository:',
    install: `cmake -S cpp -B build/cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=g++
cmake --build build/cpp --parallel`,
    libraryLead: 'A new interpreter binds stdin, stdout, and stderr, and starts with the default step, probe, and state limits. nullopt clears one.',
    library: `#include "thuepp/thuepp.hpp"

thuepp::Interpreter interp;
interp.LoadProgram("hello.tpp");
int code = interp.Run();`,
    cliLead: 'From a checkout of this repository. Omitted limits use the defaults.',
    cli: `build/cpp/thuepp program.tpp --max-steps 1000000 --max-evals 1000000 --max-state-bytes 8388608`,
    readmeHref: `${blob}/cpp/README.md`,
    readmeLabel: 'cpp/README.md',
  },
}

const sections = siteHosts.map(host => {
  const body = copy[host.id]
  if (!body) throw new Error(`hosts page has no copy for ${host.id}`)
  return { ...host, ...body }
})
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #mark>
      <Package />
    </template>
    <template #actions>
      <Button as-child>
        <RouterLink to="/playground">Run the JavaScript host</RouterLink>
      </Button>
    </template>
    <p class="leading-7">A host is an implementation of Thue++. The same rules should get the same answer. This repository ships {{ shippedHosts }}. No host is published to a registry yet.</p>
    <section v-for="host in sections" :id="host.anchor" :key="host.id" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">{{ host.title }}</h2>
      <p class="leading-7">{{ host.prose }}</p>
      <h3 :id="`${host.anchor}-install`" class="font-display text-[18px] font-semibold tracking-[-0.03em]">Install</h3>
      <p class="leading-7">{{ host.installLead }}</p>
      <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ host.install }}</pre>
      <p v-if="host.installAfter" class="leading-7">{{ host.installAfter }}</p>
      <pre v-if="host.installAfterBody" class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ host.installAfterBody }}</pre>
      <h3 :id="`${host.anchor}-library`" class="font-display text-[18px] font-semibold tracking-[-0.03em]">Library</h3>
      <p class="leading-7">{{ host.libraryLead }}</p>
      <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ host.library }}</pre>
      <h3 :id="`${host.anchor}-cli`" class="font-display text-[18px] font-semibold tracking-[-0.03em]">CLI</h3>
      <p class="leading-7">{{ host.cliLead }}</p>
      <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ host.cli }}</pre>
      <p class="leading-7"><a class="underline underline-offset-4" :href="host.readmeHref" rel="noreferrer">{{ host.readmeLabel }}</a></p>
    </section>
  </DocPage>
</template>
