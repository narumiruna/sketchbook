# Sketchbook

[English](README.md) · 繁體中文（台灣）

Sketchbook 提供 Pi 工具和獨立的 MCP 伺服器，讓你在本機撰寫包含 Markdown、LaTeX、程式碼和 Diagram Design HTML 的技術文件，也支援既有的靜態 SVG 投影片。你可以從單頁開始，等讀者需要更多細節時再加入小節或章節。
每組投影片一次顯示一張圖和它的說明，翻頁不影響章節位置。
使用底部的上一張、下一張按鈕或帶標籤的定位圓點切換投影片；投影片組取得鍵盤焦點後，也可以用左右方向鍵切換。
寬螢幕會把說明放在圖旁，窄螢幕則使用單欄版面。
頁面標題是 H1。在具名小節外，投影片組標題是 H2，目前投影片的標題是 H3；在具名小節內則分別是 H3 和 H4。
如果投影片組和目前投影片的標題相同，畫面上只會顯示一次。

## 安裝

### Pi

從 GitHub 安裝最新版 Sketchbook：

```sh
pi install https://github.com/narumiruna/sketchbook
```

透過 Git 安裝需要 Node.js 26.0.0 以上版本、Git、`tar`，以及 Pi 預設的套件管理工具 `npm`。
Pi 會複製儲存庫，並在安裝時，以及更新至不同 Git commit 時，建置擴充功能、Viewer 和隨附的 skill。建置需要連線到 npm 和 GitHub。
重新啟動 Pi 或執行 `/reload`，再執行 `/skill:sketchbook`。

若要更新透過 Git 安裝的版本，請執行 `pi update https://github.com/narumiruna/sketchbook`。

也可以安裝預先建置的 npm 套件，但它可能落後於此儲存庫：

```sh
pi install npm:@narumitw/sketchbook
```

切換安裝來源時，先用 `pi remove <source>` 移除舊套件，避免載入兩份 Sketchbook。
若要從本機的儲存庫安裝開發版本：

```sh
npm ci
npm run build
pi install ./
```

Sketchbook 使用 Pi 1.6.0 測試；請參閱[相容性驗證紀錄](docs/compatibility.md)。

從本機安裝需要 Node.js 26.0.0 以上版本、建置完成的 `dist` 檔案，以及已安裝的相依套件。

發行工作流程會建立版本標籤和 GitHub Releases，不會將套件發布到 npm。
安裝前請先檢視套件程式碼；將專案標為可信任之前，也請檢視專案在 Pi 中的設定。

### Claude Code 和 Codex 外掛

安裝外掛即可同時取得 `sketchbook` skill 和 MCP 工具。兩款本機用戶端的外掛都使用同一個 `sketchbook-mcp` 執行檔。

使用 Node.js 26.0.0 以上版本，在這份工作副本建置並安裝 npm 壓縮套件，讓 skill 和 MCP 伺服器維持同一版本。請在儲存庫根目錄執行：

```sh
npm ci
npm run build
archive=$(npm pack --quiet --ignore-scripts)
npm install --global "./$archive"
plugin_root="$(npm root --global)/@narumitw/sketchbook"
```

確認啟動用戶端的 shell 能執行 `sketchbook-mcp --help`，再用上面的 `plugin_root` 向你使用的用戶端註冊外掛：

```sh
# Claude Code
claude plugin marketplace add "$plugin_root"
claude plugin install sketchbook@narumi-sketchbook

# Codex CLI
codex plugin marketplace add "$plugin_root"
codex plugin add sketchbook@narumi-sketchbook
```

從你想儲存文件的工作區啟動新的用戶端工作階段。Claude Code 使用專案根目錄；在已測試的本機環境中，Codex 的伺服器會沿用 CLI 工作階段的工作目錄。兩者都會把文件存入該工作區的 `.pi/sketchbook/` 目錄。若已設定獨立的 MCP 伺服器，請在使用外掛前移除那筆重複設定。

### MCP

