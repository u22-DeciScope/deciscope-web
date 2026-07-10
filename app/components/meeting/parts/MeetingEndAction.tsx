import { useState } from "react";

import { DsButton } from "~/components/DsButton";
import { ConfirmDialog } from "~/components/shared/modal/ConfirmDialog";

type MeetingEndActionProps = {
  disabled: boolean;
  isEnding: boolean;
  onConfirm: () => void | Promise<void>;
};

export function MeetingEndAction({ disabled, isEnding, onConfirm }: MeetingEndActionProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DsButton
        disabled={disabled || isEnding}
        variant="secondary"
        onClick={() => setConfirming(true)}
      >
        {isEnding ? "終了中" : "終了"}
      </DsButton>
      {confirming && (
        <ConfirmDialog
          title="会議を終了しますか？"
          confirmLabel="会議を終了"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            return onConfirm();
          }}
          description={
            <p>会議を終了するとBotが退出し、文字起こしを停止します。この操作を続けますか？</p>
          }
        />
      )}
    </>
  );
}
