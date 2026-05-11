import { BackgroundLayer } from './BackgroundLayer';
import { CharacterSprite } from './CharacterSprite';
import { DialogueBox } from './DialogueBox';
import { ChoiceMenu } from './ChoiceMenu';
import { StatusPanel } from './StatusPanel';
import { ActionBar } from './ActionBar';
import { MoodOverlay } from './MoodOverlay';
import { MapModal } from './MapModal';
import { UserInput } from './UserInput';
import { SaveModal } from '../system/SaveModal';
import { AudioSystem } from '../system/AudioSystem';
import { useGameStore } from '../../stores/gameStore';

export function GameCanvas() {
  const mood = useGameStore(state => state.game.currentState.mood);

  return (
    <div className="relative w-full h-full overflow-hidden" data-mood={mood}>
      <AudioSystem />
      <BackgroundLayer />
      <MoodOverlay />

      {/* Noise texture */}
      <div
        className="absolute inset-0 pointer-events-none z-[3] opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAGFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVfJ/WAAAACHRSTlMzMzMzMzMzM85JBgUAAAABYktHRAH/Ai3eAAAACXBIWXMAAAsTAAALEwEAmpwYAAAARklEQVQ4y2NgQAX8DKhgGSPD/3///v1Dw0JbWYAEEWLI+F8QHrEg4n8IVvj/H0mBEgOyQgYGhv//GR4hK/iPqlARi1gAo+4qhZYuYqsAAAAASUVORK5CYII=")`,
        }}
      />

      <SaveModal />
      <CharacterSprite />
      <DialogueBox />
      <ChoiceMenu />
      <UserInput />
      <StatusPanel />
      <ActionBar />
      <MapModal />
    </div>
  );
}
