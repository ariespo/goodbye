export function shouldShowChoiceMenu({
  endingVisible,
  isStreaming,
  sceneComplete,
  hasOptions,
}: {
  endingVisible: boolean;
  isStreaming: boolean;
  sceneComplete: boolean;
  hasOptions: boolean;
}) {
  return !endingVisible && !isStreaming && sceneComplete && hasOptions;
}
