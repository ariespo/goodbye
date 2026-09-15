import { useMemo, useState } from 'react';
import {
  getConclusionChoices, getConclusionFinalReadiness, getConclusionOverlays,
  getConclusionRoutes, isConclusionOverlayId, isConclusionRouteId,
  type ConclusionChoiceId, type ConclusionRouteId,
} from '../../engine/conclusion-system';
import { useGameStore } from '../../stores/gameStore';
import { commitProgramConclusion, lockProgramConclusion, selectProgramConclusionOverlay } from '../../utils/conclusionFlow';
import { ConfirmModal } from '../system/ConfirmModal';
import { GameIcon } from '../ui/GameIcon';
import { PixelModalAction, PixelModalContent, PixelModalFooter, PixelModalHeader, PixelModalShell } from '../ui/PixelModal';

type PendingDecision = (
  | { kind: 'route'; id: ConclusionRouteId; title: string }
  | { kind: 'choice'; id: ConclusionChoiceId; title: string }
) & { context: string };

export function ConclusionModal() {
  const visible = useGameStore(state => state.ui.showConclusion);
  return visible ? <ConclusionDialog /> : null;
}

function ConclusionDialog() {
  const variables = useGameStore(state => state.tavern.variables);
  const activeChatId = useGameStore(state => state.tavern.activeChatId);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const { setShowConclusion, addNotification } = useGameStore(state => state.actions);
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [busy, setBusy] = useState(false);

  const routes = useMemo(() => getConclusionRoutes(variables), [variables]);
  const finalReadiness = useMemo(() => getConclusionFinalReadiness(variables), [variables]);
  const lockedRoute = isConclusionRouteId(variables.lockedRoute) ? variables.lockedRoute : null;
  const selectedOverlay = isConclusionOverlayId(variables.overlay) ? variables.overlay : null;
  const activeRoute = routes.find(route => route.id === lockedRoute) ?? null;
  // Facts are committed before playback. Wait until the player has read the
  // scene before disclosing any new decision cards.
  const canConclude = sceneComplete && !isWaitingForAI && !variables.finalChoice;
  const availableRoutes = canConclude && !lockedRoute ? routes.filter(route => route.available) : [];
  const overlays = canConclude ? getConclusionOverlays(variables).filter(option => option.available && !option.hidden) : [];
  const choices = canConclude && finalReadiness.met ? getConclusionChoices(variables) : [];
  // A loaded save or a new turn can invalidate an open confirmation.
  const decisionContext = JSON.stringify([activeChatId, lockedRoute, selectedOverlay]);
  const currentPending = pending && pending.context === decisionContext && (pending.kind === 'route'
    ? availableRoutes.some(route => route.id === pending.id)
    : choices.some(choice => choice.id === pending.id && choice.title === pending.title)) ? pending : null;

  const close = () => {
    if (!busy && !currentPending) setShowConclusion(false);
  };
  const notifyFailure = (reason?: string) => {
    addNotification({ type: 'warning', message: reason || '这项结论现在还不能成立。', duration: 3200 });
  };
  const confirmDecision = async () => {
    if (!currentPending || busy) return;
    setBusy(true);
    try {
      const decision = currentPending.kind === 'route'
        ? await lockProgramConclusion(currentPending.id)
        : await commitProgramConclusion(currentPending.id);
      if (!decision.accepted) notifyFailure(decision.reason);
      else if (currentPending.kind === 'route') {
        addNotification({ type: 'success', message: '路线已锁定：' + currentPending.title, duration: 2800 });
      }
      setPending(null);
    } catch (error) {
      addNotification({
        type: 'error',
        message: error instanceof Error ? '结论保存失败：' + error.message : '结论保存失败，请稍后重试。',
        duration: 4200,
      });
    } finally {
      setBusy(false);
    }
  };
  const selectOverlay = async (overlay: 'CULT' | 'PSYCH' | null) => {
    if (busy || !canConclude || overlay === selectedOverlay) return;
    setBusy(true);
    try {
      const decision = await selectProgramConclusionOverlay(overlay);
      if (!decision.accepted) notifyFailure(decision.reason);
    } catch (error) {
      addNotification({
        type: 'error',
        message: error instanceof Error ? '解释保存失败：' + error.message : '解释保存失败，请稍后重试。',
        duration: 4200,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PixelModalShell open onClose={close} closeBlocked={busy || !!currentPending}
        labelledBy="conclusion-title" className="conclusion-shell">
        <PixelModalHeader titleId="conclusion-title" title="路线指认"
          meta={lockedRoute ? '本轮指认已记录' : '整理证据，作出你的判断'}
          iconSrc="clue" onClose={close} closeLabel="关闭路线指认" />
        <PixelModalContent className="conclusion-content pixel-scroll-blue">
          {!lockedRoute ? (
            availableRoutes.length > 0 ? (
              <>
                <div className="conclusion-section-heading">
                  <h3>可以作出的指认</h3>
                  <p>现有证据已能支持以下判断。确认后，本轮将沿这份指认继续调查。</p>
                </div>
                <div className="conclusion-route-grid">
                  {availableRoutes.map(route => (
                    <button key={route.id} type="button" className="conclusion-card conclusion-route-card"
                      disabled={busy || !!currentPending}
                      onClick={() => setPending({ kind: 'route', id: route.id, title: route.title, context: decisionContext })}
                      aria-label={route.title + '，证据已满足，可以指认'}>
                      <span className="conclusion-card__eyebrow"><GameIcon name="success" size={16} />证据已齐备</span>
                      <h4>{route.title}</h4>
                      <p>{route.thesis}</p>
                      <span className="conclusion-card__action">作出指认<GameIcon name="play" size={16} /></span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="conclusion-empty" role="status">
                <GameIcon name="investigate" size={40} />
                <h3>{canConclude ? '尚无可作出的指认' : '这一幕尚未结束'}</h3>
                <p>{canConclude ? '目前的证据还不足以形成指认。继续调查，核对你已经发现的线索。' : '读完当前剧情后，再整理证据、作出判断。'}</p>
              </div>
            )
          ) : (
            <div className="conclusion-decision-stage">
              <aside className="conclusion-locked-route">
                <span className="conclusion-card__eyebrow"><GameIcon name="success" size={16} />已作出的指认</span>
                <h3>{activeRoute?.title}</h3>
                <p>{activeRoute?.thesis}</p>
                <span className="conclusion-locked-note">本轮不可更改</span>
              </aside>
              <div className="conclusion-decision-main">
                {overlays.length > 0 && (
                  <section className="conclusion-layer-section">
                    <div className="conclusion-section-heading"><h3>对证据的解释</h3></div>
                    <div className="conclusion-layer-options">
                      {overlays.map(option => (
                        <button key={option.id ?? 'base'} type="button"
                          className="conclusion-card conclusion-layer-card"
                          aria-pressed={option.id === selectedOverlay} disabled={busy || !!currentPending}
                          onClick={() => { void selectOverlay(option.id); }}>
                          <span className="conclusion-layer-check" aria-hidden="true">
                            {option.id === selectedOverlay && <GameIcon name="success" size={14} />}
                          </span>
                          <span><strong>{option.title}</strong><small>{option.description}</small></span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {choices.length > 0 ? (
                  <section>
                    <div className="conclusion-section-heading">
                      <h3>接下来，你决定</h3>
                      <p>事实已经确认。选择你要采取的行动。</p>
                    </div>
                    <div className="conclusion-choice-grid">
                      {choices.map(choice => (
                        <button key={choice.id} type="button" className="conclusion-card conclusion-choice-card"
                          disabled={busy || !!currentPending}
                          onClick={() => setPending({ kind: 'choice', id: choice.id, title: choice.title, context: decisionContext })}>
                          <h4>{choice.title}</h4>
                          <p>{choice.description}</p>
                          <span className="conclusion-card__action">作出选择<GameIcon name="play" size={16} /></span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : (
                  <div className="conclusion-blocked-note" role="status">
                    <GameIcon name="investigate" size={20} />
                    <p>{variables.finalChoice ? '你的决定已记录。' : !canConclude ? '读完当前剧情后，再作出判断。' : '指认已记录。继续核实相关线索，确认事情的完整经过。'}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </PixelModalContent>
        <PixelModalFooter className="conclusion-footer">
          <span>只有证据充分的判断才会出现在这里。</span>
          <PixelModalAction onClick={close} disabled={busy || !!currentPending}>返回调查</PixelModalAction>
        </PixelModalFooter>
      </PixelModalShell>
      <ConfirmModal isOpen={!!currentPending}
        title={currentPending?.kind === 'route' ? '锁定路线指认' : '作出最终选择'}
        message={currentPending?.kind === 'route'
          ? '确定将“' + currentPending.title + '”作为本轮最终指认吗？锁定后不能改换其他路线。'
          : '确定选择“' + (currentPending?.title ?? '') + '”吗？确认后将立即进入对应结局。'}
        onCancel={() => !busy && setPending(null)} onConfirm={() => { void confirmDecision(); }} />
    </>
  );
}
