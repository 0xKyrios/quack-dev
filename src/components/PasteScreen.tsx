import { Cable, FileText, GitPullRequest, Loader2, MessageSquareText, ShieldCheck } from 'lucide-react'

export type PasteScreenProps = {
  url: string
  setUrl: (url: string) => void
  isLoading: boolean
  onAnalyze: () => void
}

const demoDiagram = [
  {
    icon: GitPullRequest,
    title: 'Read',
    body:
      'GitHub pulls the PR title, files, commits, and diff so the demo starts from real review context.',
  },
  {
    icon: Cable,
    title: 'Enrich',
    body:
      'Smithery connectors add Exa risk context and show whether each source was used, skipped, or failed.',
  },
  {
    icon: MessageSquareText,
    title: 'Question',
    body:
      'quack dev turns the risky parts into a voice or text understanding check instead of a passive summary.',
  },
  {
    icon: ShieldCheck,
    title: 'Prove',
    body:
      'The final review note is backed by what the reviewer can explain, including gaps that should block merge.',
  },
]

export function PasteScreen({
  url,
  setUrl,
  isLoading,
  onAnalyze,
}: PasteScreenProps) {
  return (
    <section className="hero-grid" id="hero-grid">
      <div className="hero-copy">
        <p className="stamp">PR understanding, not review theater</p>
        <h1>We review reviewers. What did you just approve?</h1>
        <p>
          You typed LGTM. But do you actually understand the change? quack dev
          reads the PR, finds the risky parts, and asks you to explain them
          back. Like rubber-duck debugging — except the duck asks the
          questions.
        </p>
      </div>

      <form
        className="trial-form"
        onSubmit={(event) => {
          event.preventDefault()
          onAnalyze()
        }}
      >
        <div className="form-heading">
          <h3>Paste the PR URL</h3>
          <p id="form-help">Any public GitHub PR. The demo uses a real example.</p>
        </div>
        <label htmlFor="pr-url">Pull request URL</label>
        <input
          id="pr-url"
          data-testid="pr-url-input"
          type="url"
          placeholder="https://github.com/owner/repo/pull/123"
          aria-describedby="form-help"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <div className="form-actions">
          <button className="primary-button quiz-button" data-testid="trial-submit" disabled={isLoading}>
            {isLoading ? <Loader2 className="spin" size={18} /> : <FileText size={18} />}
            Explain it to the duck
          </button>
        </div>
      </form>

      <aside className="preview-panel" aria-label="Understanding checklist preview">
        <p className="eyebrow">Demo UX flow</p>
        <ol className="preview-list">
          <li><strong>1</strong> Read the PR and diff context</li>
          <li><strong>2</strong> Explain the riskiest concepts</li>
          <li><strong>3</strong> Track clear, shaky, and blocked answers</li>
          <li><strong>4</strong> Generate a review note with evidence</li>
        </ol>
        <div className="demo-diagram" aria-label="How quack dev works">
          <div className="demo-diagram-copy">
            <p className="eyebrow">Purpose for the demo video</p>
            <h2>Show that AI review can test understanding, not just summarize code.</h2>
            <p>
              The demo follows one clear path: gather real PR context, enrich it with
              connector evidence, ask the reviewer to explain the risk, then produce a
              review note grounded in their answers.
            </p>
          </div>
          <div className="demo-diagram-steps">
            {demoDiagram.map(({ icon: Icon, title, body }, index) => (
              <article className="demo-diagram-step" key={title}>
                <span className="diagram-index">{index + 1}</span>
                <Icon size={19} />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </section>
  )
}
