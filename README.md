# Endless Maze 無盡迷宮

像素風、第一人稱、迷宮探索的 Roguelike（肉鴿）手機遊戲。

- 🎮 **手勢操作**：往上滑前進、左右滑轉向該路線、點擊畫面攻擊（迷宮中不能後退）
- 🧙 **10 種職業**：男女各 5 種，開場以轉盤選擇角色
- ⚔️ **第一人稱持武器**：每個職業有專屬的持握姿勢，換武器時手上的武器跟著換
- 🗡️ **200 把武器**：每個職業 20 階，從木製、青銅一路到神器，寶箱與怪物掉落
- 🌀 **每局隨機生成**：迷宮、怪物、寶箱每次都不一樣，每 5 層有魔王守門
- 🎲 **天賦三選一**：升級時抽 3 個天賦選 1

## 下載 APK

到 [Releases](../../releases/latest) 下載最新的 `EndlessMaze-*.apk`，用手機安裝即可。
每次 push 到 `main` 分支，GitHub Actions 會自動編譯並發布新版本。

## 操作

| 手機手勢 | 網頁鍵盤 | 功能 |
| --- | --- | --- |
| 往上滑 | W / ↑ | 前進（前方有怪物則攻擊） |
| 往左滑 | A / ← | 轉向左邊的路線（是通道就走進去） |
| 往右滑 | D / → | 轉向右邊的路線 |
| 點擊畫面 | 空白鍵 / J | 攻擊正前方 |
| 藥水按鈕 | F | 喝藥水 |

網頁版在寬螢幕會自動顯示小鍵盤。用瀏覽器打開 `web/index.html` 即可遊玩。

## 專案結構

```
web/                 遊戲本體（HTML5 Canvas + JavaScript，無外部依賴）
  index.html / style.css / game.js
  data.js            職業與武器資料（自動產生）
  assets/            LOGO、角色立繪、武器圖示、第一人稱武器圖（自動產生）
tools/               美術資源產生器（Python）
  weapons.py         200 把武器的像素圖示
  fp.py              第一人稱持武器畫面（手臂／武器／拳頭三層）
  build_assets.py    一鍵產生 web/assets 與 web/data.js
app/                 Android 外殼（WebView 載入 web/ 資料夾）
.github/workflows/   自動編譯 APK 並發布 Release
```

## 重新產生美術資源

```bash
pip install numpy scipy pillow
python3 tools/build_assets.py
```

## 自己編譯

需要 Android SDK 與 JDK 17：

```bash
./gradlew assembleRelease
# 產出：app/build/outputs/apk/release/app-release.apk
```

> `app/abyss.keystore` 是公開的簽章金鑰，目的只是讓每次自動編譯的 APK 可以直接覆蓋安裝更新。
> 若要上架 Google Play，請改用自己保密的金鑰。
