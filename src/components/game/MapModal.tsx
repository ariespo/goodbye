import { useState } from 'react';

import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { GameIcon } from '../ui/GameIcon';

interface Location {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string;
  signal: string;
}

const locations: Location[] = [
  { id: 'home', name: '家', x: 30, y: 60, signal: 'HOME', description: '你的公寓，一切开始的地方。灯光还亮着，像一帧被反复播放的记忆。' },
  { id: 'school', name: '学校', x: 70, y: 40, signal: 'SCHOOL', description: '熟悉的校园，但每条走廊都像通向错误的时间。' },
  { id: 'street', name: '街道', x: 50, y: 50, signal: 'STREET', description: '城市的主干道，行人稀少，路灯在胶片颗粒里闪烁。' },
  { id: 'supermarket', name: '超市', x: 80, y: 70, signal: 'STORE', description: '二十四小时营业的便利店，冷白色灯光照着空货架。' },
];

export function MapModal() {
  const showMap = useGameStore(state => state.ui.showMap);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(locations[0]);

  if (!showMap) return null;

  const closeMap = () => toggleModal('map');

  return (
    <div
      className="map-modal-shell fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{
        background: 'radial-gradient(circle at 50% 44%, rgba(32,38,48,0.45), rgba(0,0,0,0.88) 58%, rgba(0,0,0,0.94))',
      }}
      onClick={closeMap}
    >
      <div
        className="map-modal pixel-frame-corners relative h-[560px] w-[760px] max-w-[94vw] animate-[scaleIn_0.35s_ease-out] overflow-hidden"
        onClick={event => event.stopPropagation()}
        style={{
          backgroundImage: `url(${assetUrl('assets/ui/modal-shell-blue.png')})`,
          backgroundSize: '100% 100%',
          imageRendering: 'pixelated',
          filter: 'drop-shadow(0 24px 52px rgba(0,0,0,0.62))',
        }}
      >
        <div className="map-modal-header absolute left-8 right-8 top-7 flex items-center justify-between border-b-2 border-[#25252d] pb-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center"
              style={{
                backgroundImage: `url(${assetUrl('assets/ui/action-slot-blue-hover.png')})`,
                backgroundSize: '100% 100%',
                color: '#86a8f2',
              }}
            >
              <GameIcon name="map" size={23} />
            </div>
            <div>
              <div className="font-serif-cn text-[22px] tracking-[0.22em] text-[#e8e4dc]">地图</div>
              <div className="font-mono text-[11px] tracking-[0.2em] text-[#8a8580]">CITY MEMORY INDEX</div>
            </div>
          </div>
          <button
            aria-label="关闭地图"
            data-cursor="pointer"
            onClick={closeMap}
            className="pixel-close-button flex h-10 w-10 items-center justify-center"
            style={{
              cursor: 'pointer',
            }}
          >
            <GameIcon name="close" size={16} />
          </button>
        </div>

        <div className="map-modal-map absolute bottom-36 left-8 right-8 top-[94px] overflow-hidden border-2 border-[#17171d] bg-black">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${assetUrl('assets/map/map.png')})`,
              filter: 'grayscale(80%) contrast(126%) brightness(0.74)',
            }}
          />
          <div
            className="absolute inset-0 opacity-70 mix-blend-screen"
            style={{
              backgroundImage: `url(${assetUrl('assets/ui/map-grid-overlay.png')}), url(${assetUrl('assets/ui/scanline.png')})`,
              backgroundRepeat: 'repeat',
            }}
          />
          <svg className="absolute inset-0 h-full w-full pointer-events-none opacity-45" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={locations.map(location => `${location.x},${location.y}`).join(' ')}
              fill="none"
              stroke="#6b8fc4"
              strokeWidth="2"
              strokeDasharray="6 8"
            />
          </svg>

          {locations.map(location => {
            const active = selectedLocation?.id === location.id;
            return (
              <button
                key={location.id}
                type="button"
                data-cursor="pointer"
                onClick={() => setSelectedLocation(location)}
                className="group absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 transition-[filter,transform] duration-100 hover:scale-110"
                style={{
                  left: `${location.x}%`,
                  top: `${location.y}%`,
                  backgroundImage: `url(${assetUrl(`assets/ui/${active ? 'map-node-active.png' : 'map-node-normal.png'}`)})`,
                  backgroundSize: '100% 100%',
                  imageRendering: 'pixelated',
                  filter: active ? 'drop-shadow(0 0 12px rgba(107,143,196,0.72))' : 'drop-shadow(0 0 8px rgba(232,228,220,0.28))',
                  cursor: 'pointer',
                }}
                aria-label={location.name}
              >
                <span className="sr-only">{location.name}</span>
                <span
                  className={`map-location-label absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap px-2 py-1 text-[12px] transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  style={{
                    border: `1px solid ${active ? '#86a8f2' : '#505058'}`,
                    background: active ? 'rgba(20, 32, 56, 0.92)' : 'rgba(0,0,0,0.8)',
                    color: active ? '#86a8f2' : '#e8e4dc',
                    boxShadow: active ? '0 0 10px rgba(134,168,242,0.35)' : 'none',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                  }}
                >
                  {location.name}
                </span>
              </button>
            );
          })}
        </div>

        {selectedLocation && (
          <div
            className="map-modal-info absolute bottom-7 left-10 right-10 h-[116px] px-5 py-4"
            style={{
              backgroundImage: `url(${assetUrl('assets/ui/map-info-card.png')})`,
              backgroundSize: '100% 100%',
              imageRendering: 'pixelated',
            }}
          >
            <div className="mb-1 flex items-center justify-between">
              <div
                className="map-location-name font-serif-cn text-[20px] tracking-[0.16em]"
                style={{ color: '#86a8f2', textShadow: '0 0 12px rgba(134,168,242,0.35)' }}
              >
                {selectedLocation.name}
              </div>
              <div
                className="map-location-signal font-mono text-[11px] tracking-[0.2em]"
                style={{ color: '#d4a853', textShadow: '0 0 10px rgba(212,168,83,0.3)' }}
              >
                {selectedLocation.signal}
              </div>
            </div>
            <p className="max-w-[560px] text-[15px] leading-relaxed" style={{ color: '#c8c2b8' }}>
              {selectedLocation.description}
            </p>
            <button
              type="button"
              data-cursor="pointer"
              onClick={closeMap}
              className="absolute bottom-4 right-5 h-10 px-5 text-[15px] tracking-[0.12em] text-[#0d0d0f]"
              style={{
                background: '#86a8f2',
                boxShadow: '3px 3px 0 rgba(0,0,0,0.55), inset 1px 1px 0 rgba(255,255,255,0.42)',
                cursor: 'pointer',
              }}
            >
              关闭地图
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
