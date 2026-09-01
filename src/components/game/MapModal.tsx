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
import {
  PixelModalAction,
  PixelModalContent,
  PixelModalFooter,
  PixelModalHeader,
  PixelModalShell,
  PixelModalStatus,
} from '../ui/PixelModal';

// Visual anchors for the illustrated RPG map. Travel distance continues to use
// the canonical coordinates in data/locations.ts, so artwork revisions cannot
// silently change time or stamina costs.
const MAP_LOCATION_POSITIONS: Record<string, { x: number; y: number }> = {
  home: { x: 44, y: 50 },
  'senpai-building': { x: 46, y: 39 },
  school: { x: 43, y: 71 },
  supermarket: { x: 20, y: 71 },
  'old-man-building': { x: 4, y: 84 },
  'mountain-trail': { x: 67, y: 71 },
  'detective-inn': { x: 79, y: 68 },
  'water-tower': { x: 51, y: 8 },
  'community-hospital': { x: 57, y: 38 },
  'observation-deck': { x: 86, y: 42 },
};

function getMapPosition(location: { id: string; x: number; y: number }) {
  return MAP_LOCATION_POSITIONS[location.id] ?? { x: location.x, y: location.y };
}

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
  const currentMapPosition = getMapPosition(currentLocation);
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
  const travelLabel = isTraveling
    ? '移动中'
    : isCurrentLocation
      ? '已经抵达'
      : isOnlyRumored
        ? '需要确认位置'
        : lacksStamina
          ? '体力不足'
          : isWaitingForAI || isTyping
            ? '当前演出尚未结束'
            : '前往此处';

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
    <PixelModalShell
      open={showMap}
      onClose={closeMap}
      labelledBy="map-modal-title"
      className="map-modal-shell"
    >
      <PixelModalHeader
        titleId="map-modal-title"
        title="地图"
        meta={`GUIYANG OLD DISTRICT / 当前位置：${currentPresentation.name}`}
        iconSrc="map"
        onClose={closeMap}
        closeLabel="关闭地图"
      />
      <PixelModalContent className="map-modal-content">
        <div ref={mapViewportRef} className="map-modal-map pixel-scroll-blue">
          <div className="map-canvas relative h-full min-w-full overflow-hidden">
            <div
              className="map-pixel-background absolute inset-0"
              style={{
                backgroundImage: `url(${assetUrl('assets/map/guiyang-old-district-rpg-gray-v2.png?v=20260808-rpg-gray-v2')})`,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '100% 100%',
              }}
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
              style={{ left: `${currentMapPosition.x}%`, top: `${currentMapPosition.y}%` }}
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
              const mapPosition = getMapPosition(location);
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
                className="map-location-node group absolute h-12 w-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2f2f0]"
                data-knowledge-stage={location.stage}
                style={{ left: `${mapPosition.x}%`, top: `${mapPosition.y}%`, cursor: 'pointer', opacity: location.stage === 'rumored' ? 0.72 : 1 }}
              >
                <span
                  className="absolute inset-0 border-2 bg-[#0b0c0f]"
                  style={{
                    borderColor: current || selected ? '#f2f2f0' : location.stage === 'rumored' ? '#777773' : '#aaaaa6',
                    background: current || selected ? '#f2f2f0' : '#050505',
                    boxShadow: current
                      ? '0 0 0 3px #050505, 0 0 0 6px #f2f2f0'
                      : selected
                        ? '0 0 0 3px #f2f2f0'
                        : '3px 3px 0 #050505',
                  }}
                />
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ color: current || selected ? '#050505' : '#f2f2f0' }}
                >
                  {location.stage === 'rumored' ? <span className="font-mono text-xl">?</span> : <LocationIcon icon={location.icon} />}
                </span>
                <span
                  className={`map-location-label absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap border px-2 py-1 text-[11px] font-bold ${selected || current ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
                  style={{
                    borderColor: current || selected ? '#f2f2f0' : '#777773',
                    background: current || selected ? '#f2f2f0' : '#050505',
                    color: current || selected ? '#050505' : '#f2f2f0',
                  }}
                >
                  {location.shortName}
                </span>
              </button>
              );
            })}
          </div>
        </div>
      </PixelModalContent>
      <PixelModalFooter className="map-modal-info map-modal-footer">
        <div className="map-modal-info-copy">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-3">
              <div className="map-location-name font-serif-cn text-[20px] tracking-[0.12em]">
                {selectedPresentation.name}
              </div>
              <PixelModalStatus className="map-location-signal">{selectedPresentation.signal}</PixelModalStatus>
              {isCurrentLocation && <PixelModalStatus className="map-location-status" data-state="current">当前位置</PixelModalStatus>}
              {selectedPresentation.stage === 'rumored' && <PixelModalStatus className="map-location-status" data-state="rumored">位置未确认</PixelModalStatus>}
              {selectedPresentation.stage === 'visited' && !isCurrentLocation && <PixelModalStatus className="map-location-status" data-state="visited">已到访</PixelModalStatus>}
            </div>
            <p className="map-location-description line-clamp-2 text-[14px] leading-6">
              {selectedPresentation.description}
            </p>
          </div>
        </div>

        <div className="map-travel-meta">
          {!isCurrentLocation && estimate && selectedPresentation.canTravel && (
            <>
              <TravelChip label="距离" value={`${estimate.distanceKm.toFixed(1)} km`} />
              <TravelChip label="时间" value={`${estimate.timeMinutes} 分钟`} />
              <TravelChip label="体力" value={`-${estimate.staminaCost}`} danger={lacksStamina} />
            </>
          )}
        </div>

        <PixelModalAction
          data-cursor="pointer"
          disabled={travelUnavailable}
          onClick={handleTravel}
          active={!travelUnavailable}
          className="map-travel-button"
          aria-label={travelLabel}
          icon={<GameIcon name="play" size={16} />}
        >
          {travelLabel}
        </PixelModalAction>
      </PixelModalFooter>
    </PixelModalShell>
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
    <span className="map-travel-chip" data-danger={danger ? 'true' : undefined}>
      <span>{label}</span>{value}
    </span>
  );
}
