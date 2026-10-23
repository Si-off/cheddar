import { readStdinJson } from "./lib.mjs";

const input = readStdinJson();
const command = String(input?.tool_input?.command ?? "");

const blocked = [
  {
    re: /git\s+push\b[^\n|;&]*(--force\b|-f\b|--force-with-lease\b)/,
    why: "force push",
  },
  { re: /git\s+rebase\b/, why: "rebase(이력 재작성)" },
  { re: /git\s+reset\s+--hard\b/, why: "reset --hard" },
  { re: /git\s+commit\b[^\n|;&]*--amend\b/, why: "commit --amend" },
  { re: /git\s+(filter-branch|filter-repo)\b/, why: "이력 재작성" },
];

for (const { re, why } of blocked) {
  if (re.test(command)) {
    console.error(
      `차단됨(${why}): 사용자가 명시적으로 요청한 경우에만 사용자에게 직접 실행을 요청한다.\n명령: ${command}`,
    );
    process.exit(2);
  }
}
