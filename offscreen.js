// offscreen.js

/**
 * @brief 监听来自后台的消息
 */
chrome.runtime.onMessage.addListener((message, sender, send_response) => {
  if (message.target !== 'offscreen') return;

  (async () => {
    if (message.type === 'READ_CLIPBOARD') {
      const delay_ms = typeof message.delay_ms === 'number' ? message.delay_ms : 0;
      const max_attempts = typeof message.max_attempts === 'number' ? message.max_attempts : 3;
      await read_clipboard_and_send_back({ delay_ms, max_attempts });
      return;
    }

    if (message.type === 'FETCH_IMAGE_URL') {
      const url = typeof message.url === 'string' ? message.url : '';
      const text = typeof message.text === 'string' ? message.text : '';
      const page_url = typeof message.page_url === 'string' ? message.page_url : '';
      if (url) {
        await fetch_image_url_and_send_back({ url, text, page_url });
      }
      return;
    }

    if (message.type === 'COPY_IMAGE_URL') {
      const url = typeof message.url === 'string' ? message.url : '';
      const text = typeof message.text === 'string' ? message.text : '';
      const page_url = typeof message.page_url === 'string' ? message.page_url : '';
      const ok = await copy_image_url_to_clipboard({ url, text, page_url });
      try {
        send_response({ status: ok ? 'ok' : 'error' });
      } catch (e) {}
      return;
    }
  })();

  return true;
});

/**
 * @brief 读取剪贴板并发送回后台
 * @return {Promise}
 */
async function read_clipboard_and_send_back(options) {
  try {
    // 1. 尝试聚焦
    const target = document.getElementById('paste-target');
    if (!target) return;
    target.focus();

    // 2. 尝试使用 Clipboard API 读取
    const delay_ms = options && typeof options.delay_ms === 'number' ? options.delay_ms : 0;
    const max_attempts = options && typeof options.max_attempts === 'number' ? options.max_attempts : 3;
    const wait_ms = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    if (delay_ms > 0) await wait_ms(delay_ms);

    for (let attempt = 0; attempt < max_attempts; attempt++) {
      try {
        const items = await navigator.clipboard.read();
        const saved = await process_clipboard_items(items);
        if (saved) return;
      } catch (api_err) {}
      await wait_ms(60);
    }

    // 3. 降级方案：使用 execCommand('paste')
    target.innerText = '';
    target.focus();

    for (let attempt = 0; attempt < max_attempts; attempt++) {
      const paste_promise = new Promise((resolve) => {
        const handler = (e) => {
          document.removeEventListener('paste', handler);
          resolve(e && e.clipboardData ? e.clipboardData : null);
        };
        document.addEventListener('paste', handler);
        setTimeout(() => {
          document.removeEventListener('paste', handler);
          resolve(null);
        }, 250);
      });

      const success = document.execCommand('paste');
      const clipboard_data = success ? await paste_promise : null;
      if (clipboard_data && clipboard_data.items && clipboard_data.items.length > 0) {
        const saved = await process_data_transfer_items(clipboard_data.items);
        if (saved) return;
      }

      await wait_ms(80);
    }

  } catch (err) {
    console.error('Offscreen: General failure:', err);
  }
}

async function fetch_image_url_and_send_back(options) {
  try {
    const url = options && typeof options.url === 'string' ? options.url : '';
    const text = options && typeof options.text === 'string' ? options.text : '';
    const page_url = options && typeof options.page_url === 'string' ? options.page_url : '';
    if (!url) return;

    const wait_ms = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const max_attempts = 3;
    let last_error = null;

    for (let attempt = 0; attempt < max_attempts; attempt++) {
      try {
        const init = { cache: 'no-store', credentials: 'include' };
        if (page_url) {
          init.referrer = page_url;
          init.referrerPolicy = 'strict-origin-when-cross-origin';
        }
        const res = await fetch(url, init);
        if (!res || !res.ok) throw new Error('Image fetch failed');
        const blob = await res.blob();
        const mime = blob && typeof blob.type === 'string' ? blob.type : '';
        const url_is_image = is_image_url(url);
        if ((!mime || !mime.startsWith('image/')) && !url_is_image) throw new Error('Not an image response');

        const data = {};
        if (text) data.text = text;
        data.image_url = url;
        data.image = await compress_image(blob);
        data.image_type = mime;
        send_data(data);
        return;
      } catch (e) {
        last_error = e;
      }

      await wait_ms(80);
    }

    if (last_error) {
      const data = {};
      if (text) data.text = text;
      data.image_url = url;
      send_data(data);
    }
  } catch (e) {}
}

