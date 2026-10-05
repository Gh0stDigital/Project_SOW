import { useState } from 'react'
import type { Spell } from '@/domain/spell'
import { usePersistentStore } from '@/state/persistentStore'
import { validateNewSpell, DEFAULT_WORD_TYPE } from '@/systems/spellFactory'
import {
  allWordTypes,
  elementDefFor,
  futureLabelFor,
  showsConjugations,
  wordTypeDefs,
  type WordType,
} from '@/config/wordTypes'
import { ElementIcon } from '@/ui/components/ElementIcon'
import { ShopKeeper } from '@/ui/components/ShopKeeper'

interface SpellEditorFormProps {
  existing?: Spell
  onDone: () => void
  onCancel: () => void
}

/**
 * Create/edit form for a single vocabulary entry.
 *
 * No semantic validation is performed — only that the headword and
 * Definition 1 are present, per the prototype's scope. The Element is
 * never an input: it follows the Word Type and is shown read-only so the
 * player can see what their choice produced.
 */
export function SpellEditorForm({ existing, onDone, onCancel }: SpellEditorFormProps) {
  const createSpell = usePersistentStore((s) => s.createSpell)
  const editSpell = usePersistentStore((s) => s.editSpell)

  const [korean, setKorean] = useState(existing?.korean ?? '')
  const [wordType, setWordType] = useState<WordType>(existing?.wordType ?? DEFAULT_WORD_TYPE)
  const [english, setEnglish] = useState(existing?.english ?? '')
  const [definition2, setDefinition2] = useState(existing?.definition2 ?? '')
  const [definition3, setDefinition3] = useState(existing?.definition3 ?? '')
  const [sampleSentence, setSampleSentence] = useState(existing?.sampleSentence ?? '')
  const [sampleTranslation, setSampleTranslation] = useState(existing?.sampleTranslation ?? '')
  const [sampleSentence2, setSampleSentence2] = useState(existing?.sampleSentence2 ?? '')
  const [sampleTranslation2, setSampleTranslation2] = useState(existing?.sampleTranslation2 ?? '')
  const [sampleTargets, setSampleTargets] = useState(existing?.sampleTargets ?? '')
  const [sampleTargets2, setSampleTargets2] = useState(existing?.sampleTargets2 ?? '')
  const [derivedVerb, setDerivedVerb] = useState(existing?.derivedVerb ?? '')
  const [presentForm, setPresentForm] = useState(existing?.presentForm ?? '')
  const [pastForm, setPastForm] = useState(existing?.pastForm ?? '')
  const [futureForm, setFutureForm] = useState(existing?.futureForm ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [errors, setErrors] = useState<{ korean?: string; english?: string }>({})

  const typeDef = wordTypeDefs[wordType]
  // Element follows the type automatically — this is the only place it is
  // computed for display, and there is no way to set it by hand.
  const element = elementDefFor(wordType)
  const showForms = showsConjugations(wordType, derivedVerb)
  const futureLabel = futureLabelFor(wordType, derivedVerb)
  const formsSubject = typeDef.conjugates ? korean.trim() || 'this word' : derivedVerb.trim()

  function handleSave() {
    const validation = validateNewSpell({ korean, english })
    if (validation.length > 0) {
      const next: { korean?: string; english?: string } = {}
      for (const e of validation) next[e.field] = e.message
      setErrors(next)
      return
    }
    const content = {
      korean,
      english,
      definition2,
      definition3,
      notes,
      wordType,
      sampleSentence,
      sampleTranslation,
      sampleSentence2,
      sampleTranslation2,
      sampleTargets,
      sampleTargets2,
      derivedVerb,
      presentForm,
      pastForm,
      futureForm,
    }
    if (existing) editSpell(existing.id, content)
    else createSpell(content)
    onDone()
  }

  return (
    <div className="list spell-editor">
      {/* The keeper at the writing desk. What a new entry actually requires
          used to be discoverable only by pressing save and being refused. */}
      <ShopKeeper
        place={{
          at: 'editor',
          isNew: !existing,
          hasHeadword: korean.trim().length > 0,
          hasMeaning: english.trim().length > 0,
          hasExample: sampleSentence.trim().length > 0,
        }}
      />

      <div className="field">
        <label htmlFor="kor-input">단어</label>
        <input
          id="kor-input"
          type="text"
          lang="ko"
          value={korean}
          onChange={(e) => setKorean(e.target.value)}
          placeholder="예: 전달하다"
        />
        {errors.korean && <span className="field-error">{errors.korean}</span>}
      </div>

      {/* ---- Word type, and the Element it produces ---- */}
      <div className="field">
        <label htmlFor="type-input">품사</label>
        <select id="type-input" value={wordType} onChange={(e) => setWordType(e.target.value as WordType)}>
          {allWordTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="faint">{typeDef.hint}</span>
      </div>

      <div className={`element-readout element-${element.id}`}>
        <ElementIcon element={element} size={22} className="element-icon" />
        <div>
          <div className="element-name">{element.label}</div>
          <div className="faint">품사에 따라 자동으로 정해집니다</div>
        </div>
      </div>

      {/* ---- Meanings ---- */}
      <div className="field">
        <label htmlFor="def1-input">뜻 1</label>
        <input
          id="def1-input"
          type="text"
          lang="en"
          spellCheck
          value={english}
          onChange={(e) => setEnglish(e.target.value)}
          placeholder="예: to deliver"
        />
        {errors.english && <span className="field-error">{errors.english}</span>}
      </div>

      <div className="field">
        <label htmlFor="def2-input">뜻 2 (선택)</label>
        <input
          id="def2-input"
          type="text"
          lang="en"
          spellCheck
          value={definition2}
          onChange={(e) => setDefinition2(e.target.value)}
          placeholder="예: to convey"
        />
      </div>

      <div className="field">
        <label htmlFor="def3-input">뜻 3 (선택)</label>
        <input
          id="def3-input"
          type="text"
          lang="en"
          spellCheck
          value={definition3}
          onChange={(e) => setDefinition3(e.target.value)}
          placeholder="예: to pass along"
        />
        <span className="faint">입력된 뜻은 무엇이든 정답으로 인정됩니다.</span>
      </div>

      {/* ---- Example usage ---- */}
      <div className="field">
        <label htmlFor="sample-input">예문 (선택)</label>
        <input
          id="sample-input"
          type="text"
          lang="ko"
          value={sampleSentence}
          onChange={(e) => setSampleSentence(e.target.value)}
          placeholder="예: 내용을 담당자에게 전달했어요."
        />
      </div>

      <div className="field">
        <label htmlFor="sample-tr-input">예문 번역 (선택)</label>
        <input
          id="sample-tr-input"
          type="text"
          lang="en"
          spellCheck
          value={sampleTranslation}
          onChange={(e) => setSampleTranslation(e.target.value)}
          placeholder="예: I passed the information along."
        />
      </div>

      {/* What Combo mode asks about: which words are in the sentence above
          and the exact form each one takes there. Optional everywhere — a
          word without it is simply asked the ordinary way. Normally filled
          in by importing a list that carries it; this is here so a word
          typed in by hand, or a form typed in wrong, does not need a
          re-import to fix. */}
      <div className="field">
        <label htmlFor="targets-input">예문 콤보 대상 (선택)</label>
        <input
          id="targets-input"
          type="text"
          lang="ko"
          value={sampleTargets}
          onChange={(e) => setSampleTargets(e.target.value)}
          placeholder="예: 연습하다=연습하면|나아지다=나아질 거예요"
        />
      </div>

      {/* A second example. Shown after the answer rather than during it,
          so it teaches without making the prompt longer to read. */}
      <div className="field">
        <label htmlFor="sample2-input">예문 2 (선택)</label>
        <input
          id="sample2-input"
          type="text"
          lang="ko"
          value={sampleSentence2}
          onChange={(e) => setSampleSentence2(e.target.value)}
          placeholder="예: 들은 내용을 그대로 팀에 전달했어요."
        />
      </div>

      <div className="field">
        <label htmlFor="sample2-tr-input">예문 2 번역 (선택)</label>
        <input
          id="sample2-tr-input"
          type="text"
          lang="en"
          spellCheck
          value={sampleTranslation2}
          onChange={(e) => setSampleTranslation2(e.target.value)}
          placeholder="예: I passed on exactly what I heard to the team."
        />
      </div>

      <div className="field">
        <label htmlFor="targets2-input">예문 2 콤보 대상 (선택)</label>
        <input
          id="targets2-input"
          type="text"
          lang="ko"
          value={sampleTargets2}
          onChange={(e) => setSampleTargets2(e.target.value)}
          placeholder="예: 듣다=들은|전달하다=전달했어요"
        />
      </div>

      {/* ---- Derived 하다 verb, for types that can take one ---- */}
      {typeDef.allowsDerivedVerb && (
        <div className="field">
          <label htmlFor="derived-input">파생 동사 (선택)</label>
          <input
            id="derived-input"
            type="text"
            lang="ko"
            value={derivedVerb}
            onChange={(e) => setDerivedVerb(e.target.value)}
            placeholder="예: 검토하다"
          />
          <span className="faint">
            이 단어에 대응하는 하다 동사가 있다면 적어 주세요. 적으면 아래 활용형 칸이 열립니다.
          </span>
        </div>
      )}

      {/* ---- Conjugations: verbs always, others only via a derived verb ---- */}
      {showForms && (
        <div className="conjugation-block">
          <div className="conjugation-head">
            활용형
            {formsSubject && <span className="faint"> — {formsSubject}</span>}
          </div>

          <div className="field">
            <label htmlFor="present-input">현재</label>
            <input
              id="present-input"
              type="text"
              lang="ko"
              value={presentForm}
              onChange={(e) => setPresentForm(e.target.value)}
              placeholder="예: 전달해요"
            />
          </div>

          <div className="field">
            <label htmlFor="past-input">과거</label>
            <input
              id="past-input"
              type="text"
              lang="ko"
              value={pastForm}
              onChange={(e) => setPastForm(e.target.value)}
              placeholder="예: 전달했어요"
            />
          </div>

          <div className="field">
            <label htmlFor="future-input">{futureLabel}</label>
            <input
              id="future-input"
              type="text"
              lang="ko"
              value={futureForm}
              onChange={(e) => setFutureForm(e.target.value)}
              placeholder="예: 전달할 거예요"
            />
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="notes-input">메모 (선택)</label>
        <textarea
          id="notes-input"
          rows={3}
          spellCheck
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="쓰임새, 암기법, 뉘앙스…"
        />
      </div>

      <div className="btn-row">
        <button className="btn btn-primary btn-block" onClick={handleSave}>
          {existing ? '변경 사항 저장' : '항목 만들기'}
        </button>
      </div>
      <button className="btn btn-ghost btn-block" onClick={onCancel}>
        취소
      </button>
    </div>
  )
}
