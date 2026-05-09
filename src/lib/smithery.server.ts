import type {
  AnalysisSource,
  ConnectorUsage,
  PrCommit,
  PrFile,
  PrSnapshot,
  PullRequestInput,
} from './types'

type SmitheryTool = {
  name: string
  description?: string
}

type SmitheryToolResult = {
  content?: Array<{ type?: string; text?: string }>
  [key: string]: unknown
}

type SmitheryConfig = {
  apiKey: string
  namespace: string
}

type GithubCandidate = {
  tool: string
  body: Record<string, unknown>
}

const smitheryBaseUrl = 'https://api.smithery.ai/connect'

function smitheryConfig(): SmitheryConfig | null {
  const apiKey = process.env.SMITHERY_API_KEY
  if (!apiKey) return null

  return {
    apiKey,
    namespace: process.env.SMITHERY_NAMESPACE || 'quack-dev',
  }
}

function connectionId(kind: 'github' | 'exa') {
  if (kind === 'github') {
    return process.env.SMITHERY_GITHUB_CONNECTION_ID || 'github'
  }

  return process.env.SMITHERY_EXA_CONNECTION_ID || 'exa'
}

function toolPath(toolName: string) {
  return toolName
    .split('.')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

async function smitheryFetch<T>(
  config: SmitheryConfig,
  connection: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${smitheryBaseUrl}/${encodeURIComponent(config.namespace)}/${encodeURIComponent(connection)}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    },
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Smithery returned ${response.status}. ${detail || 'Connector call failed.'}`)
  }

  return response.json() as Promise<T>
}

async function listTools(config: SmitheryConfig, connection: string): Promise<SmitheryTool[]> {
  const payload = await smitheryFetch<{ tools: SmitheryTool[] }>(config, connection, '/.tools')
  return payload.tools || []
}

async function callTool(
  config: SmitheryConfig,
  connection: string,
  tool: string,
  body: Record<string, unknown>,
): Promise<SmitheryToolResult> {
  return smitheryFetch<SmitheryToolResult>(config, connection, `/.tools/${toolPath(tool)}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function parseToolResult(result: unknown): any {
  if (!result || typeof result !== 'object') return result

  const payload = result as SmitheryToolResult
  const text = payload.content?.find((part) => part.type === 'text' && part.text)?.text
  if (!text) return result

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function firstArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  for (const key of ['files', 'commits', 'items', 'results', 'data']) {
    if (Array.isArray(record[key])) return record[key] as any[]
  }

  return []
}

function parseExaTextResults(text: string): AnalysisSource[] {
  return text
    .split(/\n(?=Title: )/g)
    .map<AnalysisSource | null>((block, index) => {
      const title = block.match(/^Title:\s*(.+)$/m)?.[1]?.trim()
      const url = block.match(/^URL:\s*(.+)$/m)?.[1]?.trim()
      const highlights = block
        .split('\n')
        .filter((line) => !/^(Title|URL|Published|Author):/.test(line))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!title && !url && !highlights) return null

      return {
        id: `exa-${index}`,
        title: title || url || `Exa result ${index + 1}`,
        url,
        snippet: highlights.slice(0, 280),
        provider: 'exa' as const,
      }
    })
    .filter((source): source is AnalysisSource => source !== null)
}

function firstObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object') return {}

  const record = value as Record<string, any>
  for (const key of ['pull_request', 'pullRequest', 'item', 'data', 'result']) {
    if (record[key] && typeof record[key] === 'object' && !Array.isArray(record[key])) {
      return record[key]
    }
  }

  return record
}

function pickTool(tools: SmitheryTool[], candidates: string[]) {
  const names = new Set(tools.map((tool) => tool.name))
  return candidates.find((candidate) => names.has(candidate)) || candidates[0]
}

