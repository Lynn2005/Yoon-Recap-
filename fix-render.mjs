import fs from "fs";

const file="server.js";
const source=fs.readFileSync(file,"utf8");

// Subtitle placement is configured independently by patch-tts.mjs.
// Do not rewrite drawtext Y expressions here: title and subtitles have separate positions.
fs.writeFileSync(file,source,"utf8");
console.log("Kept independent title and subtitle positioning.");
