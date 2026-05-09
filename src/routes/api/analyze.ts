import { createFileRoute } from '@tanstack/react-router'

import { analyzePrWithOpenAi } from '../../lib/openai.server'
import { heuristicChargeSheet, normalizeChargeSheet } from '../../lib/analysis'
import { demoAnalysis } from '../../lib/demo'
import { fetchPullRequestSnapshot, parsePullRequestUrl } from '../../lib/github'
import { searchRiskContextWithSmithery } from '../../lib/smithery.server'
import type { AnalysisSource, ConnectorUsage, PrSnapshot } from '../../lib/types'

function githubSource(pr: PrSnapshot): AnalysisSource {
  return {
    id: 'github-pr',
    title: pr.title,
    url: pr.htmlUrl,
    snippet: `${pr.changedFiles} files changed, +${pr.additions}/-${pr.deletions}.`,
    provider: 'github',
  }
}

function directGithubUsage(): ConnectorUsage {
  return {
    id: 'direct-github',
    label: 'GitHub PR snapshot',
    provider: 'direct',
    status: 'used',
    detail: process.env.GITHUB_TOKEN ? 'GitHub REST with server token' : 'GitHub REST public API',
  }
}

function exaQuery(pr: PrSnapshot) {
  const text = [
    pr.title,
    pr.body,
    ...pr.files.slice(0, 8).flatMap((file) => [file.filename, file.patch || '']),
  ].join('\n')

  return [
    'software security reliability context for this GitHub pull request diff',
    text.slice(0, 1800),
  ].join('\n\n')
}

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
          const exa = await searchRiskContextWithSmithery(exaQuery(pr))
          const sources = [githubSource(pr), ...exa.sources]
          const connectorsUsed = [directGithubUsage(), exa.usage]

          if (!process.env.OPENAI_API_KEY) {
            return Response.json({
              pr,
              chargeSheet: heuristicChargeSheet(pr),
              usedFallback: true,
              sources,
              connectorsUsed,
            })
          }

          try {
            return Response.json({
              pr,
              chargeSheet: await analyzePrWithOpenAi(pr, exa.sources),
              usedFallback: false,
              sources,
              connectorsUsed,
            })
          } catch {
            return Response.json({
              pr,
              chargeSheet: normalizeChargeSheet(null, pr),
              usedFallback: true,
              sources,
              connectorsUsed,
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
