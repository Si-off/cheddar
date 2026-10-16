# 이미지 생성 프롬프트

최종 파일은 아래의 독립 검토 반영 프롬프트까지 적용한 결과다. 뒤에는 최초 생성과 사용자 피드백 반영 이력을 기록한다.

## 문구 독립 검토 후 플러그인 수정 — 최종

```text
Edit ONLY the middle upload-in-progress window in this Cheddar concept sheet. Remove the bottom information box containing the info icon and "이 창을 열어 두세요." completely. Leave that bottom area as clean ordinary white space. Keep everything else exactly the same: all three windows, their labels, project name, frame names, progress count 2 / 3, images, buttons, palette and composition. Do NOT add replacement text or any metadata. This correction removes an instruction whose necessity has not been verified.
```

## 문구 독립 검토 후 생성 준비 수정 — 최종

```text
Edit ONLY the small data-transmission disclosure beneath the AI model dropdown near the lower left of this Cheddar screen. Replace its current sentence with this exact Korean text: "선택한 디자인 자료, 화면 목록, 시트 양식과 입력 내용이 Claude에 전송됩니다." Allow two readable lines if necessary within the form width. Keep the information icon. Do not change any other content, layout, color, button or image. Do not add tooltips, paragraphs, account UI or metadata. The purpose is to disclose all categories of project information sent to the selected AI provider.
```


내장 image_gen 사용. 최초 생성에는 참조 이미지를 사용하지 않았다. 수정에는 이번 대화에서 생성한 해당 시안만 사용했다. 폐기한 최초 시안은 최종 레퍼런스로 사용하지 않는다. 모든 화면 데이터는 가상이다.

## 플러그인 최초 생성

```text
Use case: ui-mockup
Asset type: New Cheddar Figma plugin UX concept sheet, NOT a copy of any existing UI.
Create a polished high fidelity straight-on 1920x1080 landscape design board on #f8f9fb. Three small plugin windows side by side, each about 380 px wide, with generous space between. Labels above windows: "01 선택", "02 업로드", "03 웹으로". Korean Noto Sans KR typography, clear readable text. Brand Cheddar. Primary #515299, white surfaces, dark #1d2433, muted #686f83, thin #e2e4eb borders, 8px button radius, 12px panels, restrained shadows. No gradients, no decorative illustrations, no marketing slogans.
First plugin: quiet compact header Cheddar with small connection status "연결됨". Project field "프로젝트" with value "스토어 리뉴얼" and chevron. Main section "선택한 프레임 3", three horizontal preview rows of clean fictional mobile checkout screens with labels "장바구니", "배송 정보", "주문 완료". Small line "Figma에서 선택을 바꾸면 목록이 바뀝니다." Footer button prominent full-width "프레임 3개 업로드".
Second plugin: same project identity and frame previews, heading "프레임 업로드 중", a determinate progress bar only for uploaded frames labelled "2 / 3", footer quiet text "이 창을 열어 두세요." No cancel button.
Third plugin: small understated success check, heading "프레임 3개 업로드 완료", project "스토어 리뉴얼", compact same three names, button "웹에서 테스트 케이스 만들기" plus secondary "계속 업로드".
All three windows belong to the upload-only plugin. Do not include test tables or AI controls in plugin. Use believable miniature mobile checkout source images. This is a fresh design proposal; all numbers and content are fictional sample data. Crisp orthographic UI, no tilted devices.
```

## 플러그인 수정 — 사용자 피드백 반영

```text
Edit this Cheddar plugin concept sheet. Preserve the three-window composition, colors, font, frame thumbnail imagery and intended flow. Remove clutter and unsupported metadata precisely:
1. In EVERY frame row in all windows, remove "Frame 1", "Frame 2", "Frame 3" and every pixel dimension such as "390 x 844". Keep only thumbnail and Korean frame name.
2. Remove the entire sentence "Figma에서 선택을 바꾸면 목록이 바뀝니다." without replacement.
3. Remove "연결됨" and its green dot from all headers; normal connectivity does not need persistent status.
4. In the success window replace the project dropdown with static plain project name "스토어 리뉴얼", no border or chevron. The upload destination must be immutable in success.
5. In the uploading window make the project name static, not an editable dropdown. Keep the real progress count "2 / 3" and "이 창을 열어 두세요." because closing during upload can interrupt the task.
6. Remove invented purple logo icon; use just text Cheddar.
7. Flat #515299 primary buttons without gradients.
Do not add help text, tooltips, captions, metadata, avatars, notification bells, marketing text or extra controls. Retain exact button labels from original. Compact frame rows and move action closer to content where the removed text leaves space. Final polished new proposal with only task-relevant visible information.
```

## 생성 준비 최초 생성

