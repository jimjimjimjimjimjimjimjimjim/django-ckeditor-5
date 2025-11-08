// 檔案路徑: content/static/content/js/cardlink/plugin.js (v14 最終版)

// 【偵錯】v14：檢查這個檔案是否被 external_plugin_resources 成功載入
import { Plugin } from '@ckeditor/ckeditor5-core';
import { ButtonView } from '@ckeditor/ckeditor5-ui';
console.log('CKEditor Custom Plugin (v14): plugin.js 檔案已載入！');
class CardLinkPlugin extends Plugin {
    static get requires() {
        return [ ];
    }
    // 1. CKEditor 核心會呼叫這個 constructor 並傳入 editor
    constructor(editor) {
        super(editor);
        this.editor = editor;
        // 【偵錯】v14：確認 Class 被實例化
        console.log('CKEditor Custom Plugin (v14): CardLinkPlugin constructor 已執行。');
    }

    // 【v14 關鍵修正】
    // 讓 CKEditor 知道這個 Class 的 "官方名稱"
    // 這必須和 settings.py 中的 'extraPlugins' 和 'external_plugin_resources' 名稱一致
    static get pluginName() {
        return 'cardLink'; // <--- 我們統一使用小寫的 'cardLink'
    }

    // 2. CKEditor 核心會呼叫 init()
    init() {
            const editor = this.editor;
                    
            // 【偵錯】v14：確認 init() 被呼叫
            console.log('CKEditor Custom Plugin (v14): CardLinkPlugin.init() 已執行。');

            editor.ui.componentFactory.add('cardLink', locale => {
                const view = new ButtonView(locale); // ✅ 修正：用 new 建立 ButtonView

                // 設定按鈕屬性
                view.set({
                    label: '插入卡片',
                    withText: true,
                    tooltip: true
                });

                // 綁定按鈕事件
                view.on('execute', () => {
                    console.log('CKEditor Custom Plugin (v14): 按鈕被點擊，開啟 Modal...');
                    showCardSearchModal(editor);
                });

                console.log('CKEditor Custom Plugin (v14): "cardLink" 按鈕已註冊到 componentFactory。');
                return view;
            });
    }
}

// -----------------------------------------------------------------------------
// Modal 輔助函式 (保持不變)
// -----------------------------------------------------------------------------
function showCardSearchModal(editor) {
    // (此函式內容與 v12/v13 相同，不需變更)
    const oldModal = document.getElementById('cardSearchModal');
    if (oldModal) { oldModal.remove(); }
    const modalHtml = `
        <div id="cardSearchModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; padding: 20px; border-radius: 5px; width: 500px;">
                <h3>搜尋並插入卡片</h3>
                <input type="text" id="cardSearchInput" placeholder="輸入卡片名稱..." style="width: 100%; padding: 8px; margin-bottom: 10px;" />
                <div id="cardSearchResults" style="max-height: 300px; overflow-y: auto; border: 1px solid #ccc;"></div>
                <button id="closeCardSearchModal" type="button" style="margin-top: 10px;">關閉</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('closeCardSearchModal').addEventListener('click', function() {
        document.getElementById('cardSearchModal').remove();
    });
    let searchTimeout;
    document.getElementById('cardSearchInput').addEventListener('keyup', function() {
        clearTimeout(searchTimeout);
        const query = this.value;
        const resultsContainer = document.getElementById('cardSearchResults');
        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }
        searchTimeout = setTimeout(function() {
            fetch(`/api/v1/admin/search-products/?q=${query}`)
                .then(response => {
                    if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
                    return response.json();
                })
                .then(results => {
                    displaySearchResults(results, editor);
                })
                .catch(error => {
                    resultsContainer.innerHTML = '<p style="padding: 10px; color: red;">搜尋失敗或您沒有權限。</p>';
                    console.error('CKEditor Search API error:', error);
                });
        }, 300);
    });
}
function displaySearchResults(results, editor) {
    // (此函式內容與 v12/v13 相同，不需變更)
    const resultsContainer = document.getElementById('cardSearchResults');
    resultsContainer.innerHTML = '';
    if (results.length === 0) {
        resultsContainer.innerHTML = '<p style="padding: 10px;">找不到結果。</p>';
        return;
    }
    results.forEach(function(card) {
        const resultItem = document.createElement('div');
        resultItem.style = "padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; align-items: center;";
        resultItem.innerHTML = `
            <img src="${card.image_url || ''}" style="width: 40px; height: auto; margin-right: 10px;">
            <span>${card.name} (${card.product_code})</span>
        `;
        resultItem.addEventListener('click', function() {
            const htmlToInsert = `<a href="#" class="card-link" data-product-code="${card.product_code}">${card.name}</a>&nbsp;`;
            editor.model.change(writer => {
                const viewFragment = editor.data.processor.toView(htmlToInsert);
                const modelFragment = editor.data.toModel(viewFragment);
                editor.model.insertContent(modelFragment, editor.model.document.selection);
            });
            document.getElementById('cardSearchModal').remove();
        });
        resultsContainer.appendChild(resultItem);
    });
}
export default CardLinkPlugin;
