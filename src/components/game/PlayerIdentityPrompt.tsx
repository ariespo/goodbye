import { useEffect, useState } from 'react';
import { saveSettings } from '../../sillytavern/database';
import { useGameStore } from '../../stores/gameStore';
import { persistActiveChat } from '../../utils/chatPersistence';

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
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/90 px-4">
      <div className="clean-modal-frame clean-modal-frame-blue w-full max-w-[520px] px-9 py-8 text-[#d8d4cc]">
        <div className="mb-7 text-center">
          <div className="font-serif-cn text-[25px] tracking-[0.18em]">你的名字是</div>
          <div className="mt-2 font-mono text-[11px] tracking-[0.22em] text-[#686b73]">REMEMBER WHO YOU ARE</div>
        </div>

        <label className="block">
          <span className="mb-2 block font-mono text-[12px] tracking-[0.15em] text-[#888a91]">姓名</span>
          <input
            autoFocus
            value={name}
            maxLength={20}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && gender) void confirm();
            }}
            className="h-12 w-full border-2 border-[#343944] bg-[#0f1115] px-4 text-center font-serif-cn text-[20px] tracking-[0.12em] text-[#eeeae2] outline-none focus:border-[#6b8fc4]"
            placeholder="输入你的名字"
          />
        </label>

        <div className="mt-6">
          <div className="mb-2 font-mono text-[12px] tracking-[0.15em] text-[#888a91]">性别</div>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['male', '男'],
              ['female', '女'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={gender === value}
                onClick={() => setGender(value)}
                className={`h-12 border-2 font-serif-cn text-[17px] tracking-[0.18em] transition-colors ${
                  gender === value
                    ? 'border-[#779cd0] bg-[#182335] text-[#f0ece4]'
                    : 'border-[#30333a] bg-[#111318] text-[#777982] hover:border-[#555b67]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => void confirm()}
          className="mt-8 h-12 w-full border-2 border-[#8ba4c8] bg-[#d8d4cc] font-serif-cn text-[18px] tracking-[0.16em] text-[#101216] disabled:opacity-50"
        >
          {saving ? '记忆确认中……' : '就是这个！'}
        </button>
      </div>
    </div>
  );
}
