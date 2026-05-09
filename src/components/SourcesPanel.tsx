import { Sparkles } from 'lucide-react'

import type { AnalysisSource, ConnectorUsage } from '../lib/types'

export type SourcesPanelProps = {
  sources?: AnalysisSource[]
  connectorsUsed?: ConnectorUsage[]
  compact?: boolean
}

export function SourcesPanel({
  sources,
  connectorsUsed,
  compact = false,
}: SourcesPanelProps) {
  const visibleSources = sources?.slice(0, compact ? 3 : 5) || []
  const visibleConnectors = connectorsUsed || []

  return (
    <section className={`sources-panel ${compact ? 'sources-panel-compact' : ''}`}>
      <div className="sources-heading">
        <Sparkles size={15} />
        <div>
          <p className="eyebrow">Sources</p>
          <h3>Smithery context</h3>
        </div>
      </div>

      <div className="connector-pills" aria-label="Connector usage">
        {visibleConnectors.map((connector) => (
          <span
            className={`connector-pill connector-${connector.status}`}
            key={`${connector.id}-${connector.provider}`}
            title={connector.detail}
          >
            {connector.label}
            <small>{connector.provider === 'smithery' ? 'Smithery' : connector.provider}</small>
          </span>
        ))}
      </div>

      {visibleSources.length ? (
        <div className="source-list">
          {visibleSources.map((source) => (
            <a
              className="source-card"
              href={source.url}
              key={source.id}
              target="_blank"
              rel="noreferrer"
            >
              <strong>{source.title}</strong>
              {source.snippet ? <span>{source.snippet}</span> : null}
            </a>
          ))}
        </div>
      ) : (
        <p className="sources-empty">No external sources returned yet.</p>
      )}
    </section>
  )
}
