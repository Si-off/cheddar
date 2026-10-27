import { buildScreenDocument, type SourceNode } from "@cheddar/contracts";
import type { FrameSource } from "../../../protocol/messages";

export {
  buildScreenDocument,
  type ScreenDocument,
  type ScreenNode,
  type SourceNode,
} from "@cheddar/contracts";

/** main이 보낸 원본으로 화면 문서를 만든다. 크기 때문에 내용을 생략하지 않는다. */
export function readFrameSource(source: FrameSource) {
  return {
    document: buildScreenDocument(
      JSON.parse(source.document) as SourceNode,
      source,
    ),
  };
}
