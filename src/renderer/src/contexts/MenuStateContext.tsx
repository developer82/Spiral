import { createContext, useContext, useState, useCallback } from 'react'

interface MenuStateContextValue {
  /** True when at least one document tab is open. */
  hasOpenDocuments: boolean
  /** True when the active document has unsaved changes (or is an ERD tab). */
  canSaveActive: boolean
  /** True when the Explorer page is active and a document tab is open. */
  isDocumentFocused: boolean
  updateMenuState: (updates: {
    hasOpenDocuments?: boolean
    canSaveActive?: boolean
    isDocumentFocused?: boolean
  }) => void
}

const MenuStateContext = createContext<MenuStateContextValue>({
  hasOpenDocuments: false,
  canSaveActive: false,
  isDocumentFocused: false,
  updateMenuState: () => {}
})

export function MenuStateProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState({
    hasOpenDocuments: false,
    canSaveActive: false,
    isDocumentFocused: false
  })

  const updateMenuState = useCallback(
    (updates: { hasOpenDocuments?: boolean; canSaveActive?: boolean; isDocumentFocused?: boolean }) => {
      setState((prev) => ({ ...prev, ...updates }))
      if (window.api.platform === 'darwin') {
        window.api.menu.updateState(updates)
      }
    },
    []
  )

  return (
    <MenuStateContext.Provider value={{ ...state, updateMenuState }}>
      {children}
    </MenuStateContext.Provider>
  )
}

export function useMenuStateContext(): MenuStateContextValue {
  return useContext(MenuStateContext)
}
