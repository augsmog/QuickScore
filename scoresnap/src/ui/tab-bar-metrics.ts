export const tabBarHeight = (bottomInset: number) => 68 + Math.max(bottomInset - 8, 0);

/** How many fixed-height stacked rows fit entirely above the reserved bottom
 * chrome, given the viewport height and the list's own measured top. A row
 * that would be cut mid-height is unreachable and must not render at all;
 * `listTop === null` (not yet measured) always yields the safe minimum. */
export const maxFullRowsAboveBottomChrome = (
  listTop: number | null,
  windowHeight: number,
  bottomReserve: number,
  rowHeight: number,
  rowGap: number
) => {
  if (listTop === null) return 1;
  const available = windowHeight - bottomReserve - listTop;
  return Math.max(1, Math.floor((available + rowGap) / (rowHeight + rowGap)));
};
