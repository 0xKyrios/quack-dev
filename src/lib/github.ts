import type { PrCommit, PrFile, PrSnapshot, PullRequestInput } from './types'

const prUrlPattern =
  /^https:\/\/github\.com\/(?<owner>[^/\s]+)\/(?<repo>[^/\s]+)\/pull\/(?<number>\d+)\/?$/

export function parsePullRequestUrl(url: string): PullRequestInput {
  const trimmed = url.trim()
  const match = prUrlPattern.exec(trimmed)

  if (!match?.groups) {
    throw new Error('Paste a GitHub PR URL like https://github.com/acme/app/pull/42.')
  }

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
    number: Number(match.groups.number),
    url: trimmed,
  }
}

async function githubFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'quack-dev-mvp',
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const response = await fetch(`https://api.github.com${path}`, { headers })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `GitHub returned ${response.status}. ${detail || 'The PR may be private, missing, or rate limited.'}`,
    )
  }

  return response.json() as Promise<T>
}

type GithubPull = {
  title: string
  body: string | null
  user: { login: string }
  additions: number
  deletions: number
  changed_files: number
  html_url: string
}

type GithubFile = {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

type GithubCommit = {
  sha: string
  commit: {
    message: string
    author?: { name?: string }
  }
}

export async function fetchPullRequestSnapshot(input: PullRequestInput): Promise<PrSnapshot> {
  const base = `/repos/${input.owner}/${input.repo}/pulls/${input.number}`
  const [pull, files, commits] = await Promise.all([
    githubFetch<GithubPull>(base),
    githubFetch<GithubFile[]>(`${base}/files?per_page=100`),
    githubFetch<GithubCommit[]>(`${base}/commits?per_page=100`),
  ])

  return {
    input,
    title: pull.title,
    body: pull.body || '',
    author: pull.user.login,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changed_files,
    htmlUrl: pull.html_url,
    files: files.map<PrFile>((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
    })),
    commits: commits.map<PrCommit>((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author?.name,
    })),
  }
}
