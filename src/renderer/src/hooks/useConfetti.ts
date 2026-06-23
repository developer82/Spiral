import { useCallback } from 'react'
import { useConfettiContext } from '../contexts/ConfettiContext'
import { useSettingsContext } from '../contexts/SettingsContext'

export function useConfetti(): { triggerConfetti: () => void } {
  const { triggerConfetti: rawTrigger } = useConfettiContext()
  const { settings } = useSettingsContext()

  const triggerConfetti = useCallback(() => {
    if (settings.likeConfetti) rawTrigger()
  }, [settings.likeConfetti, rawTrigger])

  return { triggerConfetti }
}
