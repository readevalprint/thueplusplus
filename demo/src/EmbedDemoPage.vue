<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <main class="embed-demo-page">
    <section class="embed-demo-hero" aria-labelledby="embed-demo-title">
      <p class="kicker">embeddable playground</p>
      <h1 id="embed-demo-title">Compact thue++ playground embeds</h1>
      <p>
        These examples use the same shared playground surface as the full workbench, but with embed chrome,
        section tabs, URL-controlled focus, and compact controls for documentation-sized slots.
      </p>
    </section>

    <section class="embed-demo-grid" aria-label="embed examples">
      <article class="embed-demo-card">
        <div class="embed-demo-copy">
          <h2>Output-focused runnable snippet</h2>
          <p>Default docs shape: source, Run, and stdout selected by URL params.</p>
          <code>/embed?file=./examples/hello/hello.tpp&amp;section=output&amp;tab=stdout</code>
        </div>
        <PlaygroundSurface
          file="./examples/hello/hello.tpp"
          section="output"
          tab="stdout"
          mode="compact"
          chrome="embed"
          controls="run"
          :header="false"
          :picker="false"
          :show-open-full="true"
          :sync-url="false"
        />
      </article>

      <article class="embed-demo-card">
        <div class="embed-demo-copy">
          <h2>State-focused teaching card</h2>
          <p>Starts on the state section for prose that explains text rewriting instead of stdio.</p>
          <code>/embed?file=./examples/hello/hello.tpp&amp;section=state</code>
        </div>
        <PlaygroundSurface
          file="./examples/hello/hello.tpp"
          section="state"
          mode="mini"
          chrome="embed"
          controls="run"
          :header="false"
          :picker="false"
          :show-open-full="true"
          :sync-url="false"
        />
      </article>

      <article class="embed-demo-card">
        <div class="embed-demo-copy">
          <h2>Input/resource-focused embed</h2>
          <p>Opens directly on stdin/resources for examples that pause waiting for browser-provided input.</p>
          <code>/embed?file=./examples/guess-number/guess-number.tpp&amp;section=input&amp;controls=debug</code>
        </div>
        <PlaygroundSurface
          file="./examples/guess-number/guess-number.tpp"
          section="input"
          mode="debug"
          chrome="embed"
          controls="debug"
          :header="false"
          :picker="false"
          :show-open-full="true"
          :sync-url="false"
        />
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import PlaygroundSurface from './PlaygroundSurface.vue'
</script>
