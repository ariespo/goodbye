import { useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_LOCATION_ID,
  estimateTravel,
  getLocationBackground,
  getLocationById,
  normalizeLocationId,
  type LocationIconKey,
} from '../../data/locations';
import {
  addKnowledgeEvent,
  getCurrentLocationPresentation,
  getVisibleLocationPresentations,
} from '../../data/playerKnowledge';
import { saveChat } from '../../sillytavern/database';
import type { Scene } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { settleGameTransaction } from '../../engine/game-transaction';
import { commitGameTransaction } from '../../utils/gameTransactionStore';
import { resolveSceneEnvironment } from '../../utils/sceneEnvironment';
import { GameIcon } from '../ui/GameIcon';

const BLUE = '#86a8f2';
const GOLD = '#d4a853';
const TEXT_MAIN = '#e8e4dc';
const TEXT_DIM = '#8a8580';

export function MapModal() {
  const showMap = useGameStore(state => state.ui.showMap);
  const variables = useGameStore(state => state.tavern.variables);
  const chats = useGameStore(state => state.tavern.chats);
  const activeChatId = useGameStore(state => state.tavern.activeChatId);
  const gameStatus = useGameStore(state => state.game.gameStatus);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const isTyping = useGameStore(state => state.game.isTyping);
  const actions = useGameStore(state => state.actions);
  const currentLocationId = normalizeLocationId(variables.location);
  const visibleLocations = useMemo(() => getVisibleLocationPresentations(variables), [variables]);
  const [selectedLocationId, setSelectedLocationId] = useState(currentLocationId);
  const [isTraveling, setIsTraveling] = useState(false);
  const mapViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showMap) setSelectedLocationId(currentLocationId);
  }, [currentLocationId, showMap]);

  useEffect(() => {
    if (!showMap) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = mapViewportRef.current;
      const currentNode = viewport?.querySelector<HTMLElement>(`[data-location-id="${currentLocationId}"]`);
      if (!viewport || !currentNode) return;
      viewport.scrollLeft = Math.max(0, currentNode.offsetLeft - viewport.clientWidth / 2);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentLocationId, showMap]);

  const currentLocation = getLocationById(currentLocationId) ?? getLocationById(DEFAULT_LOCATION_ID)!;
  const currentPresentation = getCurrentLocationPresentation(variables);
  const selectedPresentation = visibleLocations.find(location => location.id === selectedLocationId) ?? currentPresentation;
  const selectedLocation = getLocationById(selectedPresentation.id) ?? currentLocation;
  const estimate = useMemo(
    () => estimateTravel(currentLocation.id, selectedLocation.id),
    [currentLocation.id, selectedLocation.id],
  );
  const isCurrentLocation = selectedLocation.id === currentLocation.id;
  const lacksStamina = !!estimate && gameStatus.stamina < estimate.staminaCost;
  const isOnlyRumored = !selectedPresentation.canTravel;
  const travelUnavailable = isCurrentLocation || isOnlyRumored || lacksStamina || isWaitingForAI || isTyping || isTraveling;

  if (!showMap) return null;

  const closeMap = () => actions.toggleModal('map');

  const handleTravel = async () => {
    const travel = estimateTravel(currentLocation.id, selectedLocation.id);
    if (!selectedPresentation.canTravel) {
      actions.addNotification({ type: 'info', message: '目前只有模糊线索，需要先确认准确位置', duration: 2800 });
      return;
    }
    if (!travel || travel.distance === 0) {
      actions.addNotification({ type: 'info', message: '你已经在这里了', duration: 2200 });
      return;
    }
    if (isWaitingForAI || isTyping || isTraveling) {
      actions.addNotification({ type: 'warning', message: '当前演出尚未结束，暂时无法移动', duration: 2600 });
      return;
    }
    if (gameStatus.stamina < travel.staminaCost) {
      actions.addNotification({ type: 'error', message: `体力不足，还需要 ${travel.staminaCost} 点体力`, duration: 3000 });
      return;
    }

    setIsTraveling(true);
    const liveState = useGameStore.getState();
    const transaction = settleGameTransaction({
      variables: liveState.tavern.variables,
      gameStatus: liveState.game.gameStatus,
      variablePatch: {
        location: selectedLocation.id,
        knowledgeEvents: addKnowledgeEvent(liveState.tavern.variables.knowledgeEvents, `visit:${selectedLocation.id}`),
      },
      costs: {
        timeMinutes: travel.timeMinutes,
        stamina: travel.staminaCost,
      },
      endings: liveState.game.endings,
      endingsSeen: liveState.game.endingsSeen,
      hasEndingInProgress: liveState.game.endingPanel.visible
        || !!liveState.game.endingPanel.pendingEndingId,
    });
    const nextTime = transaction.gameStatus.time;
    const nextStamina = transaction.gameStatus.stamina;
    const nextBackground = getLocationBackground(selectedLocation, nextTime);
    const nextVariables = transaction.variables;
    const arrivalScene: Scene = {
      id: `travel-${selectedLocation.id}-${nextTime.getTime()}`,
      lines: [
        {
          background: nextBackground,
          speaker: '旁白',
          emotion: 'calm',
          text: `你冒雨抵达${selectedPresentation.name}。路上用了${travel.timeMinutes}分钟，体力下降${travel.staminaCost}点。`,
        },
      ],
      observe: selectedPresentation.description,
    };

    commitGameTransaction(transaction);
    actions.setCurrentScene(arrivalScene);
    actions.setCurrentState({
      background: nextBackground,
      character: null,
      speaker: '旁白',
      mood: 'calm',
      effect: null,
      item: null,
      environment: resolveSceneEnvironment(nextBackground),
    });
    actions.setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
    actions.addHistorySnapshot({
      turnIndex: useGameStore.getState().game.history.length,
      timestamp: Date.now(),
      summary: `从${currentPresentation.name}移动到${selectedPresentation.name}`,
      gameStatus: { ...gameStatus, time: nextTime, stamina: nextStamina },
      variables: nextVariables,
    });

    const activeChat = chats.find(chat => chat.id === activeChatId);
    if (activeChat) {
      const updatedChat = { ...activeChat, variables: nextVariables, updatedAt: Date.now() };
      await saveChat(updatedChat);
      actions.setChats(chats.map(chat => chat.id === updatedChat.id ? updatedChat : chat));
    }

    actions.addNotification({
      type: 'success',
      message: `已抵达${selectedPresentation.name}：-${travel.staminaCost}体力，时间推进${travel.timeMinutes}分钟`,
      duration: 3200,
    });
    setIsTraveling(false);
    closeMap();
  };

  return (
    <div
      className="map-modal-shell fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.9)' }}
      onClick={closeMap}
    >
      <div
        className="map-modal clean-modal-frame clean-modal-frame-blue relative h-[680px] w-[980px] max-h-[94vh] max-w-[96vw] animate-[scaleIn_0.25s_steps(4,end)] overflow-hidden"
        onClick={event => event.stopPropagation()}
        style={{
          imageRendering: 'pixelated',
          filter: 'drop-shadow(0 24px 52px rgba(0,0,0,0.62))',
        }}
      >
        <div className="map-modal-header absolute left-8 right-8 top-7 flex items-center justify-between border-b-2 border-[#25252d] pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[#343842] bg-[#0a0b0e]"
              style={{ color: BLUE }}
            >
              <GameIcon name="map" size={23} />
            </div>
            <div className="min-w-0">
              <div className="font-serif-cn text-[22px] tracking-[0.22em] text-[#e8e4dc]">贵阳老城区</div>
              <div className="truncate font-mono text-[11px] text-[#8a8580]">当前位置：{currentPresentation.name}</div>
            </div>
          </div>
          <button
            aria-label="关闭地图"
            title="关闭地图"
            data-cursor="pointer"
            onClick={closeMap}
            className="pixel-close-button flex h-10 w-10 shrink-0 items-center justify-center"
            style={{ cursor: 'pointer' }}
          >
            <GameIcon name="close" size={16} />
          </button>
        </div>

        <div ref={mapViewportRef} className="map-modal-map pixel-scroll-blue absolute bottom-[174px] left-8 right-8 top-[94px] overflow-hidden border-2 border-[#30343a] bg-[#08090c]">
          <div className="map-canvas relative h-full min-w-full overflow-hidden">
            <div
              className="map-pixel-background absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${assetUrl('assets/map/guiyang-old-district-pixel.svg')})` }}
            />
            <div
              className="absolute inset-0 opacity-30 mix-blend-screen"
              style={{
                backgroundImage: `url(${assetUrl('assets/ui/scanline.png')})`,
                backgroundRepeat: 'repeat',
              }}
            />

            <div
              className="map-player-marker"
              style={{ left: `${currentLocation.x}%`, top: `${currentLocation.y}%` }}
              aria-hidden="true"
            >
              <span className="map-player-marker__shadow" />
              <img
                src={assetUrl('assets/map/player-marker-pixel.svg')}
                alt=""
                className="map-player-marker__sprite"
                draggable={false}
              />
            </div>

            {visibleLocations.map(location => {
              const selected = selectedLocation.id === location.id;
              const current = currentLocation.id === location.id;
              return (
              <button
                key={location.id}
                type="button"
                data-cursor="pointer"
                data-location-id={location.id}
                data-current={current ? 'true' : undefined}
                aria-label={`${location.name}${current ? '，当前位置' : ''}`}
                title={location.name}
                onClick={() => setSelectedLocationId(location.id)}
                className="map-location-node group absolute h-12 w-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#86a8f2]"
                data-knowledge-stage={location.stage}
                style={{ left: `${location.x}%`, top: `${location.y}%`, cursor: 'pointer', opacity: location.stage === 'rumored' ? 0.72 : 1 }}
              >
                <span
                  className="absolute inset-0 border-2 bg-[#0b0c0f]"
                  style={{
                    borderColor: current ? GOLD : selected ? BLUE : location.stage === 'rumored' ? '#77727f' : '#666a70',
                    boxShadow: current
                      ? '0 0 0 2px #0b0c0f, 0 0 14px rgba(212,168,83,0.68)'
                      : selected
                        ? '0 0 0 2px #0b0c0f, 0 0 12px rgba(134,168,242,0.56)'
                        : '3px 3px 0 rgba(0,0,0,0.72)',
                  }}
                />
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ color: current ? GOLD : selected ? BLUE : TEXT_MAIN }}
                >
                  {location.stage === 'rumored' ? <span className="font-mono text-xl">?</span> : <LocationIcon icon={location.icon} />}
                </span>
                <span
                  className={`map-location-label absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap border px-2 py-1 text-[11px] font-bold ${selected || current ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
                  style={{
                    borderColor: current ? GOLD : selected ? BLUE : '#505058',
                    background: '#08090c',
                    color: current ? GOLD : selected ? BLUE : TEXT_MAIN,
                  }}
                >
                  {location.shortName}
                </span>
              </button>
              );
            })}
          </div>
        </div>

        <div
          className="map-modal-info absolute bottom-7 left-10 right-10 h-[126px] border-2 border-[#30343a] bg-[#0a0b0e] px-5 py-4"
          style={{ boxShadow: 'inset 0 0 0 2px #15171b' }}
        >
          <div className="flex min-w-0 items-start justify-between gap-5 pr-[190px]">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <div className="map-location-name font-serif-cn text-[20px] tracking-[0.12em]" style={{ color: isCurrentLocation ? GOLD : BLUE }}>
                  {selectedPresentation.name}
                </div>
                <span className="font-mono text-[10px]" style={{ color: TEXT_DIM }}>{selectedPresentation.signal}</span>
                {isCurrentLocation && <span className="border border-[#8f7438] px-2 py-0.5 text-[11px] text-[#d4a853]">当前位置</span>}
                {selectedPresentation.stage === 'rumored' && <span className="border border-[#55515f] px-2 py-0.5 text-[11px] text-[#aaa5b0]">位置未确认</span>}
                {selectedPresentation.stage === 'visited' && !isCurrentLocation && <span className="border border-[#425a50] px-2 py-0.5 text-[11px] text-[#8fc8a8]">已到访</span>}
              </div>
              <p className="line-clamp-2 text-[14px] leading-6" style={{ color: '#c8c2b8' }}>
                {selectedPresentation.description}
              </p>
            </div>
          </div>

          <div className="map-travel-meta absolute bottom-4 left-5 flex flex-wrap gap-2 text-[12px]">
            {!isCurrentLocation && estimate && selectedPresentation.canTravel && (
              <>
                <TravelChip label="距离" value={`${estimate.distanceKm.toFixed(1)} km`} />
                <TravelChip label="时间" value={`${estimate.timeMinutes} 分钟`} />
                <TravelChip label="体力" value={`-${estimate.staminaCost}`} danger={lacksStamina} />
              </>
            )}
          </div>

          <button
            type="button"
            data-cursor="pointer"
            disabled={travelUnavailable}
            onClick={handleTravel}
            className="map-travel-button absolute bottom-4 right-5 flex h-11 w-[164px] items-center justify-center gap-2 border-2 text-[14px] tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              borderColor: isCurrentLocation ? '#5e4d28' : '#546b9b',
              background: isCurrentLocation ? '#231f17' : '#18223a',
              color: isCurrentLocation ? GOLD : '#dce7ff',
              boxShadow: '3px 3px 0 rgba(0,0,0,0.72)',
              cursor: travelUnavailable ? 'not-allowed' : 'pointer',
            }}
          >
            <GameIcon name={isCurrentLocation ? 'map' : 'play'} size={16} />
            {isTraveling ? '移动中' : isCurrentLocation ? '已经抵达' : isOnlyRumored ? '需要确认位置' : lacksStamina ? '体力不足' : '前往此处'}
          </button>
        </div>
      </div>
    </div>
  );
}

const locationIconIndex: Record<LocationIconKey, number> = {
  home: 0,
  senpai: 1,
  school: 2,
  store: 3,
  'old-building': 4,
  trail: 5,
  inn: 6,
  'water-tower': 7,
  hospital: 8,
  observation: 9,
};

function LocationIcon({ icon }: { icon: LocationIconKey }) {
  return (
    <span
      aria-hidden="true"
      className="pixel-location-icon"
      style={{
        WebkitMaskPosition: `${locationIconIndex[icon] * -28}px 0`,
        maskPosition: `${locationIconIndex[icon] * -28}px 0`,
      }}
    />
  );
}

function TravelChip({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <span className="border border-[#35383e] bg-[#111318] px-2 py-1" style={{ color: danger ? '#e37a7a' : TEXT_DIM }}>
      <span className="mr-1 text-[#686c73]">{label}</span>{value}
    </span>
  );
}
