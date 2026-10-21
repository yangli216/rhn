import { createContext, useContext, useEffect } from 'react'

/** Lets a dense workspace ask the shell for more horizontal room while its tab is the active one. */
export interface FocusLayoutContextValue {
  tabId: string
  setFocus: (tabId: string, active: boolean) => void
}

export const FocusLayoutContext = createContext<FocusLayoutContextValue | null>(null)

/** While mounted (and `active`), the shell collapses the main navigation for this tab; the doctor can still expand it. */
export function useFocusLayout(active = true) {
  const context = useContext(FocusLayoutContext)
  const tabId = context?.tabId
  const setFocus = context?.setFocus
  useEffect(() => {
    if (!tabId || !setFocus || !active) return
    setFocus(tabId, true)
    return () => setFocus(tabId, false)
  }, [tabId, setFocus, active])
}
