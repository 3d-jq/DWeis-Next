// 启动动画主题双形态改造（第三轮，indexOf 确定性切片）
import { readFileSync, writeFileSync } from "node:fs";

const brandSrc = readFileSync("packages/desktop/src/main/brandLogo.ts", "utf8");
const uriOf = (name) => {
  const m = brandSrc.match(new RegExp(`export const ${name} = "(data:image/png;base64,[^"]+)"`));
  if (!m) throw new Error(`export ${name} not found`);
  return m[1];
};
const whiteMarkUri = uriOf("DWEIS_STARTUP_LOGO_DATA_URI");
const blackMarkUri = uriOf("DWEIS_BRAND_LOGO_DATA_URI");

const htmlPath = "packages/desktop/src/renderer/index.html";
let html = readFileSync(htmlPath, "utf8");

// 1) 壳背景改白色
const bgOld = "background: linear-gradient(180deg, #000000 0%, #151718 100%);";
if (!html.includes(bgOld)) throw new Error("bg not found");
html = html.replace(bgOld, "background: linear-gradient(180deg, #ffffff 0%, #eef0f2 100%);");

// 2) 边框 + 追加 on-dark 规则：定位注释行起点，切片到 "border-radius: inherit;\n      }" 结束
const commentIdx = html.indexOf("/* 启动 logo 壳是固定深色底");
const closeMarker = "border-radius: inherit;\n      }";
const closeIdx = html.indexOf(closeMarker, commentIdx);
if (commentIdx < 0 || closeIdx < 0) throw new Error("border block not found");
const borderBlockEnd = closeIdx + closeMarker.length;
html =
  html.slice(0, commentIdx) +
  `/* DWeis Next：启动 logo 壳按主题双形态——默认白色方块 + 深色标志，
         深色主题切换为黑色方块 + 白色笔画（.on-dark）。*/
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: inherit;
      }

      .startup-logo-shell.on-dark {
        background: linear-gradient(180deg, #000000 0%, #151718 100%);
      }

      .startup-logo-shell.on-dark::before {
        border-color: rgba(255, 255, 255, 0.1);
      }

      .startup-logo-shell:not(.on-dark) .startup-logo-mark-for-dark {
        display: none;
      }

      .startup-logo-shell.on-dark .startup-logo-mark-for-light {
        display: none;
      }` +
  html.slice(borderBlockEnd);

// 3) img 拆两份
const imgAnchor = 'class="startup-logo"';
const imgIdx = html.indexOf(imgAnchor);
if (imgIdx < 0) throw new Error("img not found");
const imgTagEnd = html.indexOf("/>", imgIdx) + 2;
const originalImg = html.slice(imgIdx - 4, imgTagEnd); // 含 <img 前缀
const whiteMarkImg = originalImg.replace(
  'class="startup-logo"',
  'class="startup-logo startup-logo-mark-for-dark"',
);
const blackMarkImg = originalImg.replace(
  'class="startup-logo"',
  'class="startup-logo startup-logo-mark-for-light"',
);
blackMarkImg = blackMarkImg.replace(/src="data:image\/png;base64,[^"]*"/, `src="${blackMarkUri}"`);
html = html.slice(0, imgIdx - 4) + blackMarkImg + "\n        " + whiteMarkImg + html.slice(imgTagEnd);

// 4) 主题判定脚本
const anchor = 'const startupLogoShell = document.querySelector(".startup-logo-shell");';
if (!html.includes(anchor)) throw new Error("script anchor not found");
html = html.replace(
  anchor,
  anchor +
    `
      // DWeis Next：启动动画按主题双形态。默认（未存储主题/未知值）用白色方块 + 深色标志；
      // 显式深色（zai-dark/dark）或 system 且系统偏好为深色时切换黑色方块 + 白色笔画。
      let storedStartupTheme = null;
      try {
        storedStartupTheme = localStorage.getItem("dweis-theme");
      } catch {
        // 隐私模式等 localStorage 不可用时按默认亮色壳处理
      }
      const prefersDarkStartupShell =
        storedStartupTheme === "dark" ||
        storedStartupTheme === "zai-dark" ||
        (storedStartupTheme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      if (prefersDarkStartupShell) startupLogoShell.classList.add("on-dark");`,
);

writeFileSync(htmlPath, html, "utf8");
console.log("index.html patched OK");
