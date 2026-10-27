# @workspace/ui

[shadcn/ui Base UI](https://ui.shadcn.com/docs/components)를 바탕으로 테스트 케이스 제네레이터의 토큰과 표현을 적용한 공통 컴포넌트다. 원본의 출처와 라이선스는 [SHADCN-LICENSE.md](SHADCN-LICENSE.md)에 보존한다. 구성과 접근성 동작은 Base UI를 사용하고 스타일은 `src/styles.css`에서 관리한다.

## 사용

앱 스타일 진입점에서 Tailwind와 토큰 다음에 공통 스타일을 로드한다. 두 앱에는 이미 적용되어 있다.

```css
@import "tailwindcss";
@import "@workspace/design-tokens/theme.css";
@import "@workspace/ui/styles.css";
```

```tsx
import { Button, Checkbox, Label } from "@workspace/ui";

<Label><Checkbox name="selected" defaultChecked />항목 선택</Label>
<Button variant="secondary" type="submit">저장</Button>
```

## 제공 구성

| 구성 | API |
| --- | --- |
| 행동 | Button (`default`, `secondary`, `outline`, `ghost`, `destructive`, `link`; `default`, `sm`, `lg`, `icon` 크기) |
| 입력 | Input, Textarea, Label |
| 선택 | Checkbox, RadioGroup / RadioGroupItem, Switch |
| 대화상자 | Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogOverlay, DialogPortal |
| 선택 목록 | Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton |
| 탭 | Tabs, TabsList, TabsTrigger, TabsContent |
| 툴팁 | TooltipProvider, Tooltip, TooltipTrigger, TooltipContent |
| 표면 | Surface (기존 구성 유지) |

컴포넌트는 Base UI의 props와 ref를 전달한다. `className`은 문자열을 지원하며 Base UI 래퍼에서는 상태에 따른 함수도 지원한다. `render`로 트리거를 합성하며 Radix의 `asChild`를 사용하지 않는다. Label과 Textarea, Surface는 네이티브 요소 props를 받는다.

```tsx
<Dialog>
  <DialogTrigger render={<Button variant="outline" />}>이름 변경</DialogTrigger>
  <DialogContent>
    <DialogHeader><DialogTitle>이름 변경</DialogTitle></DialogHeader>
    <Label htmlFor="name">이름</Label>
    <Input id="name" />
    <DialogFooter>
      <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- Checkbox·Switch는 `checked` / `onCheckedChange` 또는 `defaultChecked`를 사용한다. Checkbox의 `indeterminate`로 부분 선택을 나타낸다.
- Input은 `value` / `onValueChange` 또는 `defaultValue`를 사용한다. Textarea는 네이티브 `onChange`를 사용한다.
- Input과 Textarea는 포커스 시 기존 배경색을 유지하고 테두리 색상만 변경한다. 오류 배경도 유지한다.
- RadioGroup·Select·Tabs는 `value` / `onValueChange` 또는 `defaultValue`를 사용한다.
- 입력 이름은 Label 또는 `aria-label` / `aria-labelledby`로 연결한다. 오류는 `aria-invalid`와 실제 오류 설명의 `aria-describedby`를 함께 전달한다.
- DialogContent의 닫기 버튼은 기본 제공한다. `closeLabel`로 접근성 이름을 바꾸고, 명시적인 닫기 행동을 제공하는 구성에서는 `showCloseButton={false}`를 사용할 수 있다. DialogTitle을 제공한다.
- Select는 `items`로 값과 표시 레이블을 연결하고 SelectValue로 현재 선택을 표시한다. 기본 팝업은 트리거 아래에 표시하며, 위치 조정 props를 전달할 수 있다.
- Tabs는 방향키로 포커스를 옮기고 Enter 또는 Space로 활성화한다. 자동 활성화가 필요한 경우 Base UI의 `activateOnFocus`를 TabsList에 전달한다.
- Tooltip은 기본 지연 400ms로 시작하며 Provider의 `delay`로 조정한다. 생성 여부는 프로젝트 UX 문구 정책을 따르고 아이콘 버튼의 접근성 이름을 별도로 제공한다.

## 스타일과 유지보수

공통 색상·크기·전환 값은 `packages/design-tokens/src/theme.css`에서 관리한다. 포커스는 기존 배경색과 테두리 색상 변화만으로 표현하며 링·밑줄·점선·추가 배경 레이어를 사용하지 않는다. 선택 채움은 중심에서 퍼지고, 스위치 손잡이는 고정 트랙 내부에서 이동하며, 비활성 스위치는 선택 여부와 관계없이 회색 트랙을 사용한다. 팝업은 opacity만 전환한다. 컴포넌트의 클래스는 Tailwind의 components 레이어에 있어 호출부의 유틸리티로 필요한 스타일을 조정할 수 있다.

workspace별 `components.json`은 `base-nova`와 공통 패키지 경로를 사용한다. 현재 구성은 원본 shadcn 스타일을 프로젝트 CSS로 커스텀한 상태이므로 CLI로 다시 추가하거나 업데이트할 때 덮어쓰기 diff를 검토하고 공통 토큰·포커스·모션 표현을 보존한다. 변경 검증은 `pnpm check`와 개발용 `/design-system.html`에서 수행한다.
