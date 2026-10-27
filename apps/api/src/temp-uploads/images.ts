import { tileRects } from "@cheddar/contracts";
import sharp from "sharp";
import { MAX_IMAGE_BYTES } from "./manifest";

/** 사람이 올린 화면 이미지로 받는 형식 */
export const SOURCE_IMAGE_FORMATS = new Set(["png", "jpeg", "webp"]);
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
// 압축 폭탄을 막는다. 긴 화면설계서도 들어가는 크기다.
const MAX_PIXELS = 20000 * 20000;

/** 이미지 형식을 서명으로 읽는다. 받지 않는 형식이면 null */
export async function sourceImageFormat(bytes: Buffer) {
  try {
    const { format } = await sharp(bytes, {
      limitInputPixels: MAX_PIXELS,
    }).metadata();
    return format && SOURCE_IMAGE_FORMATS.has(format) ? format : null;
  } catch {
    return null;
  }
}

/**
 * 플러그인과 같이 PNG로 바꾸고, 긴 이미지는 겹치는 타일로 나눈다.
 * 한 장이 업로드 한도를 넘으면 글자가 읽히는 만큼 줄인다.
 */
export async function toTiles(bytes: Buffer): Promise<Buffer[]> {
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true });
  const tiles: Buffer[] = [];
  for (const rect of tileRects(info.height)) {
    let tile =
      rect.height === info.height
        ? data
        : await sharp(data)
            .extract({
              left: 0,
              top: rect.top,
              width: info.width,
              height: Math.min(rect.height, info.height - rect.top),
            })
            .png()
            .toBuffer();
    for (let width = info.width; tile.length > MAX_IMAGE_BYTES; ) {
      width = Math.floor(width / 2);
      if (width < 200) throw new Error("IMAGE_TOO_LARGE");
      tile = await sharp(tile).resize({ width }).png().toBuffer();
    }
    tiles.push(tile);
  }
  return tiles;
}
