import { createFileRoute } from '@tanstack/react-router'

import { evaluateAnswerWithOpenAi } from '../../lib/openai.server'
import type { ConceptCheck } from '../../lib/types'

export const Route = createFileRoute('/api/evaluate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const concept = body?.concept as ConceptCheck
          const answer = String(body?.answer || '')
          const transcript = Array.isArray(body?.transcript) ? body.transcript : []

          if (!concept?.concept || !answer.trim()) {
            throw new Error('Missing concept or answer.')
          }

          return Response.json(await evaluateAnswerWithOpenAi(concept, answer, transcript))
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'quack dev could not evaluate that answer.',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
