import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, "dist");
const copy = (source, destination) => copyFileSync(path.join(root, source), path.join(output, destination));

rmSync(output, { recursive: true, force: true });
mkdirSync(path.join(output, "src"), { recursive: true });
mkdirSync(path.join(output, "images"), { recursive: true });
mkdirSync(path.join(output, "vendor"), { recursive: true });

copy("index.html", "index.html");
for (const file of ["app.js", "config.js", "media-player.js", "styles.css"]) copy(`src/${file}`, `src/${file}`);
copy("public/manus-routes.json", "manus-routes.json");
copy("public/sparkle.svg", "sparkle.svg");
copy("public/images/hero.jpg", "images/hero.jpg");
copy("node_modules/hls.js/dist/hls.min.js", "vendor/hls.min.js");
copy("node_modules/hls.js/LICENSE", "vendor/LICENSE.txt");

console.log("Ani Sparkle assets built in dist/.");