async function callFirstAvailable(
  config: SmitheryConfig,
  connection: string,
  tools: SmitheryTool[],
  candidates: GithubCandidate[],
) {
  const availableNames = new Set(tools.map((tool) => tool.name))
  const ordered = [
    ...candidates.filter((candidate) => availableNames.has(candidate.tool)),
    ...candidates.filter((candidate) => !availableNames.has(candidate.tool)),
  ]

  let lastError: unknown
  for (const candidate of ordered) {
    try {
      return parseToolResult(await callTool(config, connection, candidate.tool, candidate.body))
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No Smithery tool call succeeded.')
}

function mapPull(input: PullRequestInput, pullValue: unknown, filesValue: unknown, commitsValue: unknown): PrSnapshot {
  const pull = firstObject(pullValue)
  const files = firstArray(filesValue)
  const commits = firstArray(commitsValue)

  return {
    input,
    title: String(pull.title || pull.name || `Pull request #${input.number}`),
    body: String(pull.body || pull.description || ''),
    author: String(pull.user?.login || pull.author?.login || pull.author || 'unknown'),
    additions: Number(pull.additions || 0),
    deletions: Number(pull.deletions || 0),
    changedFiles: Number(pull.changed_files || pull.changedFiles || files.length),
    htmlUrl: String(pull.html_url || pull.htmlUrl || input.url),
    files: files.map<PrFile>((file) => ({
      filename: String(file.filename || file.path || 'unknown'),
      status: String(file.status || 'modified'),
      additions: Number(file.additions || 0),
      deletions: Number(file.deletions || 0),
      changes: Number(file.changes || Number(file.additions || 0) + Number(file.deletions || 0)),
      patch: typeof file.patch === 'string' ? file.patch : undefined,
    })),
    commits: commits.map<PrCommit>((commit) => ({
      sha: String(commit.sha || commit.oid || ''),
      message: String(commit.commit?.message || commit.message || ''),
      author: commit.commit?.author?.name || commit.author?.name || commit.author?.login,
    })),
  }
}

export async function fetchPullRequestSnapshotWithSmithery(
  input: PullRequestInput,
): Promise<{ pr?: PrSnapshot; usage: ConnectorUsage }> {
  const config = smitheryConfig()
  if (!config) {
    return {
      usage: {
        id: 'smithery-github',
        label: 'GitHub PR snapshot',
        provider: 'smithery',
        status: 'skipped',
        detail: 'SMITHERY_API_KEY is not configured',
      },
    }
  }

  const connection = connectionId('github')

  try {
    const tools = await listTools(config, connection)
    const pull = await callFirstAvailable(config, connection, tools, [
      {
        tool: 'pull_request_read',
        body: { owner: input.owner, repo: input.repo, pullNumber: input.number, method: 'get' },
      },
      {
        tool: 'get_pull_request',
        body: { owner: input.owner, repo: input.repo, pull_number: input.number },
      },
      {
        tool: 'get_pull_request',
        body: { owner: input.owner, repo: input.repo, pullNumber: input.number },
      },
    ])
    const files = await callFirstAvailable(config, connection, tools, [
      {
        tool: 'pull_request_read',
        body: { owner: input.owner, repo: input.repo, pullNumber: input.number, method: 'get_files' },
      },
      {
        tool: 'get_pull_request_files',
        body: { owner: input.owner, repo: input.repo, pull_number: input.number },
      },
      {
        tool: 'get_pull_request_files',
        body: { owner: input.owner, repo: input.repo, pullNumber: input.number },
      },
    ])

    let commits: unknown = []
    try {
      commits = await callFirstAvailable(config, connection, tools, [
        {
          tool: 'pull_request_read',
          body: { owner: input.owner, repo: input.repo, pullNumber: input.number, method: 'get_commits' },
        },
        {
          tool: 'get_pull_request_commits',
          body: { owner: input.owner, repo: input.repo, pull_number: input.number },
        },
      ])
    } catch {
      commits = []
    }

    return {
      pr: mapPull(input, pull, files, commits),
      usage: {
        id: 'smithery-github',
        label: 'GitHub PR snapshot',
        provider: 'smithery',
        status: 'used',
        detail: `${config.namespace}/${connection}`,
      },
    }
  } catch (error) {
    return {
      usage: {
        id: 'smithery-github',
        label: 'GitHub PR snapshot',
        provider: 'smithery',
        status: 'failed',
        detail: error instanceof Error ? error.message.slice(0, 180) : 'Connector failed',
      },
    }
  }
}

export async function searchRiskContextWithSmithery(
  query: string,
): Promise<{ sources: AnalysisSource[]; usage: ConnectorUsage }> {
  const config = smitheryConfig()
  if (!config) {
    return {
      sources: [],
      usage: {
        id: 'smithery-exa',
        label: 'Exa risk context',
        provider: 'smithery',
        status: 'skipped',
        detail: 'SMITHERY_API_KEY is not configured',
      },
    }
  }

  const connection = connectionId('exa')

  try {
    const tools = await listTools(config, connection)
    const tool = pickTool(tools, ['web_search_exa', 'search'])
    const result = parseToolResult(
      await callTool(config, connection, tool, {
        query,
        numResults: 5,
      }),
    )
    const results = firstArray(result)
    const sources =
      typeof result === 'string'
        ? parseExaTextResults(result).slice(0, 5)
        : results.slice(0, 5).map<AnalysisSource>((item, index) => ({
            id: `exa-${index}`,
            title: String(item.title || item.name || item.url || `Exa result ${index + 1}`),
            url: typeof item.url === 'string' ? item.url : undefined,
            snippet: String(
              item.text || item.snippet || item.summary || item.description || '',
            ).slice(0, 280),
            provider: 'exa',
          }))

    return {
      sources,
      usage: {
        id: 'smithery-exa',
        label: 'Exa risk context',
        provider: 'smithery',
        status: 'used',
        detail: `${config.namespace}/${connection}`,
      },
    }
  } catch (error) {
    return {
      sources: [],
      usage: {
        id: 'smithery-exa',
        label: 'Exa risk context',
        provider: 'smithery',
        status: 'failed',
        detail: error instanceof Error ? error.message.slice(0, 180) : 'Connector failed',
      },
    }
  }
}
