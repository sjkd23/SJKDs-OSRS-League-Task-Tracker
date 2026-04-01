/**
 * A single fragment of rich-text content extracted by the scraper from the
 * real wiki HTML table.
 *
 * Each ScraperTask `*Parts` field is an array of these, preserving the
 * structure of the original wiki cell: runs of plain text interspersed with
 * hyperlinks.
 *
 * Render with the `<RichText>` component so the logic stays in one place.
 */
export type RichPart =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string };
