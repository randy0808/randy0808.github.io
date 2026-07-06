# 資產儀表板

這是一個跨平台 PWA 原型。iOS 可用 Safari 開啟後加入主畫面，Windows 和 macOS 可用 Chrome、Edge、Safari 或 Firefox 開啟。

## 使用方式

1. 直接開啟 `index.html`，或用本機伺服器開啟以啟用 PWA 快取。
2. 新增資產：
   - 加密貨幣：`BTC`、`ETH`、`SOL`，或 CoinGecko id。
   - 美股：`AAPL`、`TSLA`、`NVDA`。
   - 台股：`2330` 會自動轉成 `2330.TW`。
   - 手動資產：可記錄現金、房產、基金或暫時沒有公開報價的資產。
3. 報價來源：
   - 加密貨幣：CoinGecko；Pi Network 使用 OKX。
   - 美股與台股：Google Finance reader，失敗時保留上次可用報價。
   - USD/TWD 匯率：open.er-api.com，失敗時使用備用匯率。

資料會存在瀏覽器的 localStorage。跨裝置可用「雲端同步」連到 GitHub 私密 Gist，也可用「匯出 / 匯入」備份 JSON。

此工具僅用於個人資產記錄與估值，不是投資建議。
