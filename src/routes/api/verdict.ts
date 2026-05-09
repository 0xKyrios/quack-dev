import { createFileRoute } from '@tanstack/react-router'

import { generateVerdict } from '../../lib/openai.server'
import type { ConceptCheck } from '../../lib/types'

export const Route = createFileRoute('/api/verdict')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const concepts = body?.concepts as ConceptCheck[]
          const title = String(body?.title || 'Untitled PR')

          if (!Array.isArray(concepts) || concepts.length === 0) {
            throw new Error('No concept results available.')
          }

          return Response.json(generateVerdict(concepts, title))
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'quack dev could not issue a verdict.',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
