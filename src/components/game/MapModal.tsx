import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { X, MapPin } from '@phosphor-icons/react';

interface Location {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string;
}

const locations: Location[] = [
  { id: 'home', name: '家', x: 30, y: 60, description: '你的公寓，一切开始的地方' },
  { id: 'school', name: '学校', x: 70, y: 40, description: '熟悉的校园，但已物是人非' },
  { id: 'street', name: '街道', x: 50, y: 50, description: '城市的主干道，行人稀少' },
  { id: 'supermarket', name: '超市', x: 80, y: 70, description: '24小时营业的便利店' },
];

export function MapModal() {
  const showMap = useGameStore(state => state.ui.showMap);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  if (!showMap) return null;

  const handleTravel = () => {
    toggleModal('map');
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
      onClick={() => toggleModal('map')}
    >
      <div
        className="relative w-[640px] h-[480px] bg-bg-primary border border-border-subtle animate-[scaleIn_0.35s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={() => toggleModal('map')}
          className="absolute top-3 right-3 z-10 text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={20} />
        </button>

        {/* 标题 */}
        <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
          <MapPin size={16} className="text-accent-blue" />
          <span className="text-sm font-serif-cn text-text-primary">地图</span>
        </div>

        {/* 地图背景 */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${assetUrl('assets/map/map.png')})`,
            filter: 'grayscale(60%) contrast(120%)',
          }}
        />

        {/* 网格线 */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-10">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#6b8cff" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* 地点标记 */}
        {locations.map(location => (
          <div
            key={location.id}
            className="absolute cursor-pointer group"
            style={{ left: `${location.x}%`, top: `${location.y}%`, transform: 'translate(-50%, -50%)' }}
            onClick={() => setSelectedLocation(location)}
          >
            <div className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
              selectedLocation?.id === location.id
                ? 'bg-accent-blue border-white scale-150'
                : 'bg-white border-bg-primary group-hover:scale-125'
            }`}
              style={selectedLocation?.id === location.id ? { boxShadow: '0 0 10px rgba(107,140,255,0.8)' } : {}}
            />
            <div className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-bg-secondary/90 border border-border-subtle text-xs text-text-primary whitespace-nowrap transition-opacity ${
              selectedLocation?.id === location.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}>
              {location.name}
            </div>
          </div>
        ))}

        {/* 地点信息面板 */}
        {selectedLocation && (
          <div className="absolute bottom-4 left-4 right-4 bg-bg-secondary/95 border border-border-subtle p-4 animate-[slideInUp_0.3s_ease-out]">
            <h3 className="text-accent-blue text-base font-serif-cn mb-1">{selectedLocation.name}</h3>
            <p className="text-sm text-text-muted mb-3">{selectedLocation.description}</p>
            <button
              onClick={handleTravel}
              className="px-4 py-2 bg-accent-blue text-bg-primary text-sm hover:bg-accent-blue/80 transition-colors"
            >
              关闭地图
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
