import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const files = {
  "/": ["text/html; charset=utf-8", read("public/index.html")],
  "/app.js": ["text/javascript; charset=utf-8", read("public/app.js")],
  "/rules.js": ["text/javascript; charset=utf-8", read("public/rules.js")],
  "/style.css": ["text/css; charset=utf-8", read("public/style.css")],
  "/hero.jpg": ["image/jpeg", readFileSync(new URL("../public/hero.jpg", import.meta.url)).toString("base64")],
};
for (const name of ["baklava", "manti", "sarma"]) {
  const path = "/test-media/" + name + ".jpg";
  files[path] = ["image/jpeg", readFileSync(new URL("../public" + path, import.meta.url)).toString("base64")];
}
files["/test-media/ATTRIBUTION.md"] = ["text/plain; charset=utf-8", read("public/test-media/ATTRIBUTION.md")];
const worker = read("server/index.js").replace(/^import .*;\n/gm, "");
const rules = read("public/rules.js").replace(/^export /gm, "");
const testAccess = read("server/test-access.js").replace(/^export /gm, "");
const target = new URL("../dist/server/", import.meta.url);
mkdirSync(target, {recursive:true});
writeFileSync(new URL("index.js", target), `${rules}\n${testAccess}\n${worker}\nconst assets = ${JSON.stringify(files)};\n`);
