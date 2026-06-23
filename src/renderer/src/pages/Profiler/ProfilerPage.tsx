import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProfilerContext } from '../../contexts/ProfilerContext'
import ProfilerTabView from './ProfilerTabView'
import './ProfilerPage.css'
import '../pages.css'

function ProfilerPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { tabs, activeTabId, setActiveTabId, pauseTab, resumeTab, stopTab, closeTab } =
    useProfilerContext()

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null

  function getStateDot(state: 'running' | 'paused' | 'stopped'): string {
    switch (state) {
      case 'running': return 'profiler-tab__dot--running'
      case 'paused': return 'profiler-tab__dot--paused'
      case 'stopped': return 'profiler-tab__dot--stopped'
    }
  }

  return (
    <div className="profiler-page page">
      {tabs.length === 0 ? (
        <div className="profiler-page__empty">
          <p className="profiler-page__empty-text">{t('profiler.emptyState')}</p>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="profiler-tab-bar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`profiler-tab${tab.id === activeTab?.id ? ' profiler-tab--active' : ''}`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className={`profiler-tab__dot ${getStateDot(tab.state)}`} />
                <span className="profiler-tab__title">{tab.databaseName}</span>
                <span
                  className="profiler-tab__close"
                  role="button"
                  aria-label={t('profiler.tab.close')}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  <X size={12} />
                </span>
              </button>
            ))}
          </div>

          {/* Active tab content */}
          {activeTab && (
            <div className="profiler-page__content">
              <ProfilerTabView
                tab={activeTab}
                onPause={() => pauseTab(activeTab.id)}
                onResume={() => resumeTab(activeTab.id)}
                onStop={() => stopTab(activeTab.id)}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ProfilerPage
