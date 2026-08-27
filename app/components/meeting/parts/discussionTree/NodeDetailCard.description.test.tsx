import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

import { NodeDetailCard } from "./NodeDetailCard";

const momentIndex = { byId: new Map(), bySequence: new Map() };

function renderCard(node: TreeNodePayload) {
  return render(
    <NodeDetailCard
      node={node}
      nodes={[node]}
      edges={[]}
      analysisItems={[]}
      momentIndex={momentIndex}
      agendaLabels={new Map()}
      onClose={vi.fn()}
      onFocusNode={vi.fn()}
    />,
  );
}

describe("NodeDetailCard description", () => {
  it("空descriptionでは説明領域や代替文言を表示しない", () => {
    const { container } = renderCard({ id: "fact-1", kind: "fact", label: "ルーターに異常なし" });

    expect(screen.getByText("ルーターに異常なし")).toBeTruthy();
    expect(screen.queryByText("説明なし")).toBeNull();
    expect(container.querySelectorAll(".space-y-3 > p")).toHaveLength(1);
  });

  it("grounded descriptionがある場合だけ説明領域を表示する", () => {
    const { container } = renderCard({
      id: "risk-1",
      kind: "risk",
      label: "VPN証明書失効による接続不能リスク",
      description: "VPN証明書は来月末に期限切れとなる。",
    });

    expect(screen.getByText("VPN証明書は来月末に期限切れとなる。")).toBeTruthy();
    expect(container.querySelectorAll(".space-y-3 > p")).toHaveLength(2);
  });
});
