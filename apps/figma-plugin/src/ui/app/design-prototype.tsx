import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./design-prototype.css";

const frames = [
  ["browse", "상품 탐색", "SHOP-01"],
  ["product", "상품 상세", "SHOP-02"],
  ["cart", "장바구니", "CART-01"],
  ["checkout", "주문·결제", "ORDER-01"],
  ["complete", "주문 완료", "ORDER-02"],
];
function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d={back ? "M20 12H4m6-6-6 6 6 6" : "M4 12h16m-6-6 6 6-6 6"} />
    </svg>
  );
}
function Preview({ id }: { id: string }) {
  return (
    <div className={`mock-screen screen-${id}`} aria-hidden="true">
      <div className="mock-top">
        <span>9:41</span>
        <span>● ▰</span>
      </div>
      <div className="mock-heading">{frames.find((f) => f[0] === id)?.[1]}</div>
      {id === "product" || id === "browse" ? (
        <>
          <div className="mock-product">
            <span />
          </div>
          <strong>캔버스 토트백</strong>
          <p>32,000원</p>
          <div className="mock-field">색상 선택</div>
        </>
      ) : id === "complete" ? (
        <>
          <div className="mock-check">✓</div>
          <strong>주문이 완료되었습니다</strong>
          <p>주문번호 20261015-1024</p>
          <div className="mock-field">캔버스 토트백 외 1개</div>
        </>
      ) : (
        <>
          <div className="mock-field">
            {id === "cart" ? "캔버스 토트백" : "배송지"}
          </div>
          <div className="mock-field">
            {id === "cart" ? "파우치" : "결제 수단"}
          </div>
          <div className="mock-field">50,000원</div>
        </>
      )}
      <div className="mock-button">
        {id === "product"
          ? "장바구니에 담기"
          : id === "checkout"
            ? "결제하기"
            : id === "complete"
              ? "주문 내역 보기"
              : "선택"}
      </div>
    </div>
  );
}
function App() {
  const [selected, setSelected] = useState<string[]>([
    "product",
    "cart",
    "checkout",
    "complete",
  ]);
  const [preview, setPreview] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 450);
    return () => {
      clearTimeout(t);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const openPreview = (id: string) => {
    previous.current = document.activeElement as HTMLElement;
    setPreview(id);
  };
  const back = () => {
    setPreview(null);
    setSettings(false);
    requestAnimationFrame(() => previous.current?.focus());
  };
  const send = () => {
    setSending(true);
    timer.current = setTimeout(() => {
      setSending(false);
      setSent(true);
      const url = `http://127.0.0.1:5178/design-prototype.html?from=figma&frames=${selected.join(",")}`;
      if (window.parent === window) {
        window.location.assign(url);
      } else {
        window.parent.postMessage(
          {
            pluginMessage: { type: "prototype-open-web", frames: selected },
            pluginId: "1692417282897261384",
          },
          "*",
        );
      }
    }, 800);
  };
  return (
    <div className="plugin-shell">
      <header>
        {preview || settings ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="이전 화면"
            onClick={back}
          >
            <Arrow back />
          </button>
        ) : (
          <span className="file-mark">▦</span>
        )}
        <h1>
          {preview
            ? frames.find((f) => f[0] === preview)?.[1]
            : settings
              ? "선택 범위"
              : "화면 선택"}
        </h1>
        {!preview && !settings && (
          <button
            type="button"
            className="icon-btn"
            aria-label="선택 설정"
            onClick={() => {
              previous.current = document.activeElement as HTMLElement;
              setSettings(true);
            }}
          >
            ⋯
          </button>
        )}
      </header>
      {settings ? (
        <main className="plugin-settings">
          <button
            type="button"
            onClick={() => {
              setSelected(frames.map((f) => f[0]));
              back();
            }}
          >
            Section 전체 선택
            <Arrow />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected([]);
              back();
            }}
          >
            선택 해제
            <Arrow />
          </button>
        </main>
      ) : preview ? (
        <main className="plugin-preview">
          <Preview id={preview} />
        </main>
      ) : (
        <>
          <main>
            <div className="file-name">
              <strong>커머스 웹</strong>
              <span>{frames.length}개 화면</span>
            </div>
            {loading ? (
              <div
                className="plugin-skeleton"
                role="status"
                aria-label="화면 불러오는 중"
              >
                {[1, 2, 3, 4].map((n) => (
                  <i key={n} />
                ))}
              </div>
            ) : (
              <div className="frame-list">
                {frames.map(([id, name, code]) => (
                  <div
                    className={`frame-row ${selected.includes(id) ? "selected" : ""}`}
                    key={id}
                  >
                    <button
                      type="button"
                      className="thumbnail"
                      aria-label={`${name} 미리보기`}
                      onClick={() => openPreview(id)}
                    >
                      <Preview id={id} />
                    </button>
                    <label>
                      <span>{name}</span>
                      <small>{code}</small>
                      <input
                        type="checkbox"
                        aria-label={`${name} 포함`}
                        checked={selected.includes(id)}
                        onChange={() => {
                          setSelected((s) =>
                            s.includes(id)
                              ? s.filter((x) => x !== id)
                              : [...s, id],
                          );
                          setSent(false);
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </main>
          <footer>
            <span className="selection-count">{selected.length}개 선택</span>
            {!selected.length && <p>가져올 화면을 선택해 주세요.</p>}
            {sent && <p role="status">웹에서 선택한 화면을 확인해 주세요.</p>}
            <button
              type="button"
              className="continue"
              disabled={!selected.length || sending || loading}
              onClick={send}
            >
              {sending ? (
                <>
                  <span className="spinner" />
                  화면 준비 중
                </>
              ) : (
                <>
                  웹에서 계속
                  <Arrow />
                </>
              )}
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
