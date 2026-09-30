import { useUiStore } from '@/state/uiStore'
import { useGameAudio } from '@/ui/hooks/useGameAudio'
import { useSoundtrack } from '@/ui/hooks/useSoundtrack'
import { useUiSounds } from '@/ui/hooks/useUiSounds'
import { useTransitions } from '@/ui/hooks/useTransitions'
import { TransitionCurtain } from '@/ui/components/TransitionCurtain'
import { MainMenuScreen } from '@/ui/screens/MainMenu/MainMenuScreen'
import { CompendiumScreen } from '@/ui/screens/Compendium/CompendiumScreen'
import { TotemScreen } from '@/ui/screens/Totem/TotemScreen'
import { WorkshopScreen } from '@/ui/screens/Workshop/WorkshopScreen'
import { DungeonScreen } from '@/ui/screens/Dungeon/DungeonScreen'
import { RecordsScreen } from '@/ui/screens/Records/RecordsScreen'
import { TitleSequence } from '@/ui/screens/Title/TitleSequence'

export default function App() {
  const screen = useUiStore((s) => s.screen)
  // The opening plays *over* a mounted app rather than instead of one, so
  // the menu underneath has settled by the time the sequence lifts — which
  // is what lets its loading beat wait on real work. Whether it is up lives
  // in the store rather than here, because the menu can send the player back
  // to it.
  const titleUp = useUiStore((s) => s.titleUp)
  const closeTitle = useUiStore((s) => s.closeTitle)

  // Sound is mounted once, here. None of it can throw, and none of it is
  // awaited: the game runs identically with the speakers off.
  useGameAudio()
  useSoundtrack()
  useUiSounds()
  useTransitions()

  return (
    <div className="app-shell">
      {screen === 'menu' && <MainMenuScreen />}
      {screen === 'compendium' && <CompendiumScreen />}
      {screen === 'totem' && <TotemScreen />}
      {screen === 'workshop' && <WorkshopScreen />}
      {screen === 'dungeon' && <DungeonScreen />}
      {screen === 'records' && <RecordsScreen />}
      <TransitionCurtain />
      {titleUp && <TitleSequence onDone={closeTitle} />}
    </div>
  )
}
