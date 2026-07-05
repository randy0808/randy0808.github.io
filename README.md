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
   - 加密貨幣：CoinGecko。
   - 美股與台股：Yahoo Finance chart API。
   - USD/TWD 匯率：open.er-api.com，失敗時使用備用匯率。

資料會存在瀏覽器的 localStorage。換裝置前請先用「匯出」備份 JSON，再在新裝置「匯入」。

此工具僅用於個人資產記錄與估值，不是投資建議。
