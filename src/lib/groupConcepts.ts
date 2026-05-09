import type { ConceptCheck, ConceptStatus } from './types'

export function groupConcepts(concepts: ConceptCheck[]): Record<ConceptStatus, ConceptCheck[]> {
  return concepts.reduce(
    (groups, concept) => {
      groups[concept.status].push(concept)
      return groups
    },
    {
      passed: [],
      weak: [],
      failed: [],
      unverified: [],
    } as Record<ConceptStatus, ConceptCheck[]>,
  )
}
