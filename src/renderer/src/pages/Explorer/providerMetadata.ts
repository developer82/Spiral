import type { ConnectionProvider } from './connections.types'

export interface ProviderMeta {
  label: string
  /** Undefined for file-based providers like SQLite that have no port concept. */
  defaultPort?: number
  color: string
}

export const PROVIDER_METADATA: Record<ConnectionProvider, ProviderMeta> = {
  sqlserver: {
    label: 'SQL Server',
    defaultPort: 1433,
    color: '#e8312a'
  },
  postgres: {
    label: 'PostgreSQL',
    defaultPort: 5432,
    color: '#336791'
  },
  mysql: {
    label: 'MySQL',
    defaultPort: 3306,
    color: '#00758f'
  },
  sqlite: {
    label: 'SQLite',
    color: '#003b57'
  },
  redis: {
    label: 'Redis',
    defaultPort: 6379,
    color: '#DC382D'
  },
  mongodb: {
    label: 'MongoDB',
    defaultPort: 27017,
    color: '#00ED64'
  }
}

export const PROVIDER_LIST: Array<{ value: ConnectionProvider; meta: ProviderMeta }> = (
  Object.entries(PROVIDER_METADATA) as Array<[ConnectionProvider, ProviderMeta]>
).map(([value, meta]) => ({ value, meta }))
