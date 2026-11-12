import { describe, expect, it } from "vitest";
import {
  groupNotifications,
  noticeTimeLabel,
  unreadBadgeLabel,
} from "./center";

const SP = "America/Sao_Paulo";
// Thursday 12/nov/2026, 10:00 in São Paulo.
const NOW = Date.UTC(2026, 10, 12, 13, 0);
const at = (iso: string) => ({ createdAt: iso });

describe("groupNotifications", () => {
  it("splits into today, the 6 days before and earlier, by local day", () => {
    const items = [
      at("2026-11-12T12:00:00Z"), // today 09:00
      at("2026-11-12T02:59:00Z"), // 11/nov 23:59 local: yesterday
      at("2026-11-06T15:00:00Z"), // 6 days ago
      at("2026-11-05T15:00:00Z"), // 7 days ago
    ];
    const groups = groupNotifications(items, NOW, SP);
    expect(groups.map((g) => [g.section, g.items.length])).toEqual([
      ["today", 1],
      ["week", 2],
      ["earlier", 1],
    ]);
  });

  it("follows the person's time zone at the day change", () => {
    const item = at("2026-11-12T09:00:00Z");
    const now = Date.UTC(2026, 10, 12, 11, 0);
    // São Paulo: 06:00 and 08:00 on the 12th. Auckland: 22:00 on the 12th
    // and already 00:00 on the 13th.
    expect(groupNotifications([item], now, SP)[0]?.section).toBe("today");
    expect(
      groupNotifications([item], now, "Pacific/Auckland")[0]?.section,
    ).toBe("week");
  });

  it("leaves empty sections out", () => {
    expect(groupNotifications([], NOW, SP)).toEqual([]);
  });
});

describe("noticeTimeLabel", () => {
  it("is the time today, then Ontem, há N dias and the short date", () => {
    expect(noticeTimeLabel("2026-11-12T09:12:00Z", NOW, SP)).toBe("06:12");
    expect(noticeTimeLabel("2026-11-11T15:00:00Z", NOW, SP)).toBe("Ontem");
    expect(noticeTimeLabel("2026-11-09T15:00:00Z", NOW, SP)).toBe("há 3 dias");
    expect(noticeTimeLabel("2026-10-14T15:00:00Z", NOW, SP)).toBe("14/out");
  });
});

describe("unreadBadgeLabel", () => {
  it("shows 1 to 9 and then 9+", () => {
    expect(unreadBadgeLabel(1)).toBe("1");
    expect(unreadBadgeLabel(9)).toBe("9");
    expect(unreadBadgeLabel(10)).toBe("9+");
    expect(unreadBadgeLabel(250)).toBe("9+");
  });
});
