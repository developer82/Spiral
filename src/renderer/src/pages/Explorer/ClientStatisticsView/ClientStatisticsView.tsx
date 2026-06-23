import './ClientStatisticsView.css'

export interface ClientStatistics {
  totalExecutionTimeMs: number
  rowsReturned: number
  resultSetsCount: number
  bytesSentToServer: number
}

interface StatRow {
  label: string
  value: string
}

interface StatSection {
  title: string
  rows: StatRow[]
}

interface ClientStatisticsViewProps {
  statistics: ClientStatistics
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function ClientStatisticsView({ statistics }: ClientStatisticsViewProps): React.JSX.Element {
  const sections: StatSection[] = [
    {
      title: 'Time Statistics',
      rows: [
        {
          label: 'Total Execution Time',
          value: `${statistics.totalExecutionTimeMs} ms`
        }
      ]
    },
    {
      title: 'Query Profile Statistics',
      rows: [
        {
          label: 'Rows Returned',
          value: statistics.rowsReturned.toLocaleString()
        },
        {
          label: 'Result Sets',
          value: statistics.resultSetsCount.toLocaleString()
        }
      ]
    },
    {
      title: 'Network Statistics',
      rows: [
        {
          label: 'Bytes Sent to Server',
          value: formatBytes(statistics.bytesSentToServer)
        }
      ]
    }
  ]

  return (
    <div className="client-stats">
      {sections.map((section) => (
        <div key={section.title} className="client-stats__section">
          <h3 className="client-stats__section-title">{section.title}</h3>
          <table className="client-stats__table" role="table">
            <thead>
              <tr>
                <th className="client-stats__th client-stats__th--label">Statistic</th>
                <th className="client-stats__th client-stats__th--value">Current Execution</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.label} className="client-stats__row">
                  <td className="client-stats__td client-stats__td--label">{row.label}</td>
                  <td className="client-stats__td client-stats__td--value">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export default ClientStatisticsView
