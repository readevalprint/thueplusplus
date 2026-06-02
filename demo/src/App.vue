<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <template v-if="showSiteTopbar">
    <header class="site-topbar" data-test="site-topbar">
      <div class="site-topbar-inner">
        <a class="site-brand" href="/" aria-label="Thue++ home">Thue++</a>
        <NavigationMenu class="site-nav" aria-label="Main navigation" viewport-align="end">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink as-child :class="navigationMenuTriggerStyle()" :data-active="isDocsRoute ? '' : undefined">
                <a href="/" :aria-current="isDocsRoute ? 'page' : undefined">Docs</a>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink as-child :class="navigationMenuTriggerStyle()" :data-active="isPlaygroundRoute ? '' : undefined">
                <a href="/playground" :aria-current="isPlaygroundRoute ? 'page' : undefined">Playground</a>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem data-test="site-nav-challenges">
              <NavigationMenuTrigger :data-active="isChallengesRoute ? '' : undefined">Challenges</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul class="grid w-[280px] gap-1">
                  <li>
                    <NavigationMenuLink as-child :data-active="isChallengesIndexRoute ? '' : undefined">
                      <a href="/challenges" :aria-current="isChallengesIndexRoute ? 'page' : undefined">All Challenges</a>
                    </NavigationMenuLink>
                  </li>
                  <li v-for="challenge in challenges" :key="challenge.slug">
                    <NavigationMenuLink as-child :data-active="challenge.slug === challengeSlug ? '' : undefined">
                      <a
                        :href="challenge.path"
                        :data-test="`site-nav-challenge-${challenge.slug}`"
                        :aria-current="challenge.slug === challengeSlug ? 'page' : undefined"
                      >{{ challenge.title }}</a>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink as-child :class="navigationMenuTriggerStyle()">
                <a href="https://gitlab.com/thuelang/thueplusplus" rel="noreferrer">GitLab</a>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink as-child :class="navigationMenuTriggerStyle()">
                <a href="https://x.com/thuelang" rel="noreferrer">Twitter</a>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </header>
    <PlaygroundPage v-if="isPlaygroundRoute" />
    <ChallengesPage v-else-if="isChallengesRoute" :selected-slug="challengeSlug" :solutions-route="isChallengeSolutionsRoute" :selected-solution-id="challengeSolutionId" />
    <ReadmePage v-else />
  </template>
  <EmbedDemoPage v-else-if="isEmbedDemoRoute" />
  <PlaygroundSurface v-else-if="isEmbedRoute" v-bind="embedProps" />
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import EmbedDemoPage from './EmbedDemoPage.vue'
import ChallengesPage from './ChallengesPage.vue'
import PlaygroundPage from './PlaygroundPage.vue'
import PlaygroundSurface from './PlaygroundSurface.vue'
import ReadmePage from './ReadmePage.vue'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from './components/ui/navigation-menu'
import { challenges } from './challenges/data'

interface EmbedRouteProps {
  file?: string
  test?: string
  caseName?: string
  section?: 'output' | 'state' | 'input' | 'trace' | 'resources' | 'source'
  tab?: string
  mode?: 'auto' | 'full' | 'compact' | 'mini' | 'debug'
  chrome?: 'page' | 'embed' | 'bare'
  controls?: 'run' | 'step' | 'debug' | 'none'
  editable?: boolean
  header?: boolean
  picker?: boolean
  showOpenFull?: boolean
  syncUrl?: boolean
}

const routePath = computed(() => normalizedPath() || '/')
const challengesRouteMatch = computed(() => routePath.value.match(/(?:^|\/)challenges(?:\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?)?$/))
const challengeSlug = computed(() => challengesRouteMatch.value?.[1] ? decodeURIComponent(challengesRouteMatch.value[1]) : undefined)
const challengeSecondSegment = computed(() => challengesRouteMatch.value?.[2] ? decodeURIComponent(challengesRouteMatch.value[2]) : undefined)
const isChallengeSolutionsRoute = computed(() => challengeSecondSegment.value === 'solutions')
const challengeSolutionId = computed(() => {
  if (!challengesRouteMatch.value) return undefined
  if (isChallengeSolutionsRoute.value) return challengesRouteMatch.value[3] ? decodeURIComponent(challengesRouteMatch.value[3]).toLowerCase() : undefined
  return challengeSecondSegment.value ? challengeSecondSegment.value.toLowerCase() : undefined
})
const selectedChallenge = computed(() => challenges.find((challenge) => challenge.slug === challengeSlug.value))
const selectedSolution = computed(() => selectedChallenge.value?.solutions.find(solution => solution.id === challengeSolutionId.value))
const isPlaygroundRoute = computed(() => routePath.value.endsWith('/playground'))
const isChallengesRoute = computed(() => Boolean(challengesRouteMatch.value))
const isChallengesIndexRoute = computed(() => isChallengesRoute.value && !challengeSlug.value)
const isEmbedDemoRoute = computed(() => routePath.value.endsWith('/embed/demo'))
const isEmbedRoute = computed(() => routePath.value.endsWith('/embed'))
const showSiteTopbar = computed(() => !isEmbedDemoRoute.value && !isEmbedRoute.value)
const isDocsRoute = computed(() => showSiteTopbar.value && !isPlaygroundRoute.value && !isChallengesRoute.value)
const embedProps = computed<EmbedRouteProps>(() => {
  const params = new URLSearchParams(window.location.search)
  return {
    file: params.get('file') ?? undefined,
    test: params.get('test') ?? undefined,
    caseName: params.get('case') ?? undefined,
    section: normalizeEmbedSection(params.get('section')),
    tab: params.get('tab') ?? undefined,
    mode: normalizeEmbedMode(params.get('mode')),
    chrome: 'embed',
    controls: normalizeEmbedControls(params.get('controls')),
    editable: params.get('editable') !== '0',
    header: params.get('header') === '1',
    picker: params.get('picker') === '1',
    showOpenFull: params.get('openFull') !== '0',
    syncUrl: params.get('syncUrl') === '1',
  }
})

