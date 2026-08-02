import { useMemo, useState } from 'react';
import { CharacterAnimationPlayer } from '../game/CharacterAnimationPlayer';
import { backgroundAssets } from '../../data/backgroundAssets';
import {
  STANDARD_CHARACTER_CANVAS,
} from '../../engine/character-animation';
import { assetUrl } from '../../utils/assetUrl';
import {
  FUMI_ANIMATION_CLIPS,
  FUMI_TAIL_BLINKS,
  TOUKO_ANIMATION_CLIPS,
  TOUKO_TAIL_BLINKS,
  type FumiAnimationId,
  type ToukoAnimationId,
} from '../../data/characterAnimations';

type CharacterId = 'fumi' | 'touko';
type LabAnimationId = FumiAnimationId | ToukoAnimationId;
type ViewportId = 'desktop' | 'widescreen' | 'mobile-landscape' | 'mobile-portrait';

interface PoseDefinition {
  id: string;
  label: string;
  file: string;
  note: string;
  line: string;
}

interface CharacterDefinition {
  displayName: string;
  canvas: { width: number; height: number };
  poses: PoseDefinition[];
}

const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  fumi: {
    displayName: '文穗',
    canvas: STANDARD_CHARACTER_CANVAS,
    poses: [
      {
        id: 'idle',
        label: '基础待机',
        file: 'fumi-idle.png',
        note: '把抹布叠好；温和、内收，但站姿端正。',
        line: '早餐在桌上。……虽然只是很普通的东西。',
      },
      {
        id: 'small-mischief',
        label: '小调皮',
        file: 'fumi-small-mischief.png',
        note: '藏起抹布并看回玩家；第一次允许自己开小玩笑。',
        line: '我才没有偷偷准备什么。真的。',
      },
      {
        id: 'stand-ground',
        label: '站稳',
        file: 'fumi-stand-ground.png',
        note: '仍然温和，但停止整理并直视玩家。',
        line: '这一次，让我自己决定，好吗？',
      },
    ],
  },
  touko: {
    displayName: '沈灯织',
    canvas: STANDARD_CHARACTER_CANVAS,
    poses: [
      {
        id: 'idle',
        label: '基础待机',
        file: 'touko-idle.png',
        note: '整理袖口并复位；平和、可靠、无懈可击。',
        line: '先坐下吧。你看起来需要一点时间。',
      },
      {
        id: 'measure',
        label: '衡量',
        file: 'touko-measure.png',
        note: '轻点手腕并注视玩家；温柔地进行评估。',
        line: '你的小松鼠最近好像很忙。',
      },
      {
        id: 'open-hand',
        label: '解除距离',
        file: 'touko-open-hand.png',
        note: '停止复位并主动展开手；亲近仍由她主导。',
        line: '过来吧。至少在我面前，你不必继续解释。',
      },
    ],
  },
};

const VIEWPORTS: Record<ViewportId, { label: string; width: number; height: number }> = {
  desktop: { label: '桌面 1440×900', width: 1440, height: 900 },
  widescreen: { label: '宽屏 1920×1080', width: 1920, height: 1080 },
  'mobile-landscape': { label: '移动横屏 844×390', width: 844, height: 390 },
  'mobile-portrait': { label: '移动竖屏 390×844', width: 390, height: 844 },
};

const PREVIEW_BACKGROUNDS = backgroundAssets.filter(background => [
  'home-day',
  'bedroom1-day',
  'senpai-room',
  'school-day',
  'street',
  'water-tower',
].includes(background.id));

