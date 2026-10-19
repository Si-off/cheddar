import { expect, test } from "@playwright/test";
import {
  account,
  affiliations,
  me,
  mockApi,
  roles,
} from "../../shared/testing/mock-api";

test("내 역할에 계정 관리 권한을 더하면 저장 직후 계정 탭이 보인다", async ({
  page,
}) => {
  let saved = false;
  const roleManager = { ...roles[0], permissions: ["role.manage" as const] };
  await mockApi(page, {
    "GET /api/v1/auth/me": () =>
      me(saved ? ["role.manage", "account.manage"] : ["role.manage"]),
    "GET /api/v1/roles": [roleManager, ...roles.slice(1)],
    "GET /api/v1/roles/r1": roleManager,
    "GET /api/v1/affiliations": affiliations,
    "GET /api/v1/accounts": { items: [account()], total: 1 },
    "PATCH /api/v1/roles/r1": () => {
      saved = true;
      return { ...roleManager, permissions: ["role.manage", "account.manage"] };
    },
  });
  await page.goto("/admin/roles/r1");
  const tabs = page.getByRole("navigation", { name: "관리" });
  await expect(tabs.getByRole("link", { name: "역할" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "계정" })).toHaveCount(0);

  await page.getByRole("checkbox", { name: /계정 관리/ }).click();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(tabs.getByRole("link", { name: "계정" })).toBeVisible();
  await tabs.getByRole("link", { name: "계정" }).click();
  await expect(page).toHaveURL(/\/admin\/accounts$/);
});
