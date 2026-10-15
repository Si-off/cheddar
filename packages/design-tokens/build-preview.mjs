import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("./", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const theme = await read("src/theme.css");
const css = theme
  .replace(/^@import[^;]+;\s*/gm, "")
  .replace("@theme static", ":root");
let fonts = "";
let licenses = "";
for (const name of ["noto-sans", "noto-sans-kr"]) {
  const base = `node_modules/@fontsource-variable/${name}/`;
  let fontCss = await read(`${base}index.css`);
  const paths = [...fontCss.matchAll(/url\(([^)]+)\)/g)];
  for (const [, path] of paths) {
    const bytes = await readFile(new URL(`${base}${path}`, root));
    fontCss = fontCss.replace(
      `url(${path})`,
      `url(data:font/woff2;base64,${bytes.toString("base64")})`,
    );
  }
  fonts += fontCss;
  licenses += `\n${name}\n${await read(`${base}LICENSE`)}`;
}
const template = await read("preview.template.html");
const html = template
  .replace("/* EMBEDDED_FONTS */", fonts)
  .replace("/* DESIGN_TOKENS */", css)
  .replace('"__TOKEN_SOURCE__"', JSON.stringify(css))
  .replace("FONT_LICENSES", licenses.replaceAll("--", "—"));
const output = new URL("../../docs/design-foundations.html", root);
await writeFile(output, html);
console.log(
  `Created ${fileURLToPath(output)} (${Buffer.byteLength(html)} bytes)`,
);