function is_image_url(url) {
  try {
    const u = new URL(url);
    const p = u.pathname || '';
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(p);
  } catch (e) {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url);
  }
}

/**
 * @brief 处理通过 Clipboard API 获取的项
 * @param {Array<ClipboardItem>} items 
 * @return {Promise}
 */
async function process_clipboard_items(items) {
  let has_data = false;
  for (const item of items) {
    const data = {};
    
    // 检查文本
    if (item.types.includes('text/plain')) {
      try {
        const blob = await item.getType('text/plain');
        data.text = await blob.text();
      } catch (e) {
        console.error('Failed to get text/plain blob:', e);
      }
    }
    
    // 检查图片
    const img_type = item.types.find(t => t.startsWith('image/'));
    if (img_type) {
      try {
        const blob = await item.getType(img_type);
        data.image = await compress_image(blob);
        data.image_type = img_type;
      } catch (e) {
        console.error('Failed to process image blob:', e);
      }
    }
    
    if (data.text || data.image) {
      send_data(data);
      has_data = true;
      break; 
    }
  }
  if (!has_data) console.debug('Offscreen: No data found via API');
  return has_data;
}

/**
 * @brief 处理通过 Paste 事件获取的项
 * @param {DataTransferItemList} items 
 * @return {Promise}
 */
async function process_data_transfer_items(items) {
  let has_data = false;
  const data = {};

  // 打印调试信息，帮助定位问题
  // console.log('Offscreen: Processing', items.length, 'items');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // console.log(`Item ${i}: kind=${item.kind}, type=${item.type}`);
    
    // 放宽检查：只要 type 匹配即可，不强制检查 kind（虽然规范说应该是 string/file，但兼容性优先）
    if (item.type === 'text/plain') {
      await new Promise(resolve => item.getAsString(s => {
        data.text = s;
        resolve();
      }));
    } else if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) {
        try {
          data.image = await compress_image(blob);
          data.image_type = item.type;
        } catch (e) {
          console.error('Failed to compress image from paste event:', e);
        }
      }
    }
  }

  if (data.text || data.image) {
    send_data(data);
    has_data = true;
  }
  
  if (!has_data) console.debug('Offscreen: No valid text or image data found in paste event');
  return has_data;
}

async function copy_image_url_to_clipboard(options) {
  try {
    const url = options && typeof options.url === 'string' ? options.url : '';
    const text = options && typeof options.text === 'string' ? options.text : '';
    const page_url = options && typeof options.page_url === 'string' ? options.page_url : '';
    if (!url) return false;

    const init = { cache: 'no-store', credentials: 'include' };
    if (page_url) {
      init.referrer = page_url;
      init.referrerPolicy = 'strict-origin-when-cross-origin';
    }

    const res = await fetch(url, init);
    if (!res || !res.ok) return false;
    const blob = await res.blob();
    const mime = blob && typeof blob.type === 'string' ? blob.type : '';
    const url_is_image = is_image_url(url);
    if ((!mime || !mime.startsWith('image/')) && !url_is_image) return false;

    const items = {};
    if (text) {
      items['text/plain'] = new Blob([text], { type: 'text/plain' });
    }

    if (mime === 'image/png') {
      items['image/png'] = blob;
    } else {
      const png = await to_png_blob(blob);
      items['image/png'] = png;
    }

    await navigator.clipboard.write([new ClipboardItem(items)]);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * @brief 将数据发送回后台
 * @param {Object} data 
 */
function send_data(data) {
  if (data.text && (data.image || data.image_url)) data.type = 'mixed';
  else if (data.text) data.type = 'text';
  else if (data.image || data.image_url) data.type = 'image';

  if (data.type) {
    chrome.runtime.sendMessage({
      action: 'SAVE_CLIPBOARD_FROM_OFFSCREEN',
      data: data
    });
  }
}

/**
 * @brief 图片压缩辅助函数
 * @param {Blob} blob 原始图片 Blob
 * @return {Promise<String>} Base64 字符串
 */
function compress_image(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const MAX_SIZE = 320;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

async function to_png_blob(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.drawImage(bitmap, 0, 0);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Failed to convert to png');
    return png;
  }

  const object_url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = object_url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.drawImage(img, 0, 0);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Failed to convert to png');
    return png;
  } finally {
    URL.revokeObjectURL(object_url);
  }
}
