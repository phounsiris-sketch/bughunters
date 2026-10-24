/* Builds tools/uimatrix/out/harness.html: the real index.html, the real scripts and css, with Firebase replaced by a stub and fake group data,
   plus a driver that renders every page in every theme x icon style and records layout problems. See README.md */
var fs = require("fs"), path = require("path");
var root = process.cwd(), outDir = process.argv[2] || path.join(root, "tools/uimatrix/out");
fs.mkdirSync(outDir, { recursive: true });
var html = fs.readFileSync("index.html", "utf8");
html = html.replace(/<script defer src="https:\/\/www\.gstatic\.com[^>]*><\/script>\s*/g, "");
html = html.replace(/<script src="js\/splash\.js"><\/script>/, "");
html = html.replace(/(href|src)="(css|js|img|icons|fonts)\//g, '$1="file://' + root + '/$2/');
html = html.replace("<head>", "<head>");
var stub = fs.readFileSync(path.join(__dirname, "stub.js"), "utf8"), driver = fs.readFileSync(path.join(__dirname, "driver.js"), "utf8");
html = html.replace(/<script defer src="[^"]*js\/app\.js"><\/script>/, function (m) { return m + "\n<script defer src=\"file://" + path.join(__dirname, "driver.js") + "\"></script>"; });
html = html.replace("</head>", "<script>" + stub + "</script></head>");
fs.writeFileSync(path.join(outDir, "harness.html"), html);
console.log("harness written", path.join(outDir, "harness.html"));
