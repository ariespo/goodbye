import { useEffect, useMemo, useState } from 'react';
import {
  getConclusionChoices,
  getConclusionOverlays,
  getConclusionRoutes,
  isConclusionOverlayId,
  isConclusionRouteId,
  type ConclusionChoiceId,
  type ConclusionRouteId,
} from '../../engine/conclusion-system';
import { useGameStore } from '../../stores/gameStore';
import {
  commitProgramConclusion,
  lockProgramConclusion,
  selectProgramConclusionOverlay,
} from '../../utils/conclusionFlow';
import { ConfirmModal } from '../system/ConfirmModal';
import { GameIcon } from '../ui/GameIcon';

type PendingDecision =
  | { kind: 'route'; id: ConclusionRouteId; title: string }
  | { kind: 'choice'; id: ConclusionChoiceId; title: string }
  | null;

export function ConclusionModal() {
  const visible = useGameStore(state => state.ui.showConclusion);
  const variables = useGameStore(state => state.tavern.variables);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const { setShowConclusion, addNotification } = useGameStore(state => state.actions);
  const [pending, setPending] = useState<PendingDecision>(null);
  const [busy, setBusy] = useState(false);

  const routes = useMemo(() => getConclusionRoutes(variables), [variables]);
  const overlays = useMemo(() => getConclusionOverlays(variables), [variables]);
  const choices = useMemo(() => getConclusionChoices(variables), [variables]);
  const lockedRoute = isConclusionRouteId(variables.lockedRoute) ? variables.lockedRoute : null;
  const selectedOverlay = isConclusionOverlayId(variables.overlay) ? variables.overlay : null;
  const activeRoute = routes.find(route => route.id === lockedRoute) ?? null;
  const readyCount = routes.filter(route => route.available).length;
  const canConclude = sceneComplete && !isWaitingForAI;
  const explanationSettled = !!lockedRoute
    && (overlays.length === 0 || overlays.some(option => option.id === selectedOverlay));

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        setPending(null);
        setShowConclusion(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, busy, setShowConclusion]);

  if (!visible) return null;

  const close = () => {
    if (busy) return;
    setPending(null);
    setShowConclusion(false);
  };

  const notifyFailure = (reason?: string) => {
    addNotification({
      type: 'warning',
      message: reason || '这项结论现在还不能成立。',
      duration: 3200,
    });
  };

  const confirmDecision = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const decision = pending.kind === 'route'
        ? await lockProgramConclusion(pending.id)
        : await commitProgramConclusion(pending.id);
      if (!decision.accepted) notifyFailure(decision.reason);
      else if (pending.kind === 'route') {
        addNotification({ type: 'success', message: `路线已锁定：${pending.title}`, duration: 2800 });
      }
      setPending(null);
    } catch (error) {
      addNotification({
        type: 'error',
        message: error instanceof Error ? `结论保存失败：${error.message}` : '结论保存失败，请稍后重试。',
        duration: 4200,
      });
    } finally {
      setBusy(false);
    }
  };

  const selectOverlay = async (overlay: 'CULT' | 'PSYCH' | null) => {
    if (busy || overlay === selectedOverlay) return;
    setBusy(true);
    try {
      const decision = await selectProgramConclusionOverlay(overlay);
      if (!decision.accepted) notifyFailure(decision.reason);
    } catch (error) {
      addNotification({
        type: 'error',
        message: error instanceof Error ? `解释保存失败：${error.message}` : '解释保存失败，请稍后重试。',
        duration: 4200,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="conclusion-shell fixed inset-0 z-[250] flex items-center justify-center px-4 py-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conclusion-title"
      onClick={close}
    >
      <section className="conclusion-panel" onClick={event => event.stopPropagation()}>
        <div className="conclusion-panel__grain" aria-hidden="true" />
        <header className="conclusion-header">
          <div className="conclusion-header__seal" aria-hidden="true">
            <span>结</span>
          </div>
          <div className="min-w-0 flex-1">
            <p>CASE FILE / FINAL INFERENCE</p>
            <h2 id="conclusion-title">路线指认</h2>
            <span>证据不会替你选择，但选择必须由证据支撑。</span>
          </div>
          <div className="conclusion-header__status" data-locked={lockedRoute ? 'true' : 'false'}>
            <small>{lockedRoute ? 'ROUTE SEALED' : 'ROUTES READY'}</small>
            <strong>{lockedRoute ? activeRoute?.index : `${readyCount} / ${routes.length}`}</strong>
          </div>
          <button className="conclusion-close" type="button" onClick={close} aria-label="关闭路线指认">
            <GameIcon name="close" size={16} />
          </button>
        </header>

        <div className="conclusion-progress" aria-label="结论流程进度">
          <ProgressStep index="01" label="路线指认" active={!lockedRoute} complete={!!lockedRoute} />
          <span className={lockedRoute ? 'is-complete' : ''} />
          <ProgressStep index="02" label="解释定调" active={!!lockedRoute && choices.length > 0} complete={explanationSettled} />
          <span className={explanationSettled ? 'is-complete' : ''} />
          <ProgressStep index="03" label="最终选择" active={!!lockedRoute} complete={!!variables.finalChoice} />
        </div>

        <div className="conclusion-scroll">
          {!lockedRoute ? (
            <div className="conclusion-route-stage">
              <div className="conclusion-section-heading">
                <div><span>01</span><h3>选择你愿意承担的结论</h3></div>
                <p>门槛未满足的路线仍会保留在档案中，提示你还缺少哪一块证据。</p>
              </div>
              <div className="conclusion-route-grid">
                {routes.map(route => (
                  <button
                    key={route.id}
                    type="button"
                    className={`conclusion-route-card tone-${route.accent}`}
                    data-ready={route.available ? 'true' : 'false'}
                    disabled={!route.available || busy || !canConclude}
                    onClick={() => setPending({ kind: 'route', id: route.id, title: route.title })}
                    aria-label={`${route.title}，${route.available ? '证据已满足，可以指认' : '证据未满足'}`}
                  >
                    <div className="conclusion-route-card__top">
                      <span className="conclusion-route-card__index">HYPOTHESIS {route.index}</span>
                      <span className="conclusion-route-card__state">
                        {route.available ? 'READY' : `${Math.round(route.progress * 100)}%`}
                      </span>
                    </div>
                    <h4>{route.title}</h4>
                    <p>{route.thesis}</p>
                    <div className="conclusion-route-card__meter">
                      <i style={{ width: `${Math.round(route.progress * 100)}%` }} />
                    </div>
                    <div className="conclusion-route-card__criteria">
                      {route.criteria.map(criterion => (
                        <span key={criterion.id} data-met={criterion.met ? 'true' : 'false'}>
                          <GameIcon name={criterion.met ? 'success' : 'key'} size={12} />
                          <em>{criterion.label}</em>
                          <b>{criterion.valueLabel}</b>
                        </span>
                      ))}
                    </div>
                    <div className="conclusion-route-card__action">
                      {route.available ? '锁定此路线' : '继续调查'}
                      <span>›</span>
                    </div>
                  </button>
                ))}
              </div>
              {!canConclude && (
                <div className="conclusion-blocked-note">
                  <GameIcon name="warning" size={15} /> 当前演出尚未结束。看完这一幕，再作出指认。
                </div>
              )}
            </div>
          ) : (
            <div className="conclusion-decision-stage">
              <aside className={`conclusion-locked-route tone-${activeRoute?.accent ?? 'blue'}`}>
                <span className="conclusion-locked-route__stamp">ROUTE SEALED</span>
                <small>你已经指认</small>
                <strong>{activeRoute?.title}</strong>
                <p>{activeRoute?.thesis}</p>
                <div className="conclusion-locked-route__facts">
                  {activeRoute?.criteria.map(item => (
                    <span key={item.id}><GameIcon name="success" size={12} />{item.label}</span>
                  ))}
                </div>
                <footer>本轮不可更改</footer>
              </aside>

              <div className="conclusion-decision-main">
                {overlays.length > 0 && (
                  <section className="conclusion-layer-section">
                    <div className="conclusion-section-heading compact">
                      <div><span>02</span><h3>这份证据意味着什么</h3></div>
                      <p>{overlays.length > 1 ? '检测到一层更深的解释。你可以决定以哪种方式理解同一组证据。' : '目前只有一种能够被证据支撑的解释。'}</p>
                    </div>
                    <div className="conclusion-layer-options">
                      {overlays.map(option => {
                        const selected = option.id === selectedOverlay;
                        return (
                          <button
                            key={option.id ?? 'base'}
                            type="button"
                            className="conclusion-layer-card"
                            data-selected={selected ? 'true' : 'false'}
                            data-deep={option.id ? 'true' : 'false'}
                            disabled={busy}
                            onClick={() => selectOverlay(option.id)}
                          >
                            <span className="conclusion-layer-card__radio">{selected && <i />}</span>
                            <span><strong>{option.title}</strong><small>{option.description}</small></span>
                            {option.id && <em>DEEP INTERPRETATION</em>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                <section className="conclusion-choice-section">
                  <div className="conclusion-section-heading compact">
                    <div><span>03</span><h3>你要怎样结束这次调查</h3></div>
                    <p>选择会立即进入对应结局。它不是推测，而是你决定采取的行动。</p>
                  </div>
                  <div className="conclusion-choice-grid">
                    {choices.map((choice, index) => (
                      <button
                        key={choice.id}
                        type="button"
                        className={`conclusion-choice-card tone-${choice.tone}`}
                        disabled={busy || !canConclude}
                        onClick={() => setPending({ kind: 'choice', id: choice.id, title: choice.title })}
                      >
                        <span className="conclusion-choice-card__number">0{index + 1}</span>
                        <span className="conclusion-choice-card__copy">
                          <small>{choice.tone === 'resolve' ? 'FACE THE TRUTH' : 'CROSS THE LINE'}</small>
                          <strong>{choice.title}</strong>
                          <p>{choice.description}</p>
                        </span>
                        <GameIcon name={choice.tone === 'resolve' ? 'success' : 'warning'} size={20} />
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>

        <footer className="conclusion-footer">
          <span><GameIcon name="key" size={12} /> 路线锁定后，本轮只能沿这份解释抵达结局。</span>
          <button type="button" onClick={close}>暂不决定</button>
        </footer>
      </section>

      <ConfirmModal
        isOpen={!!pending}
        title={pending?.kind === 'route' ? '锁定路线指认' : '作出最终选择'}
        message={pending?.kind === 'route'
          ? `确定将“${pending.title}”作为本轮最终指认吗？锁定后不能改换其他路线。`
          : `确定选择“${pending?.title ?? ''}”吗？确认后将立即进入对应结局。`}
        onCancel={() => !busy && setPending(null)}
        onConfirm={() => { void confirmDecision(); }}
      />
    </div>
  );
}

function ProgressStep({ index, label, active, complete }: {
  index: string;
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div data-active={active ? 'true' : 'false'} data-complete={complete ? 'true' : 'false'}>
      <b>{complete ? <GameIcon name="success" size={12} /> : index}</b>
      <span>{label}</span>
    </div>
  );
}
