/**
 * Bottom-sheet snap heights. Kept in one place so the map can offset its
 * camera/controls by the same amount the sheet occupies.
 */
export function getSheetHeights(windowHeight, bottomInset, topInset = 0) {
  const collapsed = 112 + bottomInset;
  const medium = Math.max(
    collapsed + 180,
    Math.min(Math.round(windowHeight * 0.56), windowHeight - topInset - 24)
  );
  const expanded = Math.max(
    medium + 80,
    Math.min(Math.round(windowHeight * 0.92), windowHeight - topInset - 12)
  );

  return { collapsed, medium, expanded, snapPoints: [collapsed, medium, expanded] };
}

export function getMapBottomObstruction({ hasStop, isCollapsed, heights }) {
  if (!hasStop) return 0;
  return isCollapsed ? heights.collapsed : heights.medium;
}
