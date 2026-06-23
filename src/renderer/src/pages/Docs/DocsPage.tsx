import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { parseDocSections } from './parseDocSections'
import { useScreenNav } from '../../components/NavController/NavController'
import docsContent from '../../../../../docs/documentation.md?raw'
import './DocsPage.css'

function DocsPage({ isActive = false }: { isActive?: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const screenNavSlot = useScreenNav()
  const sections = useMemo(() => parseDocSections(docsContent), [])
  const [activeId, setActiveId] = useState<string>(() => sections[0]?.id ?? '')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections
    const q = searchQuery.toLowerCase()
    return sections.filter((s) => s.title.toLowerCase().includes(q))
  }, [sections, searchQuery])

  const activeSection = useMemo(() => sections.find((s) => s.id === activeId), [sections, activeId])

  function renderDocsNav(): React.JSX.Element {
    return (
      <aside className="docs__sidebar" aria-label={t('docs.navAriaLabel')}>
        <div className="docs__sidebar-inner">
          <div className="docs__search-wrap">
            <Search size={13} className="docs__search-icon" />
            <input
              type="text"
              className="docs__search"
              placeholder={t('docs.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('docs.searchPlaceholder')}
            />
          </div>
          <nav>
            {filteredSections.length === 0 && searchQuery.trim() && (
              <p className="docs__no-results">{t('docs.noResults')}</p>
            )}
            {filteredSections.map((section) => (
              <button
                key={section.id}
                className={[
                  'docs__nav-item',
                  section.level === 2 ? 'docs__nav-item--sub' : '',
                  section.id === activeId ? 'docs__nav-item--active' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={section.id === activeId ? 'page' : undefined}
                onClick={() => setActiveId(section.id)}
              >
                {section.title}
              </button>
            ))}
          </nav>
        </div>
      </aside>
    )
  }

  return (
    <>
      {screenNavSlot
        ? (isActive && createPortal(renderDocsNav(), screenNavSlot))
        : renderDocsNav()
      }
      <div className="docs">
        <div className="docs__content">
          {sections.length === 0 ? (
            <div className="docs__empty">{t('docs.empty')}</div>
          ) : activeSection ? (
            <div className="docs__markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeSection.content}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}

export default DocsPage
