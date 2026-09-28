@echo off
set "PATH=D:\npm-global;%PATH%"
set "ZCODE_BUILTIN_PROVIDER_CONFIG_FILE="
cd /d D:\program\ZCode\packages\desktop
pnpm exec electron-builder --config electron-builder.config.js --win --x64
