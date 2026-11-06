import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Automatic accessibility check (axe-core) of the page as it is now: WCAG 2.0,
// 2.1 and 2.2, levels A and AA (doc 02 §11). It complements, never replaces,
// the checks by hand (keyboard, screen reader, zoom).

/** The WCAG rule sets axe runs. */
export const A11Y_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

type A11yOptions = {
  /**
   * Rules to skip, each with the reason in a comment where it is called: only
   * for an old violation outside the screen under test, listed in
   * docs/tarefas.md.
   */
  disableRules?: string[];
  /** CSS selectors to leave out of the check. */
  exclude?: string[];
};

/** Fails with the rule, its help and the elements of every violation found. */
export async function expectNoA11yViolations(
  page: Page,
  { disableRules = [], exclude = [] }: A11yOptions = {},
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([...A11Y_TAGS]);
  if (disableRules.length > 0) builder = builder.disableRules(disableRules);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const report = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "?"}): ${violation.help}\n${violation.nodes
        .map(
          (node) =>
            `  ${node.target.join(" ")}\n    ${(node.failureSummary ?? "").replaceAll("\n", "\n    ")}`,
        )
        .join("\n")}`,
  );
  expect(report, report.join("\n\n")).toEqual([]);
}
