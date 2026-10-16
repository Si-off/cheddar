import type { Frame } from "./model";

const paths = {
  grid: "M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z",
  folder: "M3 6h7l2 3h9v11H3Z M3 6V4h7l2 2h9v3",
  table: "M3 4h18v16H3Z M3 9h18 M8 9v11",
  qa: "M8 3h8v4H8Z M7 5H4v16h16V5h-3 M8 12l2 2 5-5 M8 18h7",
  plus: "M12 5v14 M5 12h14",
  back: "m10 5-7 7 7 7 M3 12h18",
  arrow: "M3 12h18 m-7-7 7 7-7 7",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  up: "m6 15 6-6 6 6",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12 M6 18 18 6",
  search: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z m5-2 6 6",
  settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  image: "M3 3h18v18H3Z m0 13 6-6 5 5 3-3 4 4 M15 7h.01",
  flow: "M3 9h5v6H3Z M16 9h5v6h-5Z M8 12h8 M11 4h5v4h-5Z M13 8v4",
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  share: "M12 16V3 m-5 5 5-5 5 5 M5 12v9h14v-9",
  edit: "m4 16-1 5 5-1L21 7l-4-4Z M14 6l4 4",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  undo: "m7 4-4 4 4 4 M3 8h11a6 6 0 0 1 0 12H9",
  alert: "m12 3 10 18H2Z M12 9v5 M12 17h.01",
  file: "M5 3h9l5 5v13H5Z M14 3v6h5 M8 13h8 M8 17h5",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  expand: "M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6",
  minus: "M5 12h14",
  link: "m9 15 6-6 M7 17l-1 1a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0 M17 7l1-1a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-5 0",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Phone({ frame }: { frame: Frame; mini?: boolean }) {
  return (
    <div className={`phone phone-${frame.kind}`} aria-hidden="true">
      <div className="phone-status">
        <span>9:41</span>
        <span>● ▰</span>
      </div>
      <div className="phone-title">
        <Icon name="back" />
        <b>{frame.name}</b>
        <Icon name="more" />
      </div>
      {frame.kind === "browse" && (
        <>
          <div className="phone-search">상품 검색</div>
          <div className="phone-products">
            {["토트백", "파우치", "숄더백", "크로스백"].map((name, i) => (
              <div key={name}>
                <div className={`product-shape shape-${i % 2}`}>
                  <span />
                </div>
                <b>{name}</b>
                <p>{i % 2 ? "18,000" : "32,000"}원</p>
              </div>
            ))}
          </div>
        </>
      )}
      {frame.kind === "product" && (
        <>
          <div className="product-shape large">
            <span />
          </div>
          <div className="phone-content">
            <small>가방</small>
            <h3>캔버스 토트백</h3>
            <b>32,000원</b>
            <hr />
            <p>색상</p>
            <div className="swatches">
              <i />
              <i />
              <i />
            </div>
            <div className="phone-field">사이즈 선택　⌄</div>
            <div className="phone-field">수량　−　1　＋</div>
          </div>
        </>
      )}
      {frame.kind === "cart" && (
        <div className="phone-content">
          <small>✓ 전체 선택 (2)</small>
          {["토트백", "파우치"].map((name, i) => (
            <div className="phone-cart" key={name}>
              <div className={`product-shape shape-${i}`}>
                <span />
              </div>
              <div>
                <b>{name}</b>
                <p>기본 / 1개</p>
                <b>{i ? "18,000" : "32,000"}원</b>
              </div>
            </div>
          ))}
          <hr />
          <div className="phone-total">
            <span>상품 금액</span>
            <b>50,000원</b>
          </div>
          <div className="phone-total">
            <span>배송비</span>
            <b>무료</b>
          </div>
        </div>
      )}
      {frame.kind === "checkout" && (
        <div className="phone-content">
          <h3>배송지</h3>
          {["수령인", "연락처", "주소"].map((x) => (
            <div className="phone-field" key={x}>
              {x}
            </div>
          ))}
          <h3>결제 수단</h3>
          <div className="phone-field selected">◉ 신용·체크카드</div>
          <div className="phone-field">○ 간편결제</div>
          <hr />
          <div className="phone-total">
            <b>총 결제 금액</b>
            <b>50,000원</b>
          </div>
        </div>
      )}
      {frame.kind === "complete" && (
        <div className="phone-complete">
          <span>
            <Icon name="check" />
          </span>
          <h3>주문이 완료되었습니다</h3>
          <p>주문번호 20261015-1024</p>
          <div className="product-shape">
            <span />
          </div>
          <b>캔버스 토트백 외 1개</b>
          <p>50,000원</p>
        </div>
      )}
      <div className="phone-bottom">
        {
          {
            browse: "상품 더 보기",
            product: "장바구니에 담기",
            cart: "선택 상품 주문",
            checkout: "결제하기",
            complete: "주문 내역 보기",
          }[frame.kind]
        }
      </div>
    </div>
  );
}
