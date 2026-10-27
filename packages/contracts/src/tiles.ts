// 큰 보드는 AI가 글자를 읽을 수 있게 겹치는 타일로 나눈다. 플러그인과 서버가 같은 크기로 나눈다.
export const TILE_HEIGHT = 1600;
export const TILE_OVERLAP = 200;
// 이 높이까지는 나누지 않고 한 장으로 보낸다
export const SINGLE_MAX_HEIGHT = 2000;

export type TileRect = { top: number; height: number };

export function tileRects(height: number): TileRect[] {
  if (height <= SINGLE_MAX_HEIGHT) return [{ top: 0, height }];
  const rects: TileRect[] = [];
  const step = TILE_HEIGHT - TILE_OVERLAP;
  for (let top = 0; ; top += step) {
    if (top + TILE_HEIGHT >= height) {
      // 마지막 타일은 끝에 맞춰 짧은 조각이 생기지 않게 한다
      rects.push({
        top: Math.max(0, height - TILE_HEIGHT),
        height: TILE_HEIGHT,
      });
      break;
    }
    rects.push({ top, height: TILE_HEIGHT });
  }
  return rects;
}
