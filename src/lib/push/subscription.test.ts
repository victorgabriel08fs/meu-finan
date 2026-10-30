import { describe, expect, it } from "vitest";
import {
  badgeNumber,
  isAppPath,
  isPushServiceEndpoint,
  pushSubscriptionSchema,
} from "./subscription";

const KEYS = {
  p256dh:
    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};

describe("isPushServiceEndpoint", () => {
  it("accepts the browsers' push services", () => {
    for (const endpoint of [
      "https://web.push.apple.com/QGuQyavXutnMH_4tVpEOy7Y2Ytr_KqUuXcQZ4Lhn",
      "https://fcm.googleapis.com/fcm/send/eW3x:APA91b",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
      "https://wns2-by3p.notify.windows.com/w/?token=BQYAAA",
      "https://WEB.PUSH.APPLE.COM:443/abc",
    ]) {
      expect(isPushServiceEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it("refuses anything the server should not call", () => {
    for (const endpoint of [
      "http://web.push.apple.com/abc",
      "https://push.apple.com.evil.example/abc",
      "https://evilpush.apple.com.example/abc",
      "https://notpushapple.com/abc",
      "https://localhost/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://user:pass@web.push.apple.com/abc",
      "https://web.push.apple.com:8443/abc",
      "/relative",
      "not a url",
    ]) {
      expect(isPushServiceEndpoint(endpoint), endpoint).toBe(false);
    }
  });
});

describe("pushSubscriptionSchema", () => {
  it("parses what PushSubscription.toJSON() returns", () => {
    const parsed = pushSubscriptionSchema.parse({
      endpoint: "https://web.push.apple.com/abc",
      expirationTime: null,
      keys: KEYS,
    });
    expect(parsed.keys).toEqual(KEYS);
  });

  it("refuses an endpoint outside the push services or malformed keys", () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: "https://example.com/hook",
        keys: KEYS,
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: "https://web.push.apple.com/abc",
        keys: { ...KEYS, auth: "not base64!" },
      }).success,
    ).toBe(false);
  });
});

describe("isAppPath", () => {
  it("allows paths of this app only", () => {
    expect(isAppPath("/inicio")).toBe(true);
    expect(isAppPath("/ajustes/notificacoes?teste=1")).toBe(true);
    expect(isAppPath("//evil.example")).toBe(false);
    expect(isAppPath("/\\evil.example")).toBe(false);
    expect(isAppPath("https://evil.example")).toBe(false);
    expect(isAppPath("inicio")).toBe(false);
  });
});

describe("badgeNumber", () => {
  it("is a whole number from 0 to 99", () => {
    expect(badgeNumber(0)).toBe(0);
    expect(badgeNumber(-3)).toBe(0);
    expect(badgeNumber(Number.NaN)).toBe(0);
    expect(badgeNumber(2.7)).toBe(2);
    expect(badgeNumber(7)).toBe(7);
    expect(badgeNumber(250)).toBe(99);
  });
});