如果只需要伺服器、不需要隨附的 skill，可以直接設定 MCP。
這個透過標準輸入／輸出（stdio）通訊的 MCP 伺服器，讓 Claude Desktop、Cursor 等用戶端也能使用和 Pi 相同的 Sketchbook 工具。不需要安裝 Pi；可用的工具取決於套件版本。
在工作區執行已發布的套件：

```sh
npx -y @narumitw/sketchbook --cwd .
```

也可以將伺服器加入用戶端的 MCP 設定。請將 `/absolute/path/to/workspace` 換成要儲存文件的工作區：

```json
{
  "mcpServers": {
    "sketchbook": {
      "command": "npx",
      "args": ["-y", "@narumitw/sketchbook", "--cwd", "/absolute/path/to/workspace"]
    }
  }
}
```

請使用用戶端的 MCP 設定檔，例如 Claude Desktop 的 `claude_desktop_config.json` 或 Cursor 的 `.cursor/mcp.json`。
修改設定後，重新啟動用戶端。
若要固定套件版本，請將 `@narumitw/sketchbook` 換成 `@narumitw/sketchbook@<version>`。
若要從這份工作副本執行 MCP 伺服器，請使用 Node.js 26.0.0 以上版本，執行 `npm ci` 和 `npm run build`，再執行 `node /absolute/path/to/sketchbook/dist/mcp-cli.js --cwd /absolute/path/to/workspace`。

#### MCP 工作區和行為

