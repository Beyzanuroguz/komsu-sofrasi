import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const files = {
  "/": ["text/html; charset=utf-8", read("public/index.html")],
  "/app.js": ["text/javascript; charset=utf-8", read("public/app.js")],
  "/rules.js": ["text/javascript; charset=utf-8", read("public/rules.js")],
  "/style.css": ["text/css; charset=utf-8", read("public/style.css")],
  "/hero.jpg": ["image/jpeg", readFileSync(new URL("../public/hero.jpg", import.meta.url)).toString("base64")],
};
const worker = read("server/index.js").replace(/^import .* from "\.\.\/public\/rules\.js";\n/m, "");
const rules = read("public/rules.js").replace(/^export /gm, "");
const target = new URL("../dist/server/", import.meta.url);
mkdirSync(target, {recursive:true});
writeFileSync(new URL("index.js", target), `${rules}\n${worker}\nconst assets = ${JSON.stringify(files)};\n`);
