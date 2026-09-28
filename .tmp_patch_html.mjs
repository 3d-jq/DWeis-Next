// 启动动画主题双形态改造：
// - 默认/亮色：白色圆角方块 + 深色笔画标志（与安装后的应用图标一致）
// - 深色：黑色渐变圆角方块 + 白色笔画标志
// 标志位图从 brandLogo.ts 的两个 data URI 提取（mark-white / mark-black）。
import { readFileSync, writeFileSync } from "node:fs";

const brandSrc = readFileSync("packages/desktop/src/main/brandLogo.ts", "utf8");
const uriOf = (name) => {
  const m = brandSrc.match(new RegExp(`export const ${name} = "(data:image/png;base64,[^"]+)"`));
  if (!m) throw new Error(`export ${name} not found`);
  return m[1];
};
const whiteMarkUri = uriOf("DWEIS_STARTUP_LOGO_DATA_URI"); // 白色笔画（深色壳用）
const blackMarkUri = uriOf("DWEIS_BRAND_LOGO_DATA_URI"); // 黑色笔画（亮色壳用）

const htmlPath = "packages/desktop/src/renderer/index.html";
let html = readFileSync(htmlPath, "utf8");

// 1) 壳默认改为白色圆角方块（亮色形态）
const oldShellBg = "background: linear-gradient(180deg, #000000 0%, #151718 100%);";
const newShellBg = "background: linear-gradient(180deg, #ffffff 0%, #eef0f2 100%);";
if (!html.includes(oldShellBg)) throw new Error("shell background css not found");
html = html.replace(oldShellBg, newShellBg);

// 2) ::before 边框：亮色底用浅黑描边；深色壳加 on-dark 覆盖
const oldBorder = `/* 启动 logo 壳是固定深色底，边框不能跟随浅色主题 token，否则首屏边框过重。*/
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: inherit;
      }`;
const newBorder = `/* DWeis Next：启动 logo 壳按主题双形态——默认白色方块 + 深色标志，
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
      }`;
if (!html.includes(oldBorder)) throw new Error("shell border css not found");
html = html.replace(oldBorder, newBorder);

// 3) img 拆成两份：亮色壳用黑色笔画、深色壳用白色笔画
const imgRe = /<img\s+class="startup-logo"\s+src="data:image\/png;base64,[^"]+"\s+alt="DWeis Next"\s+width="56"\s+height="56"\s*\/>/;
if (!imgRe.test(html)) throw new Error("startup logo img not found");
html = html.replace(
  imgRe,
  `<img
          class="startup-logo startup-logo-mark-for-light"
          src="${blackMarkUri}"
          alt="DWeis Next"
          width="56"
          height="56"
        />
        <img
          class="startup-logo startup-logo-mark-for-dark"
          src="${whiteMarkUri}"
          alt="DWeis Next"
          width="56"
          height="56"
        />`,
);

// 4) 主题判定脚本：插在 startupLogoShell 查询之后
const anchor = 'const startupLogoShell = document.querySelector(".startup-logo-shell");';
if (!html.includes(anchor)) throw new Error("startup script anchor not found");
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
console.log("index.html patched: dual-form startup logo + theme script");
