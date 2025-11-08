// 【偵錯】v14：檢查這個檔案是否被 external_plugin_resources 成功載入
import { Plugin } from '@ckeditor/ckeditor5-core';
import { ButtonView } from '@ckeditor/ckeditor5-ui';

let searchTimeout;
let currentQuery = '';
let currentOffset = 0;
const LIMIT = 10; // 每次載入 10 筆
let isLoading = false;
let hasMore = true;

class CardLinkPlugin extends Plugin {
    static get requires() {
        return [ ];
    }
    // 1. CKEditor 核心會呼叫這個 constructor 並傳入 editor
    constructor(editor) {
        super(editor);
        this.editor = editor;
    }
    static get pluginName() {
        return 'cardLink'; // <--- 我們統一使用小寫的 'cardLink'
    }

    // 2. CKEditor 核心會呼叫 init()
    init() {
            const editor = this.editor;

            editor.ui.componentFactory.add('cardLink', locale => {
                const view = new ButtonView(locale);
                view.set({
                    label: '插入卡片',
                    withText: true,
                    tooltip: true
                });

                view.on('execute', () => {
                    showCardSearchModal(editor);
                });
                return view;
            });
    }
}

// -----------------------------------------------------------------------------
// Modal 輔助函式 (保持不變)
// -----------------------------------------------------------------------------
function showCardSearchModal(editor) {
    // 【需求 4】在開啟 Modal 前，先取得目前反白的文字
    const selection = editor.model.document.selection;
    let selectedText = '';
    
    if (!selection.isCollapsed) {
        for (const range of selection.getRanges()) {
            for (const item of range.getItems()) {
                if (item.is('textProxy')) {
                    selectedText += item.data;
                }
            }
        }
    }

    // 移除舊 Modal (如果有的話)
    const oldModal = document.getElementById('cardSearchModal');
    if (oldModal) { oldModal.remove(); }

    // 【需求 1 - 樣式修正】 + 【需求 4 - 鑲嵌字串欄位】
    const modalHtml = `
        <style>
            #cardSearchModal, #cardSearchModal h3 {
                color: #333; /* 修正：Modal 預設文字顏色 */
            }
            #cardSearchModal input::placeholder {
                color: #999;
            }
            #cardSearchModal input {
                color: #222; /* 修正：Input 輸入文字顏色 */
                border: 1px solid #ccc;
                padding: 8px;
            }
            #cardSearchResults {
                background: #fdfdfd;
            }
            .card-result-item {
                display: flex;
                align-items: center;
                padding: 10px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
            }
            .card-result-item:hover {
                background: #f4f4f4;
            }
            .card-result-item img {
                width: 50px; /* 加大圖片 */
                height: auto;
                margin-right: 15px;
                flex-shrink: 0;
            }
            .card-result-details {
                display: flex;
                flex-direction: column;
                justify-content: center;
                flex-grow: 1;
                color: #333; /* 修正：結果文字顏色 */
            }
            .card-row-1 {
                font-size: 1.1em;
                font-weight: bold;
                color: #222;
            }
            .card-row-2 {
                font-size: 0.9em;
                color: #555;
            }
            .card-row-3 {
                font-size: 0.9em;
                margin-top: 5px;
            }
            .stock-zero {
                color: #D9534F; /* 需求 3：庫存為 0 的紅色 */
                font-weight: bold;
            }
            #cardSearchSpinner {
                display: none; /* 預設隱藏 spinner */
                text-align: center;
                padding: 10px;
            }
        </style>
        
        <div id="cardSearchModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; padding: 20px; border-radius: 5px; width: 600px;">
                <h3>搜尋並插入卡片</h3>
                
                <input type="text" id="cardSearchInput" placeholder="輸入卡片名稱..." style="width: 100%; margin-bottom: 5px;" />
                
                <input type="text" id="cardAnchorTextInput" value="${escapeHtml(selectedText)}" placeholder="鑲嵌字串 (預設為卡片名稱)" style="width: 100%; margin-top: 5px;" />
                
                <div id="cardSearchResults" style="max-height: 400px; overflow-y: auto; border: 1px solid #ccc; margin-top: 10px;">
                    </div>
                
                <div id="cardSearchSpinner"><p>載入中...</p></div>
                
                <button id="closeCardSearchModal" type="button" style="margin-top: 10px;">關閉</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 綁定關閉按鈕
    document.getElementById('closeCardSearchModal').addEventListener('click', function() {
        document.getElementById('cardSearchModal').remove();
    });

    // -----------------------------------------------------
    // 【需求 2：捲動載入】
    // -----------------------------------------------------
    const resultsContainer = document.getElementById('cardSearchResults');

    // 1. 綁定捲動事件
    resultsContainer.addEventListener('scroll', () => {
        // 檢查是否快捲到底部、是否不在載入中、是否還有更多資料
        const tolerance = 150; // 提前 150px 觸發
        if (!isLoading && hasMore && (resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - tolerance)) {
            currentOffset += LIMIT; // 增加 offset
            fetchCardResults(editor, currentQuery, currentOffset, true); // 附加模式
        }
    });

    // 2. 綁定搜尋 Input 事件
    document.getElementById('cardSearchInput').addEventListener('keyup', function() {
        clearTimeout(searchTimeout);
        const query = this.value;

        if (query.length < 2) {
            resultsContainer.innerHTML = ''; // 清空舊結果
            currentQuery = '';
            currentOffset = 0;
            hasMore = true;
            return;
        }

        // 延遲 300ms 執行
        searchTimeout = setTimeout(() => {
            currentQuery = query; // 更新當前查詢
            currentOffset = 0;    // 重設 offset
            hasMore = true;       // 重設
            fetchCardResults(editor, currentQuery, 0, false); // 首次查詢 (非附加模式)
        }, 300);
    });
}

// -----------------------------------------------------------------------------
// API 呼叫函式 (需求 2)
// -----------------------------------------------------------------------------
function fetchCardResults(editor, query, offset, isAppending) {
    if (isLoading) return; // 防止重複載入
    isLoading = true;

    // 顯示 Spinner
    const spinner = document.getElementById('cardSearchSpinner');
    if (spinner) spinner.style.display = 'block';
    
    // 準備 API URL (包含 offset 和 limit)
    const apiUrl = `/api/v1/admin/search-products/?q=${encodeURIComponent(query)}&offset=${offset}&limit=${LIMIT}`;

    fetch(apiUrl)
        .then(response => {
            if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
            return response.json();
        })
        .then(results => {
            // 如果 results 不是陣列 (可能是 {count: ..., results: ...})
            // 我們假設 API 直接回傳陣列
            // 如果 API 回傳 {count: X, next: URL, results: []}，這裡需要修改
            const cardList = Array.isArray(results) ? results : (results.results || []);

            // 檢查是否還有更多資料
            if (cardList.length < LIMIT) {
                hasMore = false;
            }

            // 顯示結果
            displaySearchResults(editor, cardList, isAppending);
        })
        .catch(error => {
            const resultsContainer = document.getElementById('cardSearchResults');
            if (resultsContainer && !isAppending) {
                resultsContainer.innerHTML = '<p style="padding: 10px; color: red;">搜尋失敗或您沒有權限。</p>';
            }
            console.error('CKEditor Search API error:', error);
            hasMore = false;
        })
        .finally(() => {
            isLoading = false;
            // 隱藏 Spinner
            if (spinner) spinner.style.display = 'none';
        });
}

// -----------------------------------------------------------------------------
// 顯示搜尋結果 (需求 3, 4)
// -----------------------------------------------------------------------------
function displaySearchResults(editor, results, isAppending) {
    const resultsContainer = document.getElementById('cardSearchResults');
    
    // 如果不是附加模式，先清空
    if (!isAppending) {
        resultsContainer.innerHTML = '';
    }

    if (results.length === 0 && !isAppending) {
        resultsContainer.innerHTML = '<p style="padding: 10px;">找不到結果。</p>';
        return;
    }

    results.forEach(function(card) {
        const resultItem = document.createElement('div');
        resultItem.className = 'card-result-item'; // 使用 class
        
        // 【需求 3：處理庫存和價格】
        const priceText = card.price_twd ? `$${card.price_twd}` : 'N/A';
        const stockClass = card.internal_stock === 0 ? 'stock-zero' : '';
        const stockText = `剩下${card.internal_stock}張`;

        // 【需求 3：修改為三列式排版】
        resultItem.innerHTML = `
            <img src="${card.image_url || ''}" alt="${card.base_name}">
            <div class="card-result-details">
                <div class="card-row-1">
                    (${card.product_code}) ${card.base_name}
                </div>
                <div class="card-row-2">
                    ${card.card_number} (${card.rarity}) [${card.condition}] ${card.language}
                </div>
                <div class="card-row-3">
                    ${priceText} <span class="${stockClass}">${stockText}</span>
                </div>
            </div>
        `;

        // 【需求 4：修改點擊插入邏輯】
        resultItem.addEventListener('click', function() {
            // 1. 取得鑲嵌字串 input 的目前值
            let anchorText = document.getElementById('cardAnchorTextInput').value;

            // 2. 如果 input 是空的 (使用者沒選取也沒輸入)，則使用卡片名稱 (base_name)
            if (!anchorText) {
                anchorText = card.base_name;
            }

            // 3. 產生最終 HTML (使用 anchorText)
            const htmlToInsert = `<a href="#" class="card-link" data-product-code="${card.product_code}">${escapeHtml(anchorText)}</a>&nbsp;`;

            // 4. 插入內容 (這會自動取代反白區域)
            editor.model.change(writer => {
                const viewFragment = editor.data.processor.toView(htmlToInsert);
                const modelFragment = editor.data.toModel(viewFragment);
                editor.model.insertContent(modelFragment, editor.model.document.selection);
            });
            
            // 關閉 Modal
            document.getElementById('cardSearchModal').remove();
        });
        
        resultsContainer.appendChild(resultItem);
    });
}


// -----------------------------------------------------------------------------
// 輔助工具函式 (需求 4)
// -----------------------------------------------------------------------------
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) {
        return '';
    }
    return unsafe
         .toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
export default CardLinkPlugin;
