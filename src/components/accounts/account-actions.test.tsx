import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SavingsBoxActions } from "./account-actions";

vi.mock("@/server/actions/planning", () => ({
  updateAccountAction: vi.fn(),
  archiveAccountAction: vi.fn(),
  adjustBalanceAction: vi.fn(),
}));

describe("SavingsBoxActions", () => {
  it("offers Guardar and Resgatar as buttons", () => {
    const html = renderToStaticMarkup(
      <SavingsBoxActions boxId="k1" spendableId="a1" />,
    );
    expect(html).toContain("Guardar");
    expect(html).toContain("Resgatar");
    expect(html.match(/<button/g)).toHaveLength(2);
  });
});
