<template>
  <div data-test="landing-rewrite" class="text-muted-foreground flex flex-wrap items-center gap-3 font-mono text-sm" aria-hidden="true">
    <span class="bg-muted text-foreground rounded-md px-3 py-2">hello Ada</span>
    <span class="landing-rewrite-op">::=</span>
    <span class="bg-muted text-foreground landing-rewrite-out rounded-md px-3 py-2">hi Ada</span>
  </div>
</template>

<style scoped>
.landing-rewrite-op {
  animation: landing-rewrite-op 2.8s ease-in-out infinite;
}

.landing-rewrite-out {
  animation: landing-rewrite-out 2.8s ease-in-out infinite;
}

@keyframes landing-rewrite-op {
  0%, 18% { opacity: 0.35; }
  42%, 78% { opacity: 1; }
  100% { opacity: 0.35; }
}

@keyframes landing-rewrite-out {
  0%, 28% { opacity: 0; }
  52%, 78% { opacity: 1; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .landing-rewrite-op,
  .landing-rewrite-out {
    animation: none;
    opacity: 1;
  }
}
</style>
