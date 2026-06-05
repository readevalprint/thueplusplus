// SPDX-License-Identifier: AGPL-3.0-or-later

export function solutionAnchorId(solutionId: string): string {
  return `solution-${solutionId}`
}

export function solutionHref(challengeSlug: string, solutionId: string): string {
  return `/challenges/${challengeSlug}/solutions/#${solutionAnchorId(solutionId)}`
}
