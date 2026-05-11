import { useGameStore } from '../../stores/gameStore';

export function MoodOverlay() {
  const mood = useGameStore(state => state.game.currentState.mood);

  const getMoodStyles = () => {
    switch (mood) {
      case 'horror':
        return {
          background: 'radial-gradient(circle at corners, transparent 40%, rgba(201, 79, 79, 0.15) 100%)',
          animation: 'screenFlash 4s infinite',
        };
      case 'insane':
        return {
          background: 'rgba(128, 0, 128, 0.1)',
        };
      case 'sad':
        return {
          background: 'rgba(0, 0, 128, 0.1)',
        };
      case 'angry':
        return {
          background: 'rgba(255, 0, 0, 0.15)',
          animation: 'screenFlash 1s infinite',
        };
      case 'happy':
        return {
          background: 'rgba(255, 255, 0, 0.05)',
        };
      default:
        return {
          background: 'transparent',
        };
    }
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none z-[5] transition-all duration-800"
      style={getMoodStyles()}
    />
  );
}