watchEffect(() => {
  if (isPlaygroundRoute.value) {
    setPageMetadata({
      title: 'Thue++ Playground — Run String-Rewrite Programs in the Browser',
      description: 'Run Thue++ examples in the browser playground, inspect state transitions, and experiment with deterministic regex rewrite rules.',
      canonical: 'https://thuelang.org/playground',
      robots: 'index,follow',
    })
  } else if (isEmbedRoute.value || isEmbedDemoRoute.value) {
    setPageMetadata({
      title: 'Thue++ Embed',
      description: 'Embeddable Thue++ playground surface.',
      canonical: 'https://thuelang.org/embed',
      robots: 'noindex,follow',
    })
  } else if (isChallengesRoute.value) {
    const challengeMetadata = selectedChallenge.value
    const challengeCanonicalPath = challengeSlug.value
      ? `/challenges/${encodeURIComponent(challengeSlug.value)}${isChallengeSolutionsRoute.value ? `/solutions${challengeSolutionId.value ? `/${encodeURIComponent(challengeSolutionId.value)}` : ''}` : challengeSolutionId.value ? `/${encodeURIComponent(challengeSolutionId.value)}` : ''}`
      : '/challenges'
    setPageMetadata({
      title: selectedSolution.value && challengeMetadata ? `${selectedSolution.value.title} — ${challengeMetadata.title} — Thue++ Challenge Solution` : isChallengeSolutionsRoute.value && challengeMetadata ? `${challengeMetadata.title} Solutions — Thue++ Challenge` : challengeMetadata ? `${challengeMetadata.title} — Thue++ Challenge` : 'Learn Thue++ — Challenges',
      description: challengeMetadata?.summary ?? 'Learn Thue++ in small steps and compare your answers with others.',
      canonical: `https://thuelang.org${challengeCanonicalPath}`,
      robots: 'index,follow',
    })
  } else {
    setPageMetadata({
      title: 'Thue++ — Deterministic String-Rewrite Programming Language',
      description: 'Thue++ is a rewrite-rule metalanguage for sandboxed DSLs, with ordered regex rewrites, exact arithmetic, explicit resources, and a browser playground.',
      canonical: 'https://thuelang.org/',
      robots: 'index,follow',
    })
  }
})

function normalizedPath(): string {
  return window.location.pathname.replace(/\/$/, '')
}

function normalizeEmbedSection(value: string | null): EmbedRouteProps['section'] {
  return ['output', 'state', 'input', 'trace', 'resources', 'source'].includes(value ?? '') ? value as EmbedRouteProps['section'] : undefined
}

function normalizeEmbedMode(value: string | null): EmbedRouteProps['mode'] {
  return ['auto', 'full', 'compact', 'mini', 'debug'].includes(value ?? '') ? value as EmbedRouteProps['mode'] : 'compact'
}

function normalizeEmbedControls(value: string | null): EmbedRouteProps['controls'] {
  return ['run', 'step', 'debug', 'none'].includes(value ?? '') ? value as EmbedRouteProps['controls'] : 'run'
}

function setPageMetadata(metadata: { title: string; description: string; canonical: string; robots: string }): void {
  document.title = metadata.title
  setMeta('name', 'description', metadata.description)
  setMeta('name', 'robots', metadata.robots)
  setLink('canonical', metadata.canonical)
  setMeta('property', 'og:title', metadata.title)
  setMeta('property', 'og:description', metadata.description)
  setMeta('property', 'og:url', metadata.canonical)
  setMeta('name', 'twitter:title', metadata.title)
  setMeta('name', 'twitter:description', metadata.description)
}

function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.content = content
}

function setLink(rel: string, href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    document.head.appendChild(element)
  }
  element.href = href
}
</script>
