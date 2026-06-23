/**
 * useLayoutManager — manages panel/results resize logic and results visibility.
 * State that only affects resizing is kept local to avoid triggering full page re-renders.
 */
import { useState, useRef, useEffect, useCallback } from 'react'

const MIN_PANEL_WIDTH = 180
const MAX_PANEL_WIDTH = 480
const MIN_AI_PANEL_WIDTH = 280
const MAX_AI_PANEL_WIDTH = 600
const MIN_SED_PANEL_WIDTH = 280
const MAX_SED_PANEL_WIDTH = 600

export interface UseLayoutManagerReturn {
  panelWidth: number
  resultsHeight: number
  resultsVisible: boolean
  panelRef: React.RefObject<HTMLElement | null>
  editorAreaRef: React.RefObject<HTMLDivElement | null>
  handleToggleResults: () => void
  onResizeStart: (e: React.MouseEvent) => void
  onResultsResizeStart: (e: React.MouseEvent) => void
  aiPanelOpen: boolean
  aiPanelWidth: number
  aiPanelRef: React.RefObject<HTMLDivElement | null>
  toggleAiPanel: () => void
  onAiPanelResizeStart: (e: React.MouseEvent) => void
  sedPanelOpen: boolean
  setSedPanelOpen: (open: boolean) => void
  sedPanelWidth: number
  sedPanelRef: React.RefObject<HTMLDivElement | null>
  onSedPanelResizeStart: (e: React.MouseEvent) => void
}

export function useLayoutManager(): UseLayoutManagerReturn {
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('explorer_panel_width')
    return saved ? parseInt(saved, 10) : 308
  })
  const [resultsHeight, setResultsHeight] = useState(260)
  const [resultsVisible, setResultsVisible] = useState(true)
  const [aiPanelOpen, setAiPanelOpen] = useState(() => {
    return localStorage.getItem('explorer_ai_panel_open') === 'true'
  })
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const saved = localStorage.getItem('explorer_ai_panel_width')
    return saved ? parseInt(saved, 10) : 380
  })

  const isDragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const isResizingResults = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)
  const isResizingAiPanel = useRef(false)
  const aiDragStartX = useRef(0)
  const aiDragStartWidth = useRef(0)
  const [sedPanelOpen, setSedPanelOpen] = useState(false)
  const [sedPanelWidth, setSedPanelWidth] = useState(() => {
    const saved = localStorage.getItem('explorer_sed_panel_width')
    return saved ? parseInt(saved, 10) : 360
  })
  const isResizingSedPanel = useRef(false)
  const sedDragStartX = useRef(0)
  const sedDragStartWidth = useRef(0)

  const panelRef = useRef<HTMLElement>(null)
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const aiPanelRef = useRef<HTMLDivElement>(null)
  const sedPanelRef = useRef<HTMLDivElement>(null)

  // Sync CSS variable for panel width
  useEffect(() => {
    panelRef.current?.style.setProperty('--panel-width', `${panelWidth}px`)
  }, [panelWidth])

  // Sync CSS variable for results height
  useEffect(() => {
    editorAreaRef.current?.style.setProperty('--results-height', `${resultsHeight}px`)
  }, [resultsHeight])

  // Sync CSS variable for AI panel width
  useEffect(() => {
    aiPanelRef.current?.style.setProperty('--ai-panel-width', `${aiPanelWidth}px`)
  }, [aiPanelWidth])

  // Sync CSS variable for SED panel width
  useEffect(() => {
    sedPanelRef.current?.style.setProperty('--sed-panel-width', `${sedPanelWidth}px`)
  }, [sedPanelWidth])

  const handleToggleResults = useCallback(() => {
    setResultsVisible((v) => !v)
  }, [])

  const toggleAiPanel = useCallback(() => {
    setAiPanelOpen((open) => {
      const next = !open
      localStorage.setItem('explorer_ai_panel_open', String(next))
      return next
    })
  }, [])

  const onAiPanelResizeStart = useCallback(
    (e: React.MouseEvent) => {
      isResizingAiPanel.current = true
      aiDragStartX.current = e.clientX
      aiDragStartWidth.current = aiPanelWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      let currentWidth = aiPanelWidth

      function onMouseMove(ev: MouseEvent): void {
        if (!isResizingAiPanel.current) return
        // Dragging left edge: moving left increases width
        const delta = aiDragStartX.current - ev.clientX
        const next = Math.min(MAX_AI_PANEL_WIDTH, Math.max(MIN_AI_PANEL_WIDTH, aiDragStartWidth.current + delta))
        currentWidth = next
        aiPanelRef.current?.style.setProperty('--ai-panel-width', `${next}px`)
      }

      function onMouseUp(): void {
        isResizingAiPanel.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        setAiPanelWidth(currentWidth)
        localStorage.setItem('explorer_ai_panel_width', String(currentWidth))
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [aiPanelWidth]
  )

  const onSedPanelResizeStart = useCallback(
    (e: React.MouseEvent) => {
      isResizingSedPanel.current = true
      sedDragStartX.current = e.clientX
      sedDragStartWidth.current = sedPanelWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      let currentWidth = sedPanelWidth

      function onMouseMove(ev: MouseEvent): void {
        if (!isResizingSedPanel.current) return
        const delta = sedDragStartX.current - ev.clientX
        const next = Math.min(MAX_SED_PANEL_WIDTH, Math.max(MIN_SED_PANEL_WIDTH, sedDragStartWidth.current + delta))
        currentWidth = next
        sedPanelRef.current?.style.setProperty('--sed-panel-width', `${next}px`)
      }

      function onMouseUp(): void {
        isResizingSedPanel.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        setSedPanelWidth(currentWidth)
        localStorage.setItem('explorer_sed_panel_width', String(currentWidth))
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [sedPanelWidth]
  )

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true
      dragStartX.current = e.clientX
      dragStartWidth.current = panelWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      function onMouseMove(ev: MouseEvent): void {
        if (!isDragging.current) return
        const delta = ev.clientX - dragStartX.current
        const next = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, dragStartWidth.current + delta))
        setPanelWidth(next)
      }

      function onMouseUp(): void {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setPanelWidth((w) => {
          localStorage.setItem('explorer_panel_width', String(w))
          return w
        })
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [panelWidth]
  )

  const onResultsResizeStart = useCallback(
    (e: React.MouseEvent) => {
      isResizingResults.current = true
      dragStartY.current = e.clientY
      dragStartHeight.current = resultsHeight
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      let currentHeight = resultsHeight

      function onMouseMove(ev: MouseEvent): void {
        if (!isResizingResults.current) return
        const areaHeight = editorAreaRef.current?.clientHeight ?? 600
        const delta = dragStartY.current - ev.clientY
        const next = Math.min(Math.round(areaHeight * 0.8), Math.max(120, dragStartHeight.current + delta))
        currentHeight = next
        // Direct CSS update — no React re-render during drag
        editorAreaRef.current?.style.setProperty('--results-height', `${next}px`)
      }

      function onMouseUp(): void {
        isResizingResults.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        // Single state update when drag ends to persist the value
        setResultsHeight(currentHeight)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [resultsHeight]
  )

  return {
    panelWidth,
    resultsHeight,
    resultsVisible,
    panelRef,
    editorAreaRef,
    handleToggleResults,
    onResizeStart,
    onResultsResizeStart,
    aiPanelOpen,
    aiPanelWidth,
    aiPanelRef,
    toggleAiPanel,
    onAiPanelResizeStart,
    sedPanelOpen,
    setSedPanelOpen,
    sedPanelWidth,
    sedPanelRef,
    onSedPanelResizeStart
  }
}
