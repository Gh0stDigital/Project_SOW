import { audio } from '@/systems/audioEngine'
import { usePersistentStore } from '@/state/persistentStore'

/** Volume and mute. Lives in the same panel wherever settings are shown. */
export function AudioSettings() {
  const settings = usePersistentStore((s) => s.settings)
  const updateSettings = usePersistentStore((s) => s.updateSettings)
  const state = audio.diagnose()

  return (
    <div className="audio-settings">
      <div className="field">
        <label htmlFor="music-volume">음악 · 분위기</label>
        <input
          id="music-volume"
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.musicVolume * 100)}
          onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) / 100 })}
        />
      </div>
      <div className="field">
        <label htmlFor="sfx-volume">효과음</label>
        <input
          id="sfx-volume"
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.sfxVolume * 100)}
          onChange={(e) => updateSettings({ sfxVolume: Number(e.target.value) / 100 })}
        />
      </div>
      <button
        className="btn btn-ghost btn-block"
        data-sfx="none"
        onClick={() => updateSettings({ muted: !settings.muted })}
      >
        {settings.muted ? '🔇 소리 켜기' : '🔊 소리 끄기'}
      </button>
      {/* Said out loud because the two reasons a phone is silent look
          identical from the player's side: the sound never started, or it
          started and the handset is not letting it out. The first is ours
          to fix; the second is the ring/silent switch. */}
      <p className="faint audio-state">
        {state.playing
          ? '소리 작동 중 — 그래도 들리지 않으면 기기의 무음 스위치를 확인하세요.'
          : state.context === 'running'
            ? '소리는 켜져 있지만 지금 재생 중인 음악이 없습니다.'
            : '아직 소리가 시작되지 않았습니다 — 화면을 한 번 누르면 시작됩니다.'}
      </p>
    </div>
  )
}
