import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Toggle from '../../components/Toggle/Toggle'
import { useSettings } from './useSettings'
import Button from '../../components/Button/Button'
import { SelectField, TextField } from '../../components/Field'

const QUERY_TIMEOUT_OPTIONS = [
  { value: 0 },
  { value: 15, seconds: 15 },
  { value: 30, seconds: 30 },
  { value: 60, seconds: 60 },
  { value: 120, seconds: 120 }
]

function DatabasesConfigSettings(): React.JSX.Element {
  const { t } = useTranslation()
  const { settings, updateSetting, resetSettings } = useSettings()
  const [testing, setTesting] = useState(false)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [pgTesting, setPgTesting] = useState(false)
  const [pgToolStatus, setPgToolStatus] = useState<string | null>(null)

  const handleTestTools = async (): Promise<void> => {
    setTesting(true)
    setToolStatus(null)
    try {
      const result = await window.api.database.mysqlProbeTools({
        mysqlDumpPath: settings.mysqlDumpPath,
        mysqlClientPath: settings.mysqlClientPath
      })
      if (result.status !== 'ok') {
        setToolStatus(result.message)
        return
      }
      const { mysqldump, mysql } = result.tools
      const fmt = (name: string, info: { found: boolean; version?: string }): string =>
        info.found
          ? `${name}: ${info.version ?? t('settings.databasesConfig.mysqlTools.test.found')}`
          : `${name}: ${t('settings.databasesConfig.mysqlTools.test.notFound')}`
      setToolStatus(`${fmt('mysqldump', mysqldump)}\n${fmt('mysql', mysql)}`)
    } finally {
      setTesting(false)
    }
  }

  const handleTestPgTools = async (): Promise<void> => {
    setPgTesting(true)
    setPgToolStatus(null)
    try {
      const result = await window.api.database.postgresProbeTools({
        pgDumpPath: settings.pgDumpPath,
        pgRestorePath: settings.pgRestorePath,
        psqlPath: settings.psqlPath
      })
      if (result.status !== 'ok') {
        setPgToolStatus(result.message)
        return
      }
      const { pgDump, pgRestore, psql } = result.tools
      const fmt = (name: string, info: { found: boolean; version?: string }): string =>
        info.found
          ? `${name}: ${info.version ?? t('settings.databasesConfig.postgresTools.test.found')}`
          : `${name}: ${t('settings.databasesConfig.postgresTools.test.notFound')}`
      setPgToolStatus(
        `${fmt('pg_dump', pgDump)}\n${fmt('pg_restore', pgRestore)}\n${fmt('psql', psql)}`
      )
    } finally {
      setPgTesting(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <div>
          <h1 className="settings-page__title">
            {t('settings.databasesConfig.title')}
          </h1>
          <p className="settings-page__subtitle">
            {t('settings.databasesConfig.subtitle')}
          </p>
        </div>
        <Button
              variant="ghost"
              size="lg" onClick={resetSettings}>
          {t('settings.resetDefaults')}
        </Button>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.databasesConfig.queryDefaults')}
        </h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.queryTimeout.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.queryTimeout.desc')}
              </p>
            </div>
            <SelectField
              className="settings-field-select"
              value={String(settings.queryTimeout)}
              onChange={(value) => updateSetting('queryTimeout', Number(value))}
              ariaLabel={t('settings.databasesConfig.queryTimeout.label')}
              options={QUERY_TIMEOUT_OPTIONS.map(({ value, seconds }) => ({
                value: String(value),
                label:
                  value === 0
                    ? t('settings.databasesConfig.queryTimeout.noTimeout')
                    : t('settings.databasesConfig.queryTimeout.seconds', {
                        count: seconds ?? value
                      })
              }))}
            />
          </div>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.databasesConfig.explorer')}
        </h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.showSystemDatabases.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.showSystemDatabases.desc')}
              </p>
            </div>
            <Toggle
              id="show-system-databases"
              label={t('settings.databasesConfig.showSystemDatabases.label')}
              checked={settings.showSystemDatabases}
              onChange={(checked) => updateSetting('showSystemDatabases', checked)}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.selectTopRowsCount.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.selectTopRowsCount.desc')}
              </p>
            </div>
            <TextField
              className="settings-field-number"
              id="select-top-rows-count"
              type="number"
              min={1}
              clearable={false}
              value={settings.selectTopRowsCount}
              ariaLabel={t('settings.databasesConfig.selectTopRowsCount.label')}
              onChange={(value) => {
                const val = Number(value)
                if (val >= 1) updateSetting('selectTopRowsCount', val)
              }}
            />
          </div>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.databasesConfig.queryExecution')}
        </h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.autoIncludeExecutionPlan.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.autoIncludeExecutionPlan.desc')}
              </p>
            </div>
            <Toggle
              id="auto-include-execution-plan"
              label={t('settings.databasesConfig.autoIncludeExecutionPlan.label')}
              checked={settings.autoIncludeExecutionPlan}
              onChange={(checked) => updateSetting('autoIncludeExecutionPlan', checked)}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.autoIncludeClientStatistics.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.autoIncludeClientStatistics.desc')}
              </p>
            </div>
            <Toggle
              id="auto-include-client-statistics"
              label={t('settings.databasesConfig.autoIncludeClientStatistics.label')}
              checked={settings.autoIncludeClientStatistics}
              onChange={(checked) => updateSetting('autoIncludeClientStatistics', checked)}
            />
          </div>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.databasesConfig.jsonResults')}
        </h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.copyJsonFormatted.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.copyJsonFormatted.desc')}
              </p>
            </div>
            <Toggle
              id="copy-json-formatted"
              label={t('settings.databasesConfig.copyJsonFormatted.label')}
              checked={settings.copyJsonFormatted}
              onChange={(checked) => updateSetting('copyJsonFormatted', checked)}
            />
          </div>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.databasesConfig.comparisonExport')}
        </h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.askBeforeIncludingSecrets.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.askBeforeIncludingSecrets.desc')}
              </p>
            </div>
            <Toggle
              id="ask-before-including-secrets"
              label={t('settings.databasesConfig.askBeforeIncludingSecrets.label')}
              checked={settings.askBeforeIncludingSecretsInComparisonExport}
              onChange={(checked) => updateSetting('askBeforeIncludingSecretsInComparisonExport', checked)}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.includeSecretsByDefault.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.includeSecretsByDefault.desc')}
              </p>
            </div>
            <Toggle
              id="include-secrets-by-default"
              label={t('settings.databasesConfig.includeSecretsByDefault.label')}
              checked={settings.includeSecretsInComparisonExportByDefault}
              onChange={(checked) => updateSetting('includeSecretsInComparisonExportByDefault', checked)}
            />
          </div>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.databasesConfig.mysqlTools.title')}
        </h2>
        <p className="settings-page__subtitle">
          {t('settings.databasesConfig.mysqlTools.subtitle')}
        </p>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.mysqlTools.mysqldumpPath.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.mysqlTools.mysqldumpPath.desc')}
              </p>
            </div>
            <TextField
              id="mysql-dump-path"
              value={settings.mysqlDumpPath}
              placeholder="mysqldump"
              ariaLabel={t('settings.databasesConfig.mysqlTools.mysqldumpPath.label')}
              onChange={(value) => updateSetting('mysqlDumpPath', String(value))}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.mysqlTools.mysqlClientPath.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.mysqlTools.mysqlClientPath.desc')}
              </p>
            </div>
            <TextField
              id="mysql-client-path"
              value={settings.mysqlClientPath}
              placeholder="mysql"
              ariaLabel={t('settings.databasesConfig.mysqlTools.mysqlClientPath.label')}
              onChange={(value) => updateSetting('mysqlClientPath', String(value))}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.mysqlTools.test.label')}
              </p>
              <p className="settings-card__desc" style={{ whiteSpace: 'pre-line' }}>
                {toolStatus
                  ? toolStatus
                  : t('settings.databasesConfig.mysqlTools.test.desc')}
              </p>
            </div>
            <Button
              variant="secondary"
              size="lg"
              disabled={testing}
              onClick={() => void handleTestTools()}
            >
              {testing
                ? t('settings.databasesConfig.mysqlTools.test.testing')
                : t('settings.databasesConfig.mysqlTools.test.button')}
            </Button>
          </div>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.databasesConfig.postgresTools.title')}
        </h2>
        <p className="settings-page__subtitle">
          {t('settings.databasesConfig.postgresTools.subtitle')}
        </p>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.postgresTools.pgDumpPath.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.postgresTools.pgDumpPath.desc')}
              </p>
            </div>
            <TextField
              id="pg-dump-path"
              value={settings.pgDumpPath}
              placeholder="pg_dump"
              ariaLabel={t('settings.databasesConfig.postgresTools.pgDumpPath.label')}
              onChange={(value) => updateSetting('pgDumpPath', String(value))}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.postgresTools.pgRestorePath.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.postgresTools.pgRestorePath.desc')}
              </p>
            </div>
            <TextField
              id="pg-restore-path"
              value={settings.pgRestorePath}
              placeholder="pg_restore"
              ariaLabel={t('settings.databasesConfig.postgresTools.pgRestorePath.label')}
              onChange={(value) => updateSetting('pgRestorePath', String(value))}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.postgresTools.psqlPath.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.postgresTools.psqlPath.desc')}
              </p>
            </div>
            <TextField
              id="psql-path"
              value={settings.psqlPath}
              placeholder="psql"
              ariaLabel={t('settings.databasesConfig.postgresTools.psqlPath.label')}
              onChange={(value) => updateSetting('psqlPath', String(value))}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.postgresTools.test.label')}
              </p>
              <p className="settings-card__desc" style={{ whiteSpace: 'pre-line' }}>
                {pgToolStatus
                  ? pgToolStatus
                  : t('settings.databasesConfig.postgresTools.test.desc')}
              </p>
            </div>
            <Button
              variant="secondary"
              size="lg"
              disabled={pgTesting}
              onClick={() => void handleTestPgTools()}
            >
              {pgTesting
                ? t('settings.databasesConfig.postgresTools.test.testing')
                : t('settings.databasesConfig.postgresTools.test.button')}
            </Button>
          </div>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.databasesConfig.mongoTools.title')}
        </h2>
        <p className="settings-page__subtitle">
          {t('settings.databasesConfig.mongoTools.subtitle')}
        </p>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.mongoTools.mongodumpPath.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.mongoTools.mongodumpPath.desc')}
              </p>
            </div>
            <TextField
              id="mongodump-path"
              value={settings.mongodumpPath}
              placeholder="mongodump"
              ariaLabel={t('settings.databasesConfig.mongoTools.mongodumpPath.label')}
              onChange={(value) => updateSetting('mongodumpPath', String(value))}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.databasesConfig.mongoTools.mongorestorePath.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.databasesConfig.mongoTools.mongorestorePath.desc')}
              </p>
            </div>
            <TextField
              id="mongorestore-path"
              value={settings.mongorestorePath}
              placeholder="mongorestore"
              ariaLabel={t('settings.databasesConfig.mongoTools.mongorestorePath.label')}
              onChange={(value) => updateSetting('mongorestorePath', String(value))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default DatabasesConfigSettings
