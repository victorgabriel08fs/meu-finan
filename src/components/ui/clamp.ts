/**
 * Text in a list row (doc 02 §8): one line with an ellipsis, as the rows have
 * always been, until the text is so large that the container (the card or the
 * list) is narrower than 16rem (`--container-tight`), which at 100% no phone
 * is. Then the title takes up to two lines and the rest wraps whole, so
 * nothing is cut off. The container's width in rem is the proxy for the size
 * of the text: rem follows the system font size, pixels do not. The nearest
 * ancestor must be an `@container`.
 */
export const CLAMP_TITLE =
  "truncate @max-tight:line-clamp-2 @max-tight:wrap-anywhere @max-tight:whitespace-normal";
export const CLAMP_TEXT =
  "truncate @max-tight:wrap-anywhere @max-tight:whitespace-normal";
