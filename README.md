# Endless Maze 無盡迷宮

像素風、第一人稱、迷宮探索的 Roguelike（肉鴿）Android 遊戲。

- 🧱 **光線投射 (raycasting) 引擎**：160×120 像素解析度，復古第一人稱迷宮視角，火把光影閃爍
- 🌀 **每局隨機生成**：迷宮、房間、怪物、寶箱每次都不一樣，死亡即重來
- ⚔️ **回合制戰鬥**：每走一步、每次攻擊都是一回合；爆擊、閃避、連擊、吸血
- 🎲 **天賦三選一**：升級時從 13 種天賦中隨機抽 3 個選 1，每局 build 都不同
- 👹 **7 種怪物 + 魔王**：每 5 層魔王守門，每 3 層切換主題（石窟、苔蘚、赤焰、紫晶、白骨）
- 🗺️ 自動繪製小地圖、最佳紀錄保存

## 下載 APK

到 [Releases](../../releases/latest) 下載最新的 `EndlessMaze-*.apk`，用手機安裝即可。
每次 push 到 `main` 分支，GitHub Actions 會自動編譯並發布新版本。

## 操作

| 按鈕 | 功能 |
| --- | --- |
| ▲ ▼ ◀ ▶ | 前進、後退、左右平移（長按可連續移動） |
| ↺ ↻ | 向左 / 向右轉 |
| 攻擊 | 攻擊正前方（朝怪物前進也會攻擊） |
| 藥水 | 回復生命 |
| 等待 | 原地等待一回合 |
| 畫面手勢 | 左右滑動轉向、上滑前進、點擊攻擊 |

電腦上可以直接用瀏覽器開 `web/index.html` 測試（WASD 移動、Q/E 轉向、空白鍵攻擊、F 喝藥水）。

## 專案結構

```
web/                 遊戲本體（HTML5 Canvas + JavaScript，無外部依賴）
  index.html
  style.css
  game.js
app/                 Android 外殼（WebView 載入 web/ 資料夾）
.github/workflows/   自動編譯 APK 並發布 Release
```

## 自己編譯

需要 Android SDK 與 JDK 17：

```bash
./gradlew assembleRelease
# 產出：app/build/outputs/apk/release/app-release.apk
```

> `app/abyss.keystore` 是公開的簽章金鑰，目的只是讓每次自動編譯的 APK 可以直接覆蓋安裝更新。
> 若要上架 Google Play，請改用自己保密的金鑰。
