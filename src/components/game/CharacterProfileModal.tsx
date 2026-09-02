import { useEffect, useMemo, useState } from 'react';

import {
  CHEN_HUIHUI_CALM_PROFILE_CLIP,
  CHEN_HUIHUI_CALM_TAIL_BLINK,
  FUMI_ANIMATION_CLIPS,
  FUMI_TAIL_BLINKS,
  LIN_JING_CALM_PROFILE_CLIP,
  LIN_JING_CALM_TAIL_BLINK,
  OLD_MAN_CALM_TAIL_BLINK,
  OLD_MAN_CALM_TALK_CLIP,
  TOUKO_ANIMATION_CLIPS,
  TOUKO_TAIL_BLINKS,
  ZHAO_GANG_CALM_PROFILE_CLIP,
  ZHAO_GANG_CALM_TAIL_BLINK,
} from '../../data/characterAnimations';
import { getPlayerEntities } from '../../data/playerKnowledge';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { resolveCharacterSprite } from '../../utils/characterAssets';
import { projectKnowledgeForPlayback } from '../../utils/knowledgePresentation';
import { CharacterAnimationPlayer } from './CharacterAnimationPlayer';
import { GameIcon } from '../ui/GameIcon';
import { PixelModalShell } from '../ui/PixelModal';

const CHARACTER_STAGE_LABELS = {
  observed: '仅有印象',
  identified: '姓名已确认',
  'public-known': '公开资料已确认',
  familiar: '逐渐熟悉',
  understood: '深入了解',
} as const;

export function CharacterProfileModal() {
  const showCharacters = useGameStore(state => state.ui.showCharacters);
  const variables = useGameStore(state => state.tavern.variables);
  const currentScene = useGameStore(state => state.game.currentScene);
  const currentLineIndex = useGameStore(state => state.game.currentLineIndex);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const presentationVariables = useMemo(() => projectKnowledgeForPlayback(
    variables,
    currentScene,
    currentLineIndex,
    sceneComplete,
  ), [variables, currentScene, currentLineIndex, sceneComplete]);
  const characters = useMemo(() => getPlayerEntities(presentationVariables), [presentationVariables]);
  const [selectedId, setSelectedId] = useState(characters[0]?.id ?? 'fumi');

  useEffect(() => {
    if (!characters.some(character => character.id === selectedId)) {
      setSelectedId(characters[0]?.id ?? 'fumi');
    }
  }, [characters, selectedId]);

  const selected = characters.find(character => character.id === selectedId) ?? characters[0];
  const close = () => toggleModal('characters');
  const selectedPortrait = selected ? resolveCharacterSprite(selected.portrait) : '';
  const selectedPortraitSrc = selectedPortrait
    ? assetUrl(`assets/characters/${selectedPortrait}`)
    : '';
  const isToukoProfile = selected?.id === 'touko' && /^touko-(normal|calm)\.png$/i.test(selectedPortrait);
  const isFumiProfile = selected?.id === 'fumi' && /^fumi-(normal|calm)\.png$/i.test(selectedPortrait);
  const isOldManProfile = selected?.id === 'old-man' && /^old-man-(normal|calm)\.png$/i.test(selectedPortrait);
  const isChenHuihuiProfile = selected?.id === 'chen-huihui' && /^chen-huihui-(normal|calm)\.png$/i.test(selectedPortrait);
  const isLinJingProfile = selected?.id === 'detective-b' && /^detective-b-normal-v7\.png$/i.test(selectedPortrait);
  const isZhaoGangProfile = selected?.id === 'detective-a' && /^detective-a-normal-v8\.png$/i.test(selectedPortrait);
  const usesAnimatedProfile = isToukoProfile || isFumiProfile || isOldManProfile || isChenHuihuiProfile || isLinJingProfile || isZhaoGangProfile;

  return (
    <PixelModalShell
      open={showCharacters}
      onClose={close}
      labelledBy="character-profile-title"
      className="character-profile-shell"
    >
      <section className="character-profile-modal">
        <aside className="character-profile-list">
          <div className="character-profile-list-header">
            <h2 id="character-profile-title">人物简介</h2>
            <div>
              KNOWN PEOPLE {characters.length}
            </div>
          </div>
          <div className="character-profile-list-scroll pixel-scroll-blue">
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
                  className="character-profile-list-item"
                >
                  <span className="character-profile-list-thumb">
                    <img src={assetUrl(`assets/characters/${portrait}`)} alt="" className="h-full w-full object-cover object-top" />
                  </span>
                  <span className="min-w-0">
                    <strong>{character.displayName}</strong>
                    <small>
                      {CHARACTER_STAGE_LABELS[character.stage]}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {selected && (
          <div className="character-profile-detail">
            <button
              type="button"
              aria-label="关闭人物简介"
              onClick={close}
              className="pixel-modal-close character-profile-close"
            >
              <GameIcon name="close" size={16} />
            </button>

            <div className="character-profile-portrait">
              {usesAnimatedProfile && (
                <CharacterAnimationPlayer
                  key={selected.id}
                  clip={isChenHuihuiProfile
                    ? CHEN_HUIHUI_CALM_PROFILE_CLIP
                    : isLinJingProfile
                      ? LIN_JING_CALM_PROFILE_CLIP
                    : isZhaoGangProfile
                      ? ZHAO_GANG_CALM_PROFILE_CLIP
                    : isFumiProfile
                      ? FUMI_ANIMATION_CLIPS.idle
                    : isToukoProfile
                      ? TOUKO_ANIMATION_CLIPS.idle
                      : OLD_MAN_CALM_TALK_CLIP}
                  fallbackSrc={selectedPortraitSrc}
                  tailBlink={isChenHuihuiProfile
                    ? CHEN_HUIHUI_CALM_TAIL_BLINK
                    : isLinJingProfile
                      ? LIN_JING_CALM_TAIL_BLINK
                    : isZhaoGangProfile
                      ? ZHAO_GANG_CALM_TAIL_BLINK
                    : isFumiProfile
                      ? FUMI_TAIL_BLINKS.idle
                    : isToukoProfile
                      ? TOUKO_TAIL_BLINKS.idle
                      : OLD_MAN_CALM_TAIL_BLINK}
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

            <div className="character-profile-copy">
              <div className="character-profile-eyebrow">
                CHARACTER FILE · {CHARACTER_STAGE_LABELS[selected.stage]}
              </div>
              <h3>{selected.displayName}</h3>
              <div className="character-profile-subtitle">{selected.subtitle}</div>
              <div className="character-profile-divider" />
              <p className="character-profile-description">{selected.profile}</p>
              <div className="character-profile-facts">
                <div className="character-profile-facts-title">CURRENTLY KNOWN</div>
                {selected.facts.map(fact => (
                  <div key={fact} className="character-profile-fact">
                    <span>◆</span><span>{fact}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </PixelModalShell>
  );
}
