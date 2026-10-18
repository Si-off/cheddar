/**
 * 아직 다시 만들지 않은 화면의 자리. 테스트 세트는 5단계, 프로젝트는 4단계에서 실제 화면으로 바뀐다.
 * 사용자 문구는 화면 이름만 둔다.
 */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-8">
      <h1 className="m-0 text-title-lg text-fg">{title}</h1>
    </main>
  );
}
