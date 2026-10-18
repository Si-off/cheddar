/** 역할에 담는 권한. 화면은 역할 이름이 아니라 이 키로 권한을 묻는다. */
export const permissionKeys = [
  "test_set.create",
  "test_set.invite",
  "test_set.public_link",
  "test_set.export",
  "test_set.view_all",
  "project.manage",
  "project.create",
  "plugin.upload",
  "account.manage",
  "role.manage",
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export interface PermissionInfo {
  key: PermissionKey;
  group: "테스트 세트" | "작업 준비" | "관리";
  label: string;
  description?: string;
  /** 전체 범위 할당에서만 적용된다 */
  globalOnly: boolean;
}

export const permissionCatalog: PermissionInfo[] = [
  {
    key: "test_set.create",
    group: "테스트 세트",
    label: "테스트 세트 만들기",
    description: "만든 사람이 소유자",
    globalOnly: false,
  },
  {
    key: "test_set.invite",
    group: "테스트 세트",
    label: "사람 초대",
    description: "편집 권한이 있는 테스트 세트에서",
    globalOnly: false,
  },
  {
    key: "test_set.public_link",
    group: "테스트 세트",
    label: "공개 링크 만들기",
    description: "공개 범위와 링크 권한 변경",
    globalOnly: false,
  },
  {
    key: "test_set.export",
    group: "테스트 세트",
    label: "XLSX 내보내기",
    description: "볼 수 있는 테스트 세트에서",
    globalOnly: false,
  },
  {
    key: "test_set.view_all",
    group: "테스트 세트",
    label: "모든 테스트 세트 열람",
    description: "초대 없이 보기",
    globalOnly: false,
  },
  {
    key: "project.manage",
    group: "작업 준비",
    label: "프로젝트 설정 관리",
    description: "기본 양식, 기능 그룹, 필수 케이스, 화면 구조",
    globalOnly: false,
  },
  {
    key: "project.create",
    group: "작업 준비",
    label: "프로젝트 만들기",
    globalOnly: true,
  },
  {
    key: "plugin.upload",
    group: "작업 준비",
    label: "플러그인 업로드",
    globalOnly: true,
  },
  {
    key: "account.manage",
    group: "관리",
    label: "계정 관리",
    description: "만들기, 수정, 비활성화, 역할 할당",
    globalOnly: true,
  },
  {
    key: "role.manage",
    group: "관리",
    label: "역할과 소속 관리",
    globalOnly: true,
  },
];

export interface PermissionGrant {
  key: PermissionKey;
  scope: "global" | "projects";
  projectIds: string[];
}

/** projectId를 주면 그 프로젝트에서, 없으면 전체 범위에서 권한이 있는지 본다. */
export function can(
  grants: readonly PermissionGrant[],
  key: PermissionKey,
  projectId?: string,
) {
  return grants.some(
    (grant) =>
      grant.key === key &&
      (grant.scope === "global" ||
        (projectId !== undefined && grant.projectIds.includes(projectId))),
  );
}

/** 어느 프로젝트에서든 권한이 있는지 본다(진입점 표시용). */
export function canAnywhere(
  grants: readonly PermissionGrant[],
  key: PermissionKey,
) {
  return grants.some(
    (grant) =>
      grant.key === key &&
      (grant.scope === "global" || grant.projectIds.length > 0),
  );
}
