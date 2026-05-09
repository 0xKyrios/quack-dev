import { createFileRoute } from '@tanstack/react-router'

import { analyzePrWithOpenAi } from '../../lib/openai.server'
import { heuristicChargeSheet, normalizeChargeSheet } from '../../lib/analysis'
import { demoAnalysis } from '../../lib/demo'
import { fetchPullRequestSnapshot, parsePullRequestUrl } from '../../lib/github'

export const Route = createFileRoute('/api/analyze')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()

          if (body?.useDemo) {
            return Response.json(demoAnalysis)
          }

          const input = parsePullRequestUrl(String(body?.url || ''))
          const pr = await fetchPullRequestSnapshot(input)

          if (!process.env.OPENAI_API_KEY) {
            return Response.json({
              pr,
              chargeSheet: heuristicChargeSheet(pr),
              usedFallback: true,
            })
          }

          try {
            return Response.json({
              pr,
              chargeSheet: await analyzePrWithOpenAi(pr),
              usedFallback: false,
            })
          } catch {
            return Response.json({
              pr,
              chargeSheet: normalizeChargeSheet(null, pr),
              usedFallback: true,
            })
          }
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'quack dev could not inspect that PR.',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
