import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFinderOpenFolderWorkflow } from "../src/main/desktopFinderOpenFolderWorkflow.js";

function installInto(homeDir) {
  installFinderOpenFolderWorkflow({
    platform: "darwin",
    locale: "en-US",
    homeDir,
    logger: { info: () => {}, warn: () => {} },
    refreshServicesIndex: () => {},
  });
  return join(homeDir, "Library/Services/Open in DWeis Next.workflow/Contents/document.wflow");
}

test("Finder 服务脚本走 DWeis Next 自己的 deep link", () => {
  // 指向 zcode:// 会把目录交给本机安装的 ZCode，破坏 DWeis Next 的环境隔离。
  const homeDir = mkdtempSync(join(tmpdir(), "dweis-finder-"));
  try {
    const workflowPath = installInto(homeDir);
    assert.ok(existsSync(workflowPath), "应写入 document.wflow");
    const workflow = readFileSync(workflowPath, "utf8");
    // plist 里脚本以 XML 实体转义存放（&quot; 即半角双引号），只匹配脚本本体。
    assert.match(workflow, /dweis:\/\/workspace\/open\?path=\$\{encoded\}/u);
    assert.doesNotMatch(workflow, /zcode:\/\//u);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("重复安装不改写已一致的 workflow 文件", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "dweis-finder-"));
  try {
    const workflowPath = installInto(homeDir);
    const first = statSync(workflowPath);

    installFinderOpenFolderWorkflow({
      platform: "darwin",
      locale: "en-US",
      homeDir,
      logger: { info: () => {}, warn: () => {} },
      refreshServicesIndex: () => {},
    });
    const second = statSync(workflowPath);

    assert.equal(first.mtimeMs, second.mtimeMs, "内容一致时不应再次落盘");
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("非 macOS 平台不写任何 workflow", () => {
  const homeDir = mkdtempSync(join(tmpdir(), "dweis-finder-"));
  try {
    installFinderOpenFolderWorkflow({
      platform: "win32",
      locale: "zh-CN",
      homeDir,
      logger: { info: () => {}, warn: () => {} },
      refreshServicesIndex: () => {},
    });
    assert.equal(existsSync(join(homeDir, "Library")), false);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test("安装时移除上游 ZCode 的旧右键服务，bundle id 用 DWeis 自己的", () => {
  // 升级机上旧服务仍执行 zcode://workspace/open，不清掉会出现两个「打开方式」。
  const homeDir = mkdtempSync(join(tmpdir(), "dweis-finder-"));
  try {
    const legacyDir = join(homeDir, "Library/Services/Open in ZCode.workflow/Contents");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, "document.wflow"), "<plist/>");

    const workflowPath = installInto(homeDir);

    assert.equal(existsSync(join(homeDir, "Library/Services/Open in ZCode.workflow")), false);
    const plist = readFileSync(
      join(homeDir, "Library/Services/Open in DWeis Next.workflow/Contents/Info.plist"),
      "utf8",
    );
    assert.match(plist, /dev\.dweis\.app\.finder-open-workflow/u);
    assert.doesNotMatch(plist, /dev\.zcode\.app/u);
    assert.ok(existsSync(workflowPath));
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
});