- `--cwd` 指定既有的工作區目錄。已發布的 `0.2.2` 版要求使用此參數；目前的程式碼在省略它時，會使用伺服器程序的工作目錄。
  - 相對路徑以程序的工作目錄為基準。
  - 從終端機執行時，預設值是 shell 的目前目錄。MCP 用戶端在啟動伺服器時會選定工作目錄，不一定是用戶端目前開啟的專案。
  - 文件會留在工作區的 `.pi/sketchbook/` 目錄，格式與 Pi 相同。
  - 工具輸入無法變更工作區；要使用另一個工作區，請另建一組伺服器設定。
  - 同時寫入的限制請參閱[檔案與生命週期](#檔案與生命週期)。
- 伺服器僅使用 stdio；標準輸出（stdout）專供 MCP 訊息使用，診斷訊息則送到標準錯誤（stderr）。
  - 每個工具都會回傳 JSON 文字和 `structuredContent`；失敗時也會設定 `isError: true`。
  - Pi 的讀取結果有文字長度限制；MCP 的 `sketchbook_read` 則會在兩種回傳格式中提供完整的已儲存文件。
  - 建立文件時不要提供 `documentId` 和 `expectedRevision`。要替換整個原始頁面，請先讀取，再把這兩個欄位和完整文件一併送出。局部修改請用 `sketchbook_edit`。
- `sketchbook_open` 啟動唯讀的 HTTP Viewer，不是 HTTP MCP 端點。[區域網路存取規則](#區域網路存取)也適用於 MCP。
  - 用戶端中斷連線、標準輸入到達檔案結尾（EOF），或程序收到 SIGINT、SIGTERM 時，Viewer 會關閉。
- MCP 只提供工具，不提供 Pi 的斜線指令，也不會自動載入 skill。
  - 可以參考隨附的[撰寫 skill](skills/sketchbook/SKILL.md)和[文件格式](skills/sketchbook/references/document-format.md)。
  - 各用戶端的實際介面行為仍需依照 [MCP 用戶端驗收步驟](docs/acceptance.md#mcp-client-handoff)確認。

## 從 Pi Canvas 升級

套件已改名為 `@narumitw/sketchbook`。
請將 `canvas_*` 工具呼叫換成 `sketchbook_*`，將 `/skill:canvas-explain-diagrams` 換成 `/skill:sketchbook`。
舊名稱不是別名，無法繼續使用。

`.pi/canvas/` 中的既有文件不會自動搬移。
搬移前，請停止所有使用該工作區的 Pi 工作階段，並備份已儲存的文件。
如果 `.pi/sketchbook/` 不存在，請將完整的 `.pi/canvas/` 目錄移至 `.pi/sketchbook/`。
如果兩個目錄都存在，請保留兩者，先處理重複的文件 ID，再搬移檔案；不要覆寫任一目錄。
文件 ID、修訂版號和結構描述（schema）版本 1 都不會改變。
重新啟動 Pi 以載入改名後的工具和 skill，然後重新開啟文件取得新的 Viewer 網址。

## 使用方式

在 Pi 中使用 `/skill:sketchbook`。舊指令 `/skill:sketchbook-create-diagrams`、`/skill:sketchbook-diagram-design` 和 `/skill:sketchbook-explain-diagrams` 都不是別名；請把已儲存提示中的舊指令換掉。

明確載入隨附的 skill：

```text
/skill:sketchbook 請先概述這個系統，再說明 API 和資料儲存的細節。
```

明確叫用 `/skill:sketchbook` 就是要求儲存頁面並取得本機 Viewer 的私有連結，即使只是問一個簡短問題。
如果文字更清楚，頁面可以只用 Markdown，不必硬加圖表。
需要圖解時，skill 會依照隨附的 Diagram Design 指南製作圖表，並儲存完整 HTML。
未指定樣式且專案沒有設定樣式時，會直接使用 Sketchbook 的預設淺色樣式。
未明確叫用時，不需要圖解的簡單問題應直接在對話中回答。目前尚未驗證 skill 的自動選用行為。
可參考 [HTTP 快取範例](examples/diagram-design/http-cache.html)，從直接使用仍有效的快取副本開始，再瞭解快取驗證和完整決策流程。

| 工具                   | 輸入與結果                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `sketchbook_write`     | `{document}` 建立文件，回傳 ID、修訂版號、儲存路徑、摘要，以及尚未驗證算繪的狀態。                                                            |
| `sketchbook_read`      | `{documentId}` 在 `structuredContent.stored` 回傳 `{documentId, revision, updatedAt, document}`。                                             |
| `sketchbook_write`     | `{document, documentId, expectedRevision}` 在修訂版號相符時，替換整份原始文件。                                                               |
| `sketchbook_open`      | `{documentId}` 回傳暫時有效的本機 Viewer 網址，不會啟動瀏覽器。                                                                               |
| `sketchbook_read_book` | `{documentId}` 回傳 `{ok: true, book: StoredBook \| null, contentTruncated}`。`null` 表示沒有附屬檔案；初始修訂版號為 `0`。                   |
| `sketchbook_edit`      | `{documentId, expectedRevision, operation}` 回傳 `{ok: true, documentId, revision, record: 'document' \| 'book', renderingVerified: false}`。 |

編輯前，先讀取要修改的紀錄，並使用該紀錄的修訂版號。遇到衝突或無法確定結果時，先重新讀取同一筆紀錄，再決定是否重試。
寫入成功代表資料已通過驗證並儲存；不論是寫入還是呼叫 `sketchbook_open`，都不代表已驗證瀏覽器的顯示結果。
Pi 和 MCP 共用相同的驗證規則，並原樣儲存 HTML 或 SVG 原始碼。
欄位、ID、限制、標題層級和工具細節請參閱[文件格式](skills/sketchbook/references/document-format.md)。

若要單獨展示一段程式碼，請在 `document.blocks` 加入這樣的項目：

```json
{ "id": "example", "type": "code", "language": "TypeScript", "code": "const answer = 42;\n" }
```

省略 `language` 就不會顯示語言標籤。
Viewer 只會將程式碼顯示為文字，不會執行。
用 Tab 將焦點移到區塊，再用方向鍵捲動較長的程式碼行。
若要在正文或投影片說明中放入程式碼，請使用 Markdown 程式碼區塊。

### 從單頁擴充成書

獨立頁面不需要封面或目錄。加入小節可讓讀者跳到該頁的具名位置；主題需要自己的可捲動頁面時，再加入章節。只有新增章節才會讓原始頁面成為書的第一章，原始標題、內容、ID 和開啟連結都不變。

1. 執行 `add-section` 或 `add-chapter` 前，先使用 `sketchbook_read_book`。如果 `book` 是 `null`，第一次編輯時請傳入 `expectedRevision: 0`。下次編輯前，重新讀取書籍或使用上次回傳的修訂版號。
2. 使用 `sketchbook_edit` 將區塊或投影片附加到指定位置，不必重新傳送無關內容；要明確替換區塊時，請用 `replace-block`。省略 `chapterId` 時，編輯會指向第一章。編輯區塊或投影片時，如果既未提供 `chapterId` 也未提供 `sectionId`，會修改原始文件，並使用 `sketchbook_read` 取得的修訂版號。其他操作都會修改書籍附屬檔案，並使用該檔案的修訂版號。兩個修訂版號各自獨立，都不代表兩筆紀錄的共同快照。
3. 用 Viewer 的編號目錄切換章節，或用上一章、下一章按順序閱讀。小節連結會列在目前章節下方，選取後可跳到同一頁的小節。若頁面只有小節、沒有其他章節，目錄就只列出小節。寬螢幕的目錄固定顯示在左側，窄螢幕則放在閱讀頁面上方。章節或小節的連結使用穩定 ID 作為 `chapter` 和／或 `section` 查詢參數。請將原本的存取權杖保留在查詢字串後的 URL 片段中。未指定章節或小節的連結仍會開啟第一章；章節的名稱或順序改變時，ID 不變。連結應保密，且只在目前的 Viewer 工作階段有效。

確切欄位請參閱[編輯操作和目標](skills/sketchbook/references/document-format.md#edit-operations)；驗證步驟請參閱[逐步擴充的驗收流程](docs/acceptance.md#progressive-sketchbook-handoff)。

### 區域網路存取

呼叫 `sketchbook_open`，在同一個可信任的區域網路（LAN）上的裝置開啟它回傳的完整網址。
不必在 Sketchbook 中手動輸入 IP、指定主機參數或設定網路。
修改這份工作副本後，執行 `npm run build`，在 Pi 中執行 `/reload`，再重新開啟文件。

- 唯讀 Viewer 會在 `0.0.0.0` 的隨機連接埠監聽。
  - 這會監聽所有 IPv4 網路介面，不限於區域網路；檢查 HTTP `Host` 不代表會過濾用戶端 IP。
  - 回傳的網址使用作業系統列出、第一個偵測到的非內部私有 IPv4 位址。
  - 私有位址屬於 `10.0.0.0/8`、`172.16.0.0/12` 或 `192.168.0.0/16`。
  - 若找不到私有位址，回傳的網址使用 `127.0.0.1`，但伺服器仍在 `0.0.0.0` 監聽。
  - `0.0.0.0` 是綁定位址，不是另一台裝置要開啟的位址。不支援 IPv6。
- 請求必須使用已偵測到的私有位址或 `127.0.0.1`，並使用 Viewer 的正確連接埠。
  - 如果有 `Origin` 標頭，它必須與該請求允許的 `Host` 相符。
  - 不接受萬用字元、公用位址、主機名稱或未指派給本機的位址作為 `Host`。
  - `Host` 驗證、同源存取和內容安全政策（CSP）會限制瀏覽器的存取。
- HTTP 未加密。
  - 請只在可信任的網路使用，並遵守作業系統的防火牆政策；不要把連接埠開放或轉送到網際網路。
  - 不要在文件裡放入機密資料。
- 請保密完整的 Viewer 網址。資料請求需要 URL 片段中該伺服器專屬的存取權杖。權杖可讀取該 Viewer 工作區內的文件，不只連結指定的那一份。
- VPN 或虛擬網路介面可能影響優先偵測到的私有位址。
  - 自動選到位址不代表第二台裝置能連線。
  - 防火牆政策或 Wi-Fi 用戶端隔離也可能阻擋存取；Sketchbook 不會修改這些設定。
  - 其餘檢查請參閱[區域網路裝置驗收](docs/acceptance.md#lan-device-handoff)。

伺服器啟動監聽時才會記錄位址。如果網路或 DHCP 分配的位址變更，請重新載入 Pi，再開啟文件取得新網址。

### 審閱文章

審閱個別圖表前，先確認完整的標題層級。術語先定義再使用，每張圖只回答一個問題。對照原始資料確認箭頭、決策結果和順序；同一個概念請使用一致的名稱。以桌面寬度和 390px 審閱所有章節和小節，在原本設計的比例下檢查標籤大小、文字換行和區塊內捲動。請分別回報儲存、畫面算繪、可讀性、內容是否符合原始資料，以及人工驗收的結果。

## 加入 Diagram Design HTML

將完整且不需要外部資源的 Diagram Design 產出放在區塊裡，設定 `type: "diagram-html"`、`id`、`title`，以及完整的 `html` 字串。可將這類區塊加到第一頁、小節或章節，組成一本書。Viewer 會把圖形、文字排版和圖說放在一起，不另外加上圖框或視角控制。請參閱 [HTML 規則](skills/sketchbook/references/document-format.md#diagram-design-html)。

匯入或檢視 HTML 不需要 Python。Viewer 可離線運作。只使用 MCP 的用戶端也能讀寫相同格式；如果用戶端不會載入 skill，請自行安排撰寫流程。

## 開啟舊版書籍

結構描述版本 1 仍支援 Markdown、程式碼、Diagram Design HTML 和靜態 SVG 投影片。舊的 `defaultDiagramSource` 欄位可以保留，但會被忽略；不要在新文件中加入它。

這個版本無法算繪 Mermaid 投影片，也不會跳過它們。如果原始頁面、章節或小節包含 Mermaid 投影片，就無法開啟整本書。如果只有書籍附屬檔案含有 Mermaid，仍能單獨讀取格式受支援的原始頁面。Sketchbook 不會轉換或改寫不支援的紀錄。

請備份整個 `.pi/sketchbook/` 目錄，包括 `.json` 和 `.book.json` 檔案。最後一個已驗證可讀取這些書籍完整格式的版本是 `10bc8574615c77f5e2d229850a4340c29cb2bae7`。請另取一份該版本的工作副本，使用 Node.js 26 執行：

```sh
npm ci
npm run build
npm pack
```

安裝產生的本機壓縮套件，或把 MCP 用戶端指向該工作副本的 `dist/mcp-cli.js`。先開啟備份副本。這個舊版也支援 Diagram Design HTML 和靜態 SVG。若重繪包含 Mermaid 的書籍，請另存成一本新書。

## 算繪和安全性

- 匯入的 Diagram Design HTML 會顯示在沒有外框的沙箱頁面中。不支援指令碼、頁面導覽和外部資源；網路字型等外部樣式表會被移除。內部樣式和本機 SVG 定義會留在原頁面內。
- 靜態 SVG 投影片會顯示為獨立的普通圖片，不提供圖表工具列。在窄螢幕上，可在頁面或投影片內水平捲動較寬的圖。
- Markdown 支援行內及獨立區塊的 LaTeX、程式碼區塊和註腳，不支援原始 HTML 或圖片。
  - 註腳的目標範圍只限於所在的 Markdown 區塊或投影片說明。
  - 頁內連結會移動焦點，不會替換 Viewer 的權杖，因此跳轉後的網址仍然有效。
  - KaTeX 使用 `trust: false`、`maxExpand: 1000` 和 `maxSize: 20`。
- Viewer 對所有文件使用 Diagram Design 預設的淺色配色和刊物風格排版。Diagram Design 頁面可以使用 `<body class="sketchbook-default-layout">`，讓版面對齊書籍的閱讀欄。其他匯入頁面會保留原有的邊距、寬度和配色。
- Viewer 隨附字型檔、授權、指令碼、樣式和算繪元件。Instrument Serif、Geist、Geist Mono 和繁體中文 Noto 字型都不需要 CDN；字型缺少某個字元時，瀏覽器會改用系統備用字型。
- Viewer 的網路限制和網址保密規則請參閱[區域網路存取](#區域網路存取)。
- 受支援的內容發生算繪錯誤時，文件的其他部分不會消失。
  - 算繪在瀏覽器主執行緒進行；錯誤處理不會隔離 CPU 資源。

## 檔案與生命週期

工作區將原始頁面儲存在 `.pi/sketchbook/<documentId>.json`；若有小節或額外章節，就儲存在 `.pi/sketchbook/<documentId>.book.json`。受支援的紀錄不需要移轉。替換整份原始頁面時，不會修改附屬檔案。
Sketchbook 只會建立 `.pi/sketchbook/.gitignore` 來排除本機產物，不會修改工作區根目錄的 `.gitignore`。
寫入會檢查修訂版號，並使用程序內的個別紀錄修改佇列和原子性重新命名。沒有跨程序鎖定，也沒有同時涵蓋兩筆紀錄的交易。不要從多個 Pi 或 MCP 程序寫入同一份文件。

只有 `sketchbook_open` 會啟動 Viewer 伺服器。
Pi TUI 和 RPC 工作階段可以開啟 Viewer；Pi 的 print 和 JSON 模式可以讀寫紀錄，但不能開啟 Viewer。
停止 Pi 工作階段或 MCP 伺服器會關閉 Viewer，使網址失效，但不會刪除文件。
重新載入、新建、繼續或分叉工作階段後，請重新開啟文件取得有效網址。
切換工作階段分支或在工作階段樹狀結構中移動，都不會還原磁碟上的文件。若要保留另一個文件分支，請先讀取內容，再以新 ID 建立文件。
第二台實體裝置的區域網路存取、遠端 SSH、容器連接埠轉送，以及 WSLg 或 Windows 瀏覽器存取，都需要在各自的環境中驗證。

## 驗證

從原始碼建置（包括透過 Git 安裝）需要 `tar` 和網路存取，以便下載並驗證固定版本的 Diagram Design 原始碼壓縮檔。建置會將 skill、範本、匯出工具和授權聲明一併打包。預先建置的 npm 套件不會下載上游壓縮檔。

```sh
npm run ci
npx playwright install chromium
npm run test:browser -- --output=test-results/browser
npm pack --dry-run
npm run test:package
```

套件測試會使用臨時儲存庫檢查透過 Git 安裝及更新，也會測試預先建置的 npm 壓縮套件和本機工作副本。它不會修改你的 Pi 設定。

執行 [prek](https://prek.j178.dev/) 的 `prek install`，在這份工作副本啟用 Git hooks。如果 `git config --local --get core.hooksPath` 還回傳舊安裝的 `.husky/_`，請先執行 `git config --local --unset core.hooksPath`。

執行 `npm ci` 後，使用 `prek run --all-files` 執行 Biome 檢查、用 `tsc-rs` 檢查 `tsconfig.tests.json` 的型別，以及用 `zizmor --pedantic --fix .github` 稽核 GitHub Actions 和 Dependabot 設定。prek 會在 hook 環境安裝 `tsc-rs`，不必全域安裝。只有 Zizmor 會修改檔案；如有修正，請在重新提交前檢視並將它們加入暫存區。

在剛安裝的 Linux 系統上，如果缺少瀏覽器所需的系統函式庫，請用 `npx playwright install --with-deps chromium`。
指定瀏覽器測試的輸出目錄，可在 `test-results/` 保留各次審閱的擷取結果。

測試結果請參閱[相容性驗證紀錄](docs/compatibility.md)；人工檢查、未來獲准的模型測試和發行負責人的操作請參閱[驗收指南](docs/acceptance.md)。
自動檢查無法證明畫面已通過人工驗收，也無法證明 skill 能可靠地自動載入。

## 功能範圍和授權

Sketchbook 不提供雲端分享、帳號、即時協作、瀏覽器內編輯、巢狀章節或小節、版本歷史、還原、自動播放、匯出或 HTTP MCP 傳輸。
授權採 GNU Affero General Public License 第 3 版，請參閱 [LICENSE](LICENSE)。
