export function isCompactViewport({ width, height }: { width: number; height: number }): boolean {
  return width <= 400 || height < 700;
}
