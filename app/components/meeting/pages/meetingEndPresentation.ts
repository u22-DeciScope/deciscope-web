export function meetingEndPresentation(isEnding: boolean, isEndedModalVisible: boolean) {
  return {
    // finalization中はworkspaceを覆わず、live v15など最後のtree更新を確認可能にする。
    finalizingNotice:
      isEnding && !isEndedModalVisible
        ? "会議を終了しています。最後の文字起こしとAI分析を整理しています。"
        : null,
    showBlockingCompletionModal: isEndedModalVisible,
  };
}
