import { useEffect, useState } from 'react';
import { saveSettings } from '../../sillytavern/database';
import { useGameStore } from '../../stores/gameStore';
import { persistActiveChat } from '../../utils/chatPersistence';
import {
  PixelModalAction,
  PixelModalContent,
  PixelModalFooter,
  PixelModalShell,
} from '../ui/PixelModal';

export function PlayerIdentityPrompt({ open, onConfirmed }: {
  open: boolean;
  onConfirmed: () => void;
}) {
  const settings = useGameStore(state => state.tavern.settings);
  const actions = useGameStore(state => state.actions);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !settings) return;
    setName(settings.userName === '玩家' ? '' : settings.userName);
    setGender(settings.playerGender ?? null);
  }, [open, settings]);

  if (!open || !settings) return null;

  const confirm = async () => {
    const normalizedName = name.trim().slice(0, 20);
    if (!normalizedName || !gender || saving) {
      actions.addNotification({ type: 'warning', message: '请填写名字并选择性别', duration: 2500 });
      return;
    }
    setSaving(true);
    try {
      const next = {
        ...settings,
        userName: normalizedName,
        playerGender: gender,
        playerIdentityConfirmed: true,
      };
      await saveSettings(next);
      actions.setSettings(next);
      try {
        await persistActiveChat({ userName: normalizedName });
      } catch (error) {
        actions.addNotification({
          type: 'warning',
          message: `姓名已保存，但当前存档标签同步失败：${error instanceof Error ? error.message : '未知错误'}`,
          duration: 4000,
        });
      }
      onConfirmed();
    } catch (error) {
      actions.addNotification({
        type: 'error',
        message: `身份保存失败：${error instanceof Error ? error.message : '未知错误'}`,
        duration: 4000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PixelModalShell
      open
      onClose={() => undefined}
      labelledBy="identity-modal-title"
      compact
      closeBlocked
      className="identity-modal-shell"
    >
      <form
        className="identity-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
      >
        <header className="identity-modal-header">
          <h2 id="identity-modal-title" className="identity-modal-title">身份确认</h2>
          <p className="identity-modal-meta">REMEMBER WHO YOU ARE</p>
        </header>

        <PixelModalContent className="identity-modal-content">
          <label className="identity-modal-field">
            <span className="identity-modal-label">你的名字是</span>
            <input
              autoFocus
              value={name}
              maxLength={20}
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && gender) {
                  event.preventDefault();
                  void confirm();
                }
              }}
              className="identity-modal-input"
              placeholder="输入你的名字"
            />
          </label>

          <fieldset className="identity-modal-gender">
            <legend className="identity-modal-label">选择性别</legend>
            <div className="identity-modal-gender-options">
              {([
                ['male', '男'],
                ['female', '女'],
              ] as const).map(([value, label]) => (
                <PixelModalAction
                  key={value}
                  active={gender === value}
                  aria-pressed={gender === value}
                  onClick={() => setGender(value)}
                  className="identity-modal-gender-button"
                >
                  {label}
                </PixelModalAction>
              ))}
            </div>
          </fieldset>
        </PixelModalContent>

        <PixelModalFooter className="identity-modal-footer">
          <PixelModalAction
            type="submit"
            disabled={saving}
            className="identity-modal-confirm"
          >
            {saving ? '记忆确认中……' : '确认身份'}
          </PixelModalAction>
        </PixelModalFooter>
      </form>
    </PixelModalShell>
  );
}
