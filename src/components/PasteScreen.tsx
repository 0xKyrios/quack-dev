import { FileText, Loader2, Sparkles } from 'lucide-react'

const samplePr = 'https://github.com/facebook/react/pull/31277'

export type PasteScreenProps = {
  url: string
  setUrl: (url: string) => void
  isLoading: boolean
  onAnalyze: () => void
  onDemo: () => void
}

export function PasteScreen({
  url,
  setUrl,
  isLoading,
  onAnalyze,
  onDemo,
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
          <button type="button" className="ghost-button demo-button" data-testid="demo-trial" onClick={onDemo} disabled={isLoading}>
            {isLoading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            Try 60-sec demo
          </button>
          <button type="button" className="ghost-button" onClick={() => setUrl(samplePr)}>
            Use a sample PR
          </button>
        </div>
      </form>
      <aside className="preview-panel" aria-label="Understanding checklist preview">
        <p className="eyebrow">Can you explain these?</p>
        <ol className="preview-list">
          <li><strong>1</strong> What the change does</li>
          <li><strong>2</strong> Why it matters</li>
          <li><strong>3</strong> What could break</li>
          <li><strong>4</strong> Where the safeguard is</li>
        </ol>
      </aside>
    </section>
  )
}
