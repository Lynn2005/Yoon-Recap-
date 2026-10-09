import fs from "fs";

const file="server.js";
let source=fs.readFileSync(file,"utf8");

// patch-tts.mjs introduced subtitle positioning by reassigning `ty`,
// but `ty` is a const. Keep the editor title Y untouched and use subtitleY
// directly in the subtitle drawtext filter.
source=source.replace(/\n\s*ty=subtitleY;/g,"\n");
source=source.replace(/\n\s*ty=titleY;/g,"\n");
source=source.replace(/y=h\*"\+ty\+"\/100-text_h\/2:fix_bounds=1:enable=/g,'y=h*"+subtitleY+"/100-text_h/2:fix_bounds=1:enable=');

fs.writeFileSync(file,source,"utf8");
console.log("Fixed Final Video render: no assignment to const ty; subtitles use subtitleY directly.");