```text
Use case: ui-mockup
Asset type: New Cheddar desktop web UX concept, test generation preparation.
Create one high fidelity Korean SaaS application screenshot, 1920x1200 landscape, orthographic flat UI, crisp Noto Sans KR typography. Brand Cheddar. Calm light workspace. Palette exact target #515299 primary, #f8f9fb canvas, white surface, #1d2433 text, #686f83 muted, #e2e4eb borders, #2f746f small secondary accents. 8px control corners, 12px panel corners. No gradients, no gigantic empty areas, no marketing illustrations or decorative dashboard charts.
Narrow 216px left navigation: Cheddar header, project dropdown "스토어 리뉴얼", navigation "테스트 시트" selected, "디자인 자료", "화면 목록", then low-emphasis bottom "기본 양식", "프로젝트 설정". Main area: breadcrumb "테스트 시트 / 새 시트"; heading "어떤 흐름을 테스트할까요?" with no subtitle.
Two-column workspace: main form 60%, source preview 40%.
Main: labelled field "시트 이름" filled "주문 흐름 QA"; segmented control labelled "테스트 범위" with "화면·기능" and selected "사용자 흐름". Show single textarea label "확인할 내용", filled "장바구니에서 배송 정보를 입력하고 주문을 완료하는 흐름. 필수 입력 누락과 수량 변경도 확인해 주세요."
Below, section "디자인 자료" with simple selected source rows/checks: group "10월 15일 업로드", rows "장바구니", "배송 정보", "주문 완료", three selected. Source selection is selectable context, not a progress wizard.
Below collapsed disclosure rows "화면 연결 · 3개" and "양식 · 프로젝트 기본 양식".
At lower form area a dropdown label "AI 모델" value "Claude Haiku", followed by a concise visible data disclosure "선택한 자료와 입력 내용이 Claude에 전송됩니다." This is important data disclosure, not a tooltip.
Right panel titled "선택한 프레임 3" with three small believable fictional mobile checkout frame previews laid out side by side, each with their Korean name. Beneath them a calm summary headed "생성할 시트", name "주문 흐름 QA", "사용자 흐름", "프레임 3개". No fake accuracy scores, no target case count.
Stable bottom action area: secondary "빈 시트로 시작", primary "테스트 케이스 생성". Form continues logically; no notification popups, no tutorials, no fake charts. Keep UI genuinely readable and detailed. All source content is fictional sample data. This is a fresh design proposal, no reference images.
```

## 생성 준비 수정 — 사용자 피드백 반영

```text
Edit this Cheddar web design concept. Preserve palette, typography, navigation, two-column form and sample checkout source previews. Make exactly these UX corrections:
- Remove the entire notification bell, avatar, person name and user menu at top right. This product has no login.
- Replace the question heading "어떤 흐름을 테스트할까요?" with concise noun heading "새 테스트 시트".
- Remove the entire "생성할 시트" summary card on the lower right; it repeats fields already visible.
- Remove the technical-looking text "mobile / cart", "mobile / checkout", "mobile / complete" and the adjacent three-dot buttons in source rows. Keep only checkbox, thumbnail and frame name.
- Rename the primary bottom button to "케이스 생성".
- Do not add any help paragraph, tooltip, replacement summary, metadata, header subtitle, frame dimensions or IDs.
- Retain important data disclosure "선택한 자료와 입력 내용이 Claude에 전송됩니다." below AI model.
- Use flat #515299 buttons, no gradients. Keep a stable bottom action zone and well-aligned comfortable whitespace.
This is a static concept image. Do not imply new product features.
```

## 편집 화면 — 최종

```text
Use case: ui-mockup
Asset type: Cheddar web test case editor, fresh UX design proposal.
Create a single high fidelity desktop application screenshot 1920x1200 landscape, straight-on crisp Korean Noto Sans KR. White surfaces on #f8f9fb, foreground #1d2433, muted #686f83, borders #e2e4eb, flat primary #515299, sparse #2f746f accent. 8px controls, 12px panel corners, restrained shadows. No gradients. No avatars, login, bells, marketing copy, technical IDs or frame sizes.
Left 200px navigation Cheddar, project dropdown "스토어 리뉴얼", "테스트 시트" selected, "디자인 자료", "화면 목록"; low emphasis at bottom "기본 양식", "프로젝트 설정".
Main compact header: back breadcrumb "테스트 시트"; title "주문 흐름 QA", small text status "저장됨". Right header actions "XLSX 내보내기" and menu button. NO share action because sharing is not implemented. Below header tabs "케이스 12", "검토할 후보 3". Do not add dashboard metrics, fake AI accuracy, pass/fail statuses, explanatory subtitle or extra charts.
Toolbar: search field "케이스 검색", quiet button "열 설정", primary "케이스 추가".
Large table occupying left 65% of remaining area. Headers "번호", "제목", "사전조건", "수행 단계", "기대 결과", "우선순위". Display four generously tall rows with readable wrapped text; no truncating step text. IDs TC-001, TC-002, TC-003, TC-004 are user-visible case numbers, not technical UUIDs. Example cases: "장바구니 수량 변경", "필수 배송 정보 누락", "배송 정보 입력", "주문 완료 확인". TC-002 selected with #f5f5fb row fill. Priority labels 높음, 보통. Realistic Korean test steps and expected results about an ecommerce checkout, distinguish scenario from expected behavior. Horizontal scroll affordance below table for columns beyond visible area. Row count footer "12개".
Right context panel 360px wide, aligned with table; header "TC-002" and close icon. Title "필수 배송 정보 누락". Editable fields "사전조건" value "배송 정보 화면에 진입한 상태", "수행 단계" value "1. 받는 사람을 비워 둡니다.\n2. 다음 단계를 누릅니다.", "기대 결과" value "받는 사람 입력란에 오류가 표시되고 다음 단계로 이동하지 않습니다." Followed by one small linked frame preview with label "배송 정보", and compact field "연결된 화면" value "주문 / 배송 정보". No pixel dimensions, technical node IDs, redundant help. Small action "상세 닫기" is not needed if close icon exists.
Sample text is fictional, not a factual claim about implemented behavior. Design must feel like an efficient editable document workspace with readable content, not a dashboard. No footer slogan or generated explanatory callouts.
```