export function CharacterPoseLab() {
  const params = new URLSearchParams(window.location.search);
  const requestedCharacter = params.get('character') === 'touko' ? 'touko' : 'fumi';
  const requestedPose = params.get('pose');
  const requestedViewport = params.get('viewport');
  const requestedBackground = params.get('background');
  const initialPose = CHARACTERS[requestedCharacter].poses.some(item => item.id === requestedPose)
    ? requestedPose as string
    : CHARACTERS[requestedCharacter].poses[0].id;

  const [characterId, setCharacterId] = useState<CharacterId>(requestedCharacter);
  const [poseId, setPoseId] = useState(initialPose);
  const [backgroundId, setBackgroundId] = useState(
    PREVIEW_BACKGROUNDS.some(item => item.id === requestedBackground) ? requestedBackground as string : 'home-day',
  );
  const [viewportId, setViewportId] = useState<ViewportId>(
    requestedViewport && requestedViewport in VIEWPORTS ? requestedViewport as ViewportId : 'desktop',
  );
  const [showDialogue, setShowDialogue] = useState(true);
  const [showGuides, setShowGuides] = useState(false);
  const [showAnimation, setShowAnimation] = useState(params.get('animation') === '1');
  const [animationClipId, setAnimationClipId] = useState<LabAnimationId>(
    params.get('clip') === 'talk' || params.get('clip') === 'fold' || params.get('clip') === 'reset-cuff'
      ? params.get('clip') as LabAnimationId
      : 'idle',
  );
  const [animationRun, setAnimationRun] = useState(0);

  const character = CHARACTERS[characterId];
  const pose = character.poses.find(item => item.id === poseId) ?? character.poses[0];
  const viewport = VIEWPORTS[viewportId];
  const background = PREVIEW_BACKGROUNDS.find(item => item.id === backgroundId) ?? PREVIEW_BACKGROUNDS[0];
  const canAnimate = pose.id === 'idle';
  const animationClip = characterId === 'fumi'
    ? FUMI_ANIMATION_CLIPS[animationClipId as FumiAnimationId] ?? FUMI_ANIMATION_CLIPS.idle
    : TOUKO_ANIMATION_CLIPS[animationClipId as ToukoAnimationId] ?? TOUKO_ANIMATION_CLIPS.idle;
  const animationTailBlink = characterId === 'fumi'
    ? FUMI_TAIL_BLINKS[animationClipId as FumiAnimationId] ?? FUMI_TAIL_BLINKS.idle
    : TOUKO_TAIL_BLINKS[animationClipId as ToukoAnimationId] ?? TOUKO_TAIL_BLINKS.idle;

  const geometry = useMemo(() => {
    const compactLandscape = viewport.height <= 560 && viewport.width > viewport.height;
    const mobilePortrait = viewport.width <= 700 && viewport.height > viewport.width;

    if (compactLandscape) {
      const safeLeft = 10;
      const safeRight = 10;
      const safeBottom = 8;
      const portraitLane = Math.min(210, Math.max(138, viewport.width * 0.25));
      const dialogueLeft = safeLeft + portraitLane + 10;
      const dialogueRight = safeRight + 8;
      const sharedBottom = safeBottom + 52;
      return {
        spriteWidthPercent: Math.min(viewport.width * 0.24, 150) / viewport.width * 100,
        spriteLeftPercent: (safeLeft + 32) / viewport.width * 100,
        spriteBottomPercent: sharedBottom / viewport.height * 100,
        dialogueWidthPercent: (viewport.width - dialogueLeft - dialogueRight) / viewport.width * 100,
        dialogueHeightPercent: Math.min(118, Math.max(92, viewport.height * 0.28)) / viewport.height * 100,
        dialogueLeftPercent: dialogueLeft / viewport.width * 100,
        dialogueBottomPercent: sharedBottom / viewport.height * 100,
        dialogueCentered: false,
      };
    }

    const spriteWidth = Math.min(character.canvas.width, viewport.width * 0.34);
    const dialogueWidth = mobilePortrait
      ? viewport.width - 20
      : Math.min(viewport.width * 0.88, 980);
    const dialogueHeight = Math.min(178, Math.max(120, viewport.height * 0.32));
    return {
      spriteWidthPercent: spriteWidth / viewport.width * 100,
      spriteLeftPercent: 5,
      spriteBottomPercent: 10,
      dialogueWidthPercent: dialogueWidth / viewport.width * 100,
      dialogueHeightPercent: dialogueHeight / viewport.height * 100,
      dialogueLeftPercent: mobilePortrait ? 10 / viewport.width * 100 : 50,
      dialogueBottomPercent: mobilePortrait ? 114 / viewport.height * 100 : 5,
      dialogueCentered: !mobilePortrait,
    };
  }, [character.canvas.width, viewport.height, viewport.width]);

  const changeCharacter = (next: CharacterId) => {
    setCharacterId(next);
    setPoseId(CHARACTERS[next].poses[0].id);
    setAnimationClipId('idle');
  };

  return (
    <main className="min-h-full w-full overflow-auto bg-[#08090b] text-[#e8e4dc]" style={{ cursor: 'auto' }}>
      <header className="sticky top-0 z-50 border-b border-[#343941] bg-[#090a0d]/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="font-serif-cn text-[20px] tracking-[0.14em]">角色演出预览器</h1>
            <p className="mt-1 text-[11px] tracking-[0.08em] text-[#858b94]">PHASE A/B · POSE & MOTION VALIDATION</p>
          </div>

          <LabSelect label="角色" value={characterId} onChange={value => changeCharacter(value as CharacterId)}>
            <option value="fumi">文穗</option>
            <option value="touko">沈灯织</option>
          </LabSelect>

          <LabSelect label="背景" value={backgroundId} onChange={setBackgroundId}>
            {PREVIEW_BACKGROUNDS.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
          </LabSelect>

          <LabSelect label="视口" value={viewportId} onChange={value => setViewportId(value as ViewportId)}>
            {Object.entries(VIEWPORTS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </LabSelect>

          <LabSelect label="动画" value={animationClipId} onChange={value => setAnimationClipId(value as LabAnimationId)}>
            <option value="idle">待机</option>
            <option value="talk">说话</option>
            {characterId === 'fumi'
              ? <option value="fold">折布</option>
              : <option value="reset-cuff">复位袖口</option>}
          </LabSelect>

          <LabToggle label="对话框" checked={showDialogue} onChange={setShowDialogue} />
          <LabToggle label="参考线" checked={showGuides} onChange={setShowGuides} />
          <LabToggle label="动态" checked={showAnimation} onChange={setShowAnimation} />
          {showAnimation && (animationClipId === 'fold' || animationClipId === 'reset-cuff') && (
            <button
              type="button"
              onClick={() => setAnimationRun(run => run + 1)}
              className="border border-[#4c535f] px-3 py-2 text-xs text-[#b8bec8] hover:border-[#d4a853] hover:text-[#f4ead2]"
              style={{ cursor: 'pointer' }}
            >
              重播
            </button>
          )}
          <a className="border border-[#4c535f] px-3 py-2 text-xs text-[#b8bec8] hover:border-[#d4a853] hover:text-[#f4ead2]" href="/">
            返回游戏
          </a>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1500px] gap-5 p-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border border-[#2b3038] bg-[#0d0f13] p-4">
          <div className="text-xs tracking-[0.18em] text-[#8ea8d0]">{character.displayName} · KEY POSES</div>
          <div className="mt-4 grid gap-2">
            {character.poses.map(item => {
              const active = item.id === pose.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPoseId(item.id)}
                  className="border px-3 py-3 text-left transition-colors"
                  style={{
                    cursor: 'pointer',
                    borderColor: active ? '#d4a853' : '#303640',
                    background: active ? '#1a1710' : '#111318',
                    color: active ? '#f4ead2' : '#b2b7c0',
                  }}
                >
                  <strong className="block font-serif-cn text-[15px] tracking-[0.08em]">{item.label}</strong>
                  <span className="mt-1 block text-[11px] leading-5 text-[#777e88]">{item.note}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 border-t border-[#292e36] pt-4 text-[11px] leading-5 text-[#7e858f]">
            <p>角色画布：{character.canvas.width}×{character.canvas.height}</p>
            <p>模拟视口：{viewport.width}×{viewport.height}</p>
            <p>背景：{background.displayName}</p>
          </div>
        </aside>

        <div className="flex min-h-[calc(100vh-126px)] items-center justify-center overflow-hidden border border-[#262b32] bg-[#050608] p-3">
          <div
            className="relative max-w-full overflow-hidden border border-[#555b65] bg-black shadow-[0_18px_70px_rgba(0,0,0,0.55)]"
            style={{
              width: `min(100%, calc((100vh - 178px) * ${viewport.width / viewport.height}))`,
              aspectRatio: `${viewport.width} / ${viewport.height}`,
            }}
          >
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${assetUrl(`assets/backgrounds/${background.file}`)})`,
                filter: 'grayscale(100%) contrast(150%)',
              }}
            />
            <div className="absolute inset-0 bg-black/5" />
            <div
              className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
              style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 3px, #fff 3px 4px)' }}
            />

            {showGuides && (
              <>
                <div className="absolute inset-y-0 left-1/2 z-30 border-l border-dashed border-cyan-300/50" />
                <div className="absolute inset-x-0 bottom-[10%] z-30 border-t border-dashed border-amber-300/60" />
                <div className="absolute inset-[5%] z-30 border border-dashed border-white/35" />
              </>
            )}

            {showAnimation && canAnimate ? (
              <CharacterAnimationPlayer
                key={`${animationClipId}-${animationRun}`}
                clip={animationClip}
                fallbackSrc={assetUrl(`assets/characters/stage-a/${pose.file}`)}
                stopAfterCycle={animationClipId === 'fold' || animationClipId === 'reset-cuff'}
                tailBlink={animationTailBlink}
                className="absolute z-10"
                style={{
                  left: `${geometry.spriteLeftPercent}%`,
                  bottom: `${geometry.spriteBottomPercent}%`,
                  width: `${geometry.spriteWidthPercent}%`,
                  aspectRatio: `${STANDARD_CHARACTER_CANVAS.width} / ${STANDARD_CHARACTER_CANVAS.height}`,
                  filter: 'grayscale(1) contrast(1.18) brightness(0.98) drop-shadow(7px 10px 0 rgba(0,0,0,0.18))',
                }}
              />
            ) : (
              <img
                key={`${characterId}-${pose.id}`}
                src={assetUrl(`assets/characters/stage-a/${pose.file}`)}
                alt={`${character.displayName}·${pose.label}`}
                className="absolute z-10 object-contain object-bottom"
                style={{
                  left: `${geometry.spriteLeftPercent}%`,
                  bottom: `${geometry.spriteBottomPercent}%`,
                  width: `${geometry.spriteWidthPercent}%`,
                  height: 'auto',
                  imageRendering: 'pixelated',
                  filter: 'grayscale(1) contrast(1.18) brightness(0.98) drop-shadow(7px 10px 0 rgba(0,0,0,0.18))',
                }}
              />
            )}

            {showDialogue && (
              <div
                className="absolute z-20 border-2 border-[#d8d8d2] bg-[#080a0e]/95 shadow-[4px_4px_0_#050505]"
                style={{
                  width: `${geometry.dialogueWidthPercent}%`,
                  minHeight: `${geometry.dialogueHeightPercent}%`,
                  left: `${geometry.dialogueLeftPercent}%`,
                  bottom: `${geometry.dialogueBottomPercent}%`,
                  transform: geometry.dialogueCentered ? 'translateX(-50%)' : 'none',
                }}
              >
                <div className="absolute -top-9 left-0 border-2 border-[#d8d8d2] bg-[#172b41] px-4 py-1 font-serif-cn text-sm tracking-[0.16em] text-white shadow-[3px_3px_0_#050505]">
                  {character.displayName}
                </div>
                <p className="px-[4%] py-[5%] font-serif-cn text-[clamp(10px,1.2vw,18px)] leading-[1.9] tracking-[0.04em] text-[#ece8df]">
                  “{pose.line}”
                </p>
              </div>
            )}

            <div className="absolute right-2 top-2 z-40 bg-black/70 px-2 py-1 font-mono text-[9px] tracking-wider text-white/70">
              {viewport.width}×{viewport.height} · {pose.id}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function LabSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-[10px] tracking-[0.12em] text-[#737a84]">
      {label}
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="border border-[#343a44] bg-[#101319] px-2 py-1.5 text-xs text-[#d6d9df] outline-none focus:border-[#d4a853]"
        style={{ cursor: 'pointer' }}
      >
        {children}
      </select>
    </label>
  );
}

function LabToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-end gap-2 pb-1.5 text-xs text-[#a9afb8]" style={{ cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
