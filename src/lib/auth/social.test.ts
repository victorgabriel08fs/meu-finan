import { describe, expect, it } from "vitest";
import { DEACTIVATED_MESSAGE } from "@/lib/admin/status";
import {
  GOOGLE_NOT_LINKED,
  isSocialProviderId,
  SIGN_IN_UNAVAILABLE,
  socialLinkErrorMessage,
  socialSignInErrorMessage,
} from "./social";

describe("socialSignInErrorMessage", () => {
  it("reads the same whether the e-mail has an account or not", () => {
    expect(socialSignInErrorMessage("signup_disabled")).toBe(GOOGLE_NOT_LINKED);
    expect(socialSignInErrorMessage("account_not_linked")).toBe(
      GOOGLE_NOT_LINKED,
    );
    expect(socialSignInErrorMessage("email_not_found")).toBe(GOOGLE_NOT_LINKED);
  });

  it("shows nothing when the person cancelled or there is no error", () => {
    expect(socialSignInErrorMessage("access_denied")).toBeNull();
    expect(socialSignInErrorMessage(undefined)).toBeNull();
  });

  it("says a deactivated account is deactivated, anything else unavailable", () => {
    expect(socialSignInErrorMessage("BANNED_USER")).toBe(DEACTIVATED_MESSAGE);
    expect(socialSignInErrorMessage("invalid_code")).toBe(SIGN_IN_UNAVAILABLE);
    expect(socialSignInErrorMessage("<script>")).toBe(SIGN_IN_UNAVAILABLE);
  });
});

describe("socialLinkErrorMessage", () => {
  it("names the account's e-mail when Google's differs", () => {
    expect(
      socialLinkErrorMessage("email_does_not_match", "ana@exemplo.com"),
    ).toContain("ana@exemplo.com");
  });

  it("maps the other refusals and ignores a cancel", () => {
    expect(
      socialLinkErrorMessage("account_already_linked_to_different_user", "x"),
    ).toMatch(/outra conta/);
    expect(socialLinkErrorMessage("unable_to_link_account", "x")).toMatch(
      /verificado/,
    );
    expect(socialLinkErrorMessage("access_denied", "x")).toBeNull();
    expect(socialLinkErrorMessage(undefined, "x")).toBeNull();
    expect(socialLinkErrorMessage("other", "x")).toMatch(/Tente de novo/);
  });
});

it("knows only Google", () => {
  expect(isSocialProviderId("google")).toBe(true);
  expect(isSocialProviderId("apple")).toBe(false);
  expect(isSocialProviderId("toString")).toBe(false);
});
