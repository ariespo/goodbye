import { useEffect, useMemo, useState } from 'react';

import {
  FUMI_ANIMATION_CLIPS,
  FUMI_TAIL_BLINKS,
  TOUKO_ANIMATION_CLIPS,
  TOUKO_TAIL_BLINKS,
} from '../../data/characterAnimations';
import { getPlayerEntities } from '../../data/playerKnowledge';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { resolveCharacterSprite } from '../../utils/characterAssets';
import { CharacterAnimationPlayer } from './CharacterAnimationPlayer';
import { GameIcon } from '../ui/GameIcon';

const TEXT_MAIN = '#e8e4dc';
const TEXT_DIM = '#aaa59e';
const BLUE = '#86a8f2';
const GOLD = '#d4a853';

export function CharacterProfileModal() {
  const showCharacters = useGameStore(state => state.ui.showCharacters);
  const variables = useGameStore(state => state.tavern.variables);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const characters = useMemo(() => getPlayerEntities(variables), [variables]);
  const [selectedId, setSelectedId] = useState(characters[0]?.id ?? 'fumi');

  useEffect(() => {
    if (!characters.some(character => character.id === selectedId)) {
      setSelectedId(characters[0]?.id ?? 'fumi');
    }
  }, [characters, selectedId]);

  if (!showCharacters) return null;
  const selected = characters.find(character => character.id === selectedId) ?? characters[0];
  const close = () => toggleModal('characters');
  const selectedPortrait = selected ? resolveCharacterSprite(selected.portrait) : '';
  const selectedPortraitSrc = selectedPortrait
    ? assetUrl(`assets/characters/${selectedPortrait}`)
    : '';
  const isToukoProfile = selected?.id === 'touko' && /^touko-(normal|calm)\.png$/i.test(selectedPortrait);
  const isFumiProfile = selected?.id === 'fumi' && /^fumi-(normal|calm)\.png$/i.test(selectedPortrait);
  const usesAnimatedProfile = isToukoProfile || isFumiProfile;

  return (
    <div
      className="character-profile-shell fixed inset-0 z-[240] flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(circle at 50% 42%, rgba(24,30,42,0.5), rgba(0,0,0,0.91) 66%)' }}
      onClick={close}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="人物简介"
        className="character-profile-modal clean-modal-frame clean-modal-frame-blue relative grid h-[680px] w-[920px] max-h-[92vh] max-w-[95vw] grid-cols-[280px_1fr] overflow-hidden"
        onClick={event => event.stopPropagation()}
      >
        <aside className="character-profile-list border-r-2 border-[#292c33] bg-[#090a0d] px-5 py-6">
          <div className="mb-5 border-b-2 border-[#25252d] pb-4">
            <div className="font-serif-cn text-[22px] tracking-[0.2em]" style={{ color: TEXT_MAIN }}>人物简介</div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.18em]" style={{ color: TEXT_DIM }}>
              KNOWN PEOPLE {characters.length}
            </div>
          </div>
          <div className="pixel-scroll-blue max-h-[560px] space-y-2 overflow-y-auto pr-2">
            {characters.map(character => {
              const active = character.id === selected?.id;
              const portrait = resolveCharacterSprite(character.portrait);
              return (
                <button
                  key={character.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={`查看${character.displayName}的人物简介`}
                  onClick={() => setSelectedId(character.id)}
                  className="character-profile-list-item flex w-full items-center gap-3 border-2 px-3 py-2 text-left"
                  style={{
                    borderColor: active ? BLUE : '#2e3138',
                    background: active ? '#172039' : '#0e1014',
                    color: active ? '#edf3ff' : TEXT_DIM,
                    cursor: 'pointer',
                  }}
                >
                  <span className="h-14 w-12 shrink-0 overflow-hidden border border-[#3a3d45] bg-[#08090b]">
                    <img src={assetUrl(`assets/characters/${portrait}`)} alt="" className="h-full w-full object-cover object-top" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate font-serif-cn text-[16px]">{character.displayName}</strong>
                    <small className="mt-1 block truncate text-[11px]" style={{ color: active ? '#aebfe8' : '#777b82' }}>
                      {character.stage === 'observed' ? '身份未确认' : character.stage === 'identified' ? '身份已确认' : '已经认识'}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {selected && (
          <div className="character-profile-detail relative overflow-hidden bg-[#0b0c10]">
            <div className="absolute inset-0 opacity-25" style={{ background: 'linear-gradient(135deg, rgba(134,168,242,0.15), transparent 52%)' }} />
            <button
              type="button"
              aria-label="关闭人物简介"
              onClick={close}
              className="pixel-close-button absolute right-6 top-6 z-20 flex h-10 w-10 items-center justify-center"
              style={{ cursor: 'pointer' }}
            >
              <GameIcon name="close" size={16} />
            </button>

            <div className="character-profile-portrait absolute bottom-0 left-0 top-0 w-[43%] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#0b0c10]" />
              {usesAnimatedProfile && (
                <CharacterAnimationPlayer
                  key={selected.id}
                  clip={isFumiProfile ? FUMI_ANIMATION_CLIPS.idle : TOUKO_ANIMATION_CLIPS.idle}
                  fallbackSrc={selectedPortraitSrc}
                  tailBlink={isFumiProfile ? FUMI_TAIL_BLINKS.idle : TOUKO_TAIL_BLINKS.idle}
                  className="h-full w-full"
                  style={{ imageRendering: 'pixelated' }}
                />
              )}
              <img
                src={selectedPortraitSrc}
                alt={`${selected.displayName}立绘`}
                className={usesAnimatedProfile ? 'hidden' : 'h-full w-full object-contain object-bottom'}
                style={{ imageRendering: 'pixelated' }}
              />
            </div>

            <div className="character-profile-copy relative z-10 ml-[38%] flex h-full flex-col justify-center px-10 py-16">
              <div className="mb-3 font-mono text-[11px] tracking-[0.22em]" style={{ color: BLUE }}>CHARACTER FILE</div>
              <h2 className="font-serif-cn text-[38px] tracking-[0.12em]" style={{ color: TEXT_MAIN }}>{selected.displayName}</h2>
              <div className="mt-2 text-[14px] tracking-[0.08em]" style={{ color: GOLD }}>{selected.subtitle}</div>
              <div className="my-6 h-[2px] w-20 bg-[#526a9b]" />
              <p className="text-[16px] leading-8" style={{ color: '#cbc6bd' }}>{selected.profile}</p>
              <div className="mt-7 space-y-2">
                <div className="mb-2 font-mono text-[10px] tracking-[0.18em]" style={{ color: TEXT_DIM }}>CURRENTLY KNOWN</div>
                {selected.facts.map(fact => (
                  <div key={fact} className="flex items-start gap-3 border-l-2 border-[#40557f] bg-[#11151e] px-3 py-2 text-[13px]" style={{ color: '#b8b4ad' }}>
                    <span style={{ color: BLUE }}>◆</span><span>{fact}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
