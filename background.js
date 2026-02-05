// background.js

/**
 * @brief 监听来自 Content Script 和 Offscreen 的消息
 * @param {Object} request 消息体
 * @param {Object} sender 发送者信息
 * @param {Function} send_response 响应回调
 * @return {Boolean} 返回 true 以保持异步通道开启
 */
chrome.runtime.onMessage.addListener((request, sender, send_response) => {
  if (request.action === 'TRIGGER_CLIPBOARD_READ') {
    setup_offscreen_document('offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'READ_CLIPBOARD',
        delay_ms: 80,
        max_attempts: 4
      });
    }).catch(err => {
      console.error('Failed to setup offscreen document:', err);
    });
    send_response({ status: 'processing' });
  } else if (request.action === 'COPY_IMAGE_URL') {
    const url = typeof request.url === 'string' ? request.url : '';
    const text = typeof request.text === 'string' ? request.text : '';
    const page_url = typeof request.page_url === 'string' ? request.page_url : (sender && sender.tab && sender.tab.url ? sender.tab.url : '');
    if (!url) {
      send_response({ status: 'error' });
      return;
    }

    setup_offscreen_document('offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'COPY_IMAGE_URL',
        url,
        text,
        page_url
      }, (resp) => {
        try {
          send_response(resp || { status: 'error' });
        } catch (e) {}
      });
    }).catch(err => {
      console.error('Failed to setup offscreen document:', err);
      send_response({ status: 'error' });
    });
    return true;
  } else if (request.action === 'PROCESS_IMAGE_URL') {
    const url = typeof request.url === 'string' ? request.url : '';
    const text = typeof request.text === 'string' ? request.text : '';
    const page_url = typeof request.page_url === 'string' ? request.page_url : (sender && sender.tab && sender.tab.url ? sender.tab.url : '');
    if (!url) {
      send_response({ status: 'ignored' });
      return;
    }

    setup_offscreen_document('offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'FETCH_IMAGE_URL',
        url,
        text,
        page_url
      });
      send_response({ status: 'processing' });
    }).catch(err => {
      console.error('Failed to setup offscreen document:', err);
      send_response({ status: 'error' });
    });
    return true;
  } else if (request.action === 'SAVE_CLIPBOARD_FROM_OFFSCREEN') {
    handle_save_clipboard(request.data).then(() => {
      send_response({ status: 'saved' });
    });
    return true;
  } else if (request.action === 'SAVE_CLIPBOARD') {
    handle_save_clipboard(request.data).then(() => {
      send_response({ status: 'success' });
    });
    return true;
  } else if (request.action === 'GET_HISTORY') {
    get_history().then((history) => {
      send_response({ history });
    });
    return true;
  } else if (request.action === 'CLEAR_HISTORY') {
    chrome.storage.local.set({ clipboardHistory: [] }).then(() => {
      send_response({ status: 'cleared' });
    }).catch(() => {
      send_response({ status: 'error' });
    });
    return true;
  } else if (request.action === 'DELETE_HISTORY_ITEMS') {
    const ids = Array.isArray(request.ids) ? request.ids : [];
    get_history().then((history) => {
      const id_set = new Set(ids);
      const next = history.filter(item => !id_set.has(item && item.timestamp));
      return chrome.storage.local.set({ clipboardHistory: next }).then(() => {
        send_response({ status: 'deleted' });
      });
    }).catch(() => {
      send_response({ status: 'error' });
    });
    return true;
  }
});

let creating_document; // 锁，防止并发创建

/**
 * @brief 创建并确保 Offscreen Document 存在
 * @param {String} path 文档路径
 * @return {Promise}
 */
async function setup_offscreen_document(path) {
  const offscreen_url = chrome.runtime.getURL(path);
  const existing_contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreen_url]
  });

  if (existing_contexts.length > 0) {
    return;
  }

  if (creating_document) {
    await creating_document;
  } else {
    creating_document = chrome.offscreen.createDocument({
      url: path,
      reasons: ['CLIPBOARD'],
      justification: 'Reading clipboard data for history',
    });
    try {
      await creating_document;
    } finally {
      creating_document = null;
    }
  }
}

/**
 * @brief 处理剪贴板保存逻辑
 * @param {Object} data 剪贴板数据
 * @return {Promise}
 */
async function handle_save_clipboard(data) {
  if (!data || (!data.text && !data.image && !data.image_url)) return;

  const history = await get_history();

  if (!data.type || typeof data.type !== 'string') {
    if (data.text && (data.image || data.image_url)) data.type = 'mixed';
    else if (data.text) data.type = 'text';
    else data.type = 'image';
  }

  if (typeof data.text === 'string' && data.text.length > 5000) {
    data.text = data.text.slice(0, 5000);
  }

  // 1. 智能去重
  const new_history = history.filter(item => !is_same_item(item, data));
  
  // 2. 插入新记录到头部
  data.timestamp = Date.now();
  new_history.unshift(data);

  // 3. 限制数量为 20 条
  if (new_history.length > 20) {
    new_history.length = 20;
  }

  // 4. 持久化存储
  try {
    await chrome.storage.local.set({ clipboardHistory: new_history });
  } catch (err) {
    console.error('Storage quota exceeded or error:', err);
    for (let i = 0; i < 8; i++) {
      if (new_history.length <= 1) break;
      new_history.pop();
      try {
        await chrome.storage.local.set({ clipboardHistory: new_history });
        return;
      } catch (e2) {}
    }
  }
}

/**
 * @brief 判断两个记录是否相同
 * @param {Object} item1 记录1
 * @param {Object} item2 记录2
 * @return {Boolean}
 */
function is_same_item(item1, item2) {
  const type1 = item1 && typeof item1.type === 'string' ? item1.type : '';
  const type2 = item2 && typeof item2.type === 'string' ? item2.type : '';
  if (!type1 || !type2 || type1 !== type2) return false;

  const text1 = item1 && typeof item1.text === 'string' ? item1.text : '';
  const text2 = item2 && typeof item2.text === 'string' ? item2.text : '';
  const img1 = item1 && typeof item1.image === 'string' ? item1.image : '';
  const img2 = item2 && typeof item2.image === 'string' ? item2.image : '';
  const img_url1 = item1 && typeof item1.image_url === 'string' ? item1.image_url : '';
  const img_url2 = item2 && typeof item2.image_url === 'string' ? item2.image_url : '';
  const text_same = (text1 === text2);
  const img_same = (img1 === img2);
  const img_url_same = (img_url1 === img_url2);

  if (type1 === 'mixed') {
    return text_same && (img_same || img_url_same);
  } else if (type1 === 'image') {
    return img_same || img_url_same;
  } else {
    return text_same;
  }
}

/**
 * @brief 获取历史记录
 * @return {Promise<Array>}
 */
async function get_history() {
  if (!chrome.storage || !chrome.storage.local) {
    console.warn('PlugClipboard: chrome.storage.local is not available in background.');
    return [];
  }
  const result = await chrome.storage.local.get(['clipboardHistory']);
  return result.clipboardHistory || [];
}

