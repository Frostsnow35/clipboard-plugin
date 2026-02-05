// content.js

(function() {
  try {
    function is_extension_context_valid() {
      try {
        return !!(chrome && chrome.runtime && chrome.runtime.id);
      } catch (e) {
        return false;
      }
    }

    if (!is_extension_context_valid()) {
      return;
    }

    if (window.plug_clipboard_injected) return;
    window.plug_clipboard_injected = true;

    const STORAGE_KEY = 'clipboardHistory';
    const MAX_HISTORY = 20;
    let last_image_url = null;
    let last_image_at = 0;
    let last_sent_image_url = null;
    let last_sent_image_at = 0;
    let selection_mode = false;
    let selected_ids = new Set();
    let modal_open = false;
    let wheel_abort_controller = null;
    function is_panel_visible() {
      try {
        return panel && panel.style && panel.style.display !== 'none';
      } catch (e) {
        return false;
      }
    }

    // --- 1. 监听复制事件 ---
    document.addEventListener('copy', async (e) => {
      try {
        if (!is_extension_context_valid()) return;
        if (e && e.isTrusted === false) return;

        const selected_text = get_selected_text();
        const image_url = get_candidate_image_url();
        if (image_url) {
          chrome.runtime.sendMessage({
            action: 'PROCESS_IMAGE_URL',
            url: image_url,
            text: selected_text || '',
            page_url: location.href
          });
          return;
        }

        if (selected_text) {
          chrome.runtime.sendMessage({
            action: 'SAVE_CLIPBOARD',
            data: { type: 'text', text: selected_text }
          });
          return;
        }

        try {
          const items = await navigator.clipboard.read();
          const data = await extract_clipboard_items(items);
          if (data) {
            chrome.runtime.sendMessage({
              action: 'SAVE_CLIPBOARD',
              data
            });
            return;
          }
        } catch (e) {}

        chrome.runtime.sendMessage({
          action: 'TRIGGER_CLIPBOARD_READ'
        });
      } catch (e) {}
    });

  document.addEventListener('contextmenu', (e) => {
    try {
      if (!is_extension_context_valid()) return;
      if (e && e.isTrusted === false) return;
      const img = e.target && e.target.closest ? e.target.closest('img') : null;
      const url = img ? (img.currentSrc || img.src) : null;
      if (url) {
        last_image_url = url;
        last_image_at = Date.now();
        maybe_send_image_url(url);
      }
    } catch (e) {}
  }, true);

  document.addEventListener('pointerdown', (e) => {
    try {
      if (!is_extension_context_valid()) return;
      if (e && e.isTrusted === false) return;
      const img = e.target && e.target.closest ? e.target.closest('img') : null;
      const url = img ? (img.currentSrc || img.src) : null;
      if (url) {
        last_image_url = url;
        last_image_at = Date.now();
      }
    } catch (e) {}
  }, true);

  function maybe_send_image_url(url) {
    const now = Date.now();
    if (last_sent_image_url === url && (now - last_sent_image_at) < 1500) return;
    last_sent_image_url = url;
    last_sent_image_at = now;

    try {
      if (!is_extension_context_valid()) return;
      chrome.runtime.sendMessage({
        action: 'PROCESS_IMAGE_URL',
        url: normalize_url(url),
        text: get_selected_text() || '',
        page_url: location.href
      });
    } catch (e) {}
  }

  function get_selected_text() {
    try {
      const selection = document.getSelection();
      const selected = selection ? (selection.toString() || '') : '';
      if (selected) return selected;

      const el = document.activeElement;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
        const start = typeof el.selectionStart === 'number' ? el.selectionStart : 0;
        const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : 0;
        const value = typeof el.value === 'string' ? el.value : '';
        if (end > start) return value.slice(start, end);
      }

      return '';
    } catch (e) {
      return '';
    }
  }

  function get_candidate_image_url() {
    try {
      const selection = document.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const frag = range.cloneContents();
        const img = frag && frag.querySelector ? frag.querySelector('img') : null;
        const raw = img ? (img.currentSrc || img.src) : null;
        if (raw) return normalize_url(raw);
      }
    } catch (e) {}

    if (last_image_url && (Date.now() - last_image_at) < 1500) {
      return normalize_url(last_image_url);
    }

    return null;
  }
  
  function normalize_url(raw) {
    try {
      return new URL(raw, location.href).href;
    } catch (e) {
      return raw;
    }
  }

  // --- 2. UI 注入 (Shadow DOM) ---
  const existing_host = document.getElementById('plug-clipboard-host');
  if (existing_host) existing_host.remove();

  const host = document.createElement('div');
  host.id = 'plug-clipboard-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const parent = document.body || document.documentElement;
  if (!parent) return;
  parent.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  if (is_extension_context_valid()) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content.css');
    shadow.appendChild(link);
  }

  const container = document.createElement('div');
  container.className = 'pc-container';
  
  const floating_btn = document.createElement('div');
  floating_btn.className = 'pc-floating-btn';
  floating_btn.innerText = '📋'; 
  floating_btn.title = '查看剪贴板历史';
  
  const panel = document.createElement('div');
  panel.className = 'pc-panel';
  panel.style.display = 'none'; 

  const panel_header = document.createElement('div');
  panel_header.className = 'pc-panel-header';
  panel_header.innerHTML = '<span class="pc-title">剪贴板历史</span><span class="pc-meta"><span class="pc-count"></span><span class="pc-actions"><button class="pc-btn pc-btn-select" type="button">选择</button><button class="pc-btn pc-btn-danger pc-btn-delete" type="button" disabled>删除</button><button class="pc-btn pc-btn-danger pc-btn-clear" type="button">清空</button></span><span class="pc-close">×</span></span>';

  const list_container = document.createElement('ul');
  list_container.className = 'pc-list';

  panel.appendChild(panel_header);
  panel.appendChild(list_container);
  const scroll_bar = document.createElement('div');
  scroll_bar.className = 'pc-scrollbar';
  const scroll_thumb = document.createElement('div');
  scroll_thumb.className = 'pc-scroll-thumb';
  scroll_bar.appendChild(scroll_thumb);
  panel.appendChild(scroll_bar);
  const modal_mask = document.createElement('div');
  modal_mask.className = 'pc-modal-mask';
  const modal = document.createElement('div');
  modal.className = 'pc-modal';
  const modal_title = document.createElement('div');
  modal_title.className = 'pc-modal-title';
  const modal_desc = document.createElement('div');
  modal_desc.className = 'pc-modal-desc';
  const modal_actions = document.createElement('div');
  modal_actions.className = 'pc-modal-actions';
  const modal_cancel = document.createElement('button');
  modal_cancel.type = 'button';
  modal_cancel.className = 'pc-btn';
  modal_cancel.innerText = '取消';
  const modal_ok = document.createElement('button');
  modal_ok.type = 'button';
  modal_ok.className = 'pc-btn pc-btn-danger';
  modal_ok.innerText = '确认';
  modal_actions.appendChild(modal_cancel);
  modal_actions.appendChild(modal_ok);
  modal.appendChild(modal_title);
  modal.appendChild(modal_desc);
  modal.appendChild(modal_actions);
  modal_mask.appendChild(modal);
  container.appendChild(modal_mask);
  container.appendChild(floating_btn);
  container.appendChild(panel);
  shadow.appendChild(container);

  // --- 3. 交互逻辑 ---
  const btn_close = panel_header.querySelector('.pc-close');
  const btn_select = panel_header.querySelector('.pc-btn-select');
  const btn_delete = panel_header.querySelector('.pc-btn-delete');
  const btn_clear = panel_header.querySelector('.pc-btn-clear');

  function set_panel_visible(visible) {
    try {
      panel.style.display = visible ? 'flex' : 'none';
      if (visible) enable_wheel_handlers();
      else disable_wheel_handlers();
    } catch (e) {}
  }

  function set_selection_mode(enabled) {
    selection_mode = !!enabled;
    if (!selection_mode) selected_ids = new Set();
    try {
      if (btn_select) btn_select.innerText = selection_mode ? '取消' : '选择';
    } catch (e) {}
    update_action_state();
    if (is_panel_visible()) render_history();
  }

  function update_action_state() {
    try {
      const count = selected_ids ? selected_ids.size : 0;
      if (btn_delete) {
        btn_delete.disabled = !selection_mode || count === 0;
        btn_delete.innerText = count > 0 ? `删除(${count})` : '删除';
      }
    } catch (e) {}
  }

  function open_confirm_dialog(title, desc) {
    return new Promise((resolve) => {
      try {
        if (modal_open) {
          resolve(false);
          return;
        }
        modal_open = true;
        modal_title.innerText = title || '确认操作';
        modal_desc.innerText = desc || '';
        modal_mask.style.display = 'flex';

        const done = (ok) => {
          try {
            modal_open = false;
            modal_mask.style.display = 'none';
          } catch (e) {}
          resolve(!!ok);
        };

        const on_cancel = (e) => {
          try { e && e.stopPropagation && e.stopPropagation(); } catch (e2) {}
          cleanup();
          done(false);
        };
        const on_ok = (e) => {
          try { e && e.stopPropagation && e.stopPropagation(); } catch (e2) {}
          cleanup();
          done(true);
        };
        const on_mask = (e) => {
          try {
            if (e && e.target === modal_mask) {
              cleanup();
              done(false);
            }
          } catch (e2) {}
        };

        const cleanup = () => {
          try {
            modal_cancel.removeEventListener('click', on_cancel);
            modal_ok.removeEventListener('click', on_ok);
            modal_mask.removeEventListener('click', on_mask);
          } catch (e2) {}
        };

        modal_cancel.addEventListener('click', on_cancel);
        modal_ok.addEventListener('click', on_ok);
        modal_mask.addEventListener('click', on_mask);
      } catch (e) {
        modal_open = false;
        resolve(false);
      }
    });
  }

  floating_btn.addEventListener('click', (e) => {
    try {
      if (!is_extension_context_valid()) return;
      e.stopPropagation();
      const is_visible = is_panel_visible();
      if (!is_visible) {
        render_history();
        set_panel_visible(true);
        schedule_update_scrollbar();
      } else {
        set_panel_visible(false);
      }
    } catch (e) {}
  });

  btn_close.addEventListener('click', () => {
    try {
      set_panel_visible(false);
    } catch (e) {}
  });

  // 点击外部关闭面板
  document.addEventListener('click', (e) => {
    try {
      if (!is_extension_context_valid()) return;
      if (is_panel_visible()) {
        const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
        if (!path.includes(container)) {
          set_panel_visible(false);
        }
      }
    } catch (e) {}
  });
  
  container.addEventListener('click', (e) => {
    try {
      e.stopPropagation();
    } catch (e) {}
  });

  btn_select.addEventListener('click', (e) => {
    try {
      e.stopPropagation();
      if (!is_extension_context_valid()) return;
      set_selection_mode(!selection_mode);
    } catch (e2) {}
  });

  btn_clear.addEventListener('click', async (e) => {
    try {
      e.stopPropagation();
      if (!is_extension_context_valid()) return;
      const ok = await open_confirm_dialog('清空历史记录', '确认清空全部记录，此操作不可撤销');
      if (!ok) return;
      chrome.runtime.sendMessage({ action: 'CLEAR_HISTORY' }, () => {
        try {
          selected_ids = new Set();
          selection_mode = false;
          update_action_state();
          if (is_panel_visible()) render_history();
        } catch (e3) {}
      });
    } catch (e2) {}
  });

  btn_delete.addEventListener('click', async (e) => {
    try {
      e.stopPropagation();
      if (!is_extension_context_valid()) return;
      if (!selection_mode) return;
      const ids = Array.from(selected_ids || []);
      if (ids.length === 0) return;
      const ok = await open_confirm_dialog('删除记录', `确认删除选中的 ${ids.length} 条记录，此操作不可撤销`);
      if (!ok) return;
      chrome.runtime.sendMessage({ action: 'DELETE_HISTORY_ITEMS', ids }, () => {
        try {
          selected_ids = new Set();
          selection_mode = false;
          update_action_state();
          if (is_panel_visible()) render_history();
        } catch (e3) {}
      });
    } catch (e2) {}
  });

  function update_scrollbar() {
    try {
      const header_h = panel_header.getBoundingClientRect().height || 0;
      scroll_bar.style.top = `${Math.ceil(header_h)}px`;
      scroll_bar.style.bottom = '0px';

      const scroll_h = list_container.scrollHeight;
      const client_h = list_container.clientHeight;
      const max_scroll = scroll_h - client_h;

      scroll_bar.style.display = 'block';

      if (!scroll_h || client_h <= 0 || max_scroll <= 1) {
        scroll_thumb.style.height = `${Math.max(24, client_h)}px`;
        scroll_thumb.style.transform = `translateY(0px)`;
        return;
      }

      const ratio = client_h / scroll_h;
      const thumb_h = Math.max(24, Math.floor(client_h * ratio));
      const max_thumb_top = Math.max(1, client_h - thumb_h);
      const thumb_top = Math.floor((list_container.scrollTop / max_scroll) * max_thumb_top);
      scroll_thumb.style.height = `${thumb_h}px`;
      scroll_thumb.style.transform = `translateY(${thumb_top}px)`;
    } catch (e) {}
  }

  function schedule_update_scrollbar() {
    try {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          update_scrollbar();
        });
      });
    } catch (e) {}
  }

  function apply_wheel_scroll(delta_y) {
    try {
      const before = list_container.scrollTop;
      list_container.scrollTop = before + delta_y;
      if (list_container.scrollTop !== before) update_scrollbar();
    } catch (e) {}
  }

  function disable_wheel_handlers() {
    try {
      if (wheel_abort_controller) {
        wheel_abort_controller.abort();
        wheel_abort_controller = null;
      }
    } catch (e) {
      wheel_abort_controller = null;
    }
  }

  function enable_wheel_handlers() {
    try {
      disable_wheel_handlers();
      wheel_abort_controller = new AbortController();
      const signal = wheel_abort_controller.signal;

      const wheel_on_event = (e) => {
        try {
          if (!is_panel_visible()) return;
          if (modal_open) return;
          const scroll_h = list_container.scrollHeight;
          const client_h = list_container.clientHeight;
          if (!scroll_h || !client_h || (scroll_h - client_h) <= 1) return;

          const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
          if (!path.includes(panel) && !path.includes(list_container) && !path.includes(scroll_bar) && !path.includes(scroll_thumb)) return;

          apply_wheel_scroll(e.deltaY);
          e.preventDefault();
          e.stopPropagation();
        } catch (e2) {}
      };

      panel.addEventListener('wheel', wheel_on_event, { passive: false, signal });
      window.addEventListener('wheel', wheel_on_event, { passive: false, capture: true, signal });
    } catch (e) {}
  }

  list_container.addEventListener('scroll', () => {
    update_scrollbar();
  }, { passive: true });

  let dragging_thumb = false;
  let drag_start_y = 0;
  let drag_start_scroll_top = 0;
  let drag_thumb_h = 0;

  function start_drag(e) {
    try {
      const scroll_h = list_container.scrollHeight;
      const client_h = list_container.clientHeight;
      if (!scroll_h || client_h <= 0) return;
      const ratio = client_h / scroll_h;
      drag_thumb_h = Math.max(24, Math.floor(client_h * ratio));
      dragging_thumb = true;
      drag_start_y = e.clientY;
      drag_start_scroll_top = list_container.scrollTop;
      scroll_thumb.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}
  }

  function move_drag(e) {
    try {
      if (!dragging_thumb) return;
      const scroll_h = list_container.scrollHeight;
      const client_h = list_container.clientHeight;
      const max_scroll = scroll_h - client_h;
      const max_thumb_top = Math.max(1, client_h - drag_thumb_h);
      const delta = e.clientY - drag_start_y;
      const scroll_delta = (delta / max_thumb_top) * max_scroll;
      list_container.scrollTop = drag_start_scroll_top + scroll_delta;
      update_scrollbar();
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}
  }

  function end_drag(e) {
    try {
      if (!dragging_thumb) return;
      dragging_thumb = false;
      try {
        scroll_thumb.releasePointerCapture(e.pointerId);
      } catch (e2) {}
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}
  }

  scroll_thumb.addEventListener('pointerdown', start_drag);
  scroll_thumb.addEventListener('pointermove', move_drag);
  scroll_thumb.addEventListener('pointerup', end_drag);
  scroll_thumb.addEventListener('pointercancel', end_drag);

  scroll_bar.addEventListener('pointerdown', (e) => {
    try {
      if (e.target === scroll_thumb) return;
      const rect = scroll_bar.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const scroll_h = list_container.scrollHeight;
      const client_h = list_container.clientHeight;
      const max_scroll = scroll_h - client_h;
      if (max_scroll <= 0) return;

      const ratio = client_h / scroll_h;
      const thumb_h = Math.max(24, Math.floor(client_h * ratio));
      const max_thumb_top = Math.max(1, client_h - thumb_h);
      const thumb_top = Math.max(0, Math.min(max_thumb_top, y - thumb_h / 2));
      list_container.scrollTop = (thumb_top / max_thumb_top) * max_scroll;
      update_scrollbar();
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}
  });

  window.addEventListener('resize', () => {
    try {
      if (is_panel_visible()) schedule_update_scrollbar();
    } catch (e) {}
  }, { passive: true });

  /**
   * @brief 渲染历史记录列表
   */
  function render_history() {
    if (!is_extension_context_valid()) return;
    if (!chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const history = (result && result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
      try {
        const count_el = panel_header.querySelector('.pc-count');
        if (count_el) count_el.innerText = `${history.length}/${MAX_HISTORY}`;
      } catch (e) {}

      try {
        if (selection_mode) {
          const exist = new Set(history.map(x => x && x.timestamp));
          selected_ids = new Set(Array.from(selected_ids || []).filter(id => exist.has(id)));
          update_action_state();
        }
      } catch (e) {}

      const fragment = document.createDocumentFragment();
      
      if (history.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'pc-empty';
        empty.innerText = '暂无记录';
        fragment.appendChild(empty);
      } else {
        history.forEach(item => {
          const li = document.createElement('li');
          li.className = 'pc-item';
          li.title = selection_mode ? '点击选择' : '点击复制';

          const row = document.createElement('div');
          row.className = 'pc-item-row';

          const item_id = item && typeof item.timestamp === 'number' ? item.timestamp : null;
          if (item_id !== null) li.dataset.id = String(item_id);

          let checkbox = null;
          if (selection_mode) {
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'pc-check';
            checkbox.checked = item_id !== null && selected_ids && selected_ids.has(item_id);
            const toggle_selected = () => {
              try {
                if (item_id === null) return;
                if (!selected_ids) selected_ids = new Set();
                if (checkbox && checkbox.checked) selected_ids.add(item_id);
                else selected_ids.delete(item_id);
                update_action_state();
              } catch (e2) {}
            };
            checkbox.addEventListener('click', (e) => {
              try {
                e.stopPropagation();
              } catch (e2) {}
            });
            checkbox.addEventListener('change', toggle_selected);
            row.appendChild(checkbox);
          }

          const body = document.createElement('div');
          body.className = 'pc-item-body';

          if (item.image) {
            const img = document.createElement('img');
            img.className = 'pc-img-thumb';
            img.src = item.image || item.image_url;
            body.appendChild(img);
          } else if (item.image_url) {
            const img = document.createElement('img');
            img.className = 'pc-img-thumb';
            img.src = item.image_url;
            body.appendChild(img);
          }
          
          if (item.text) {
            const text_span = document.createElement('span');
            text_span.className = 'pc-text';
            text_span.innerText = item.text;
            body.appendChild(text_span);
          }

          row.appendChild(body);
          li.appendChild(row);

          li.addEventListener('click', async () => {
            try {
              if (selection_mode) {
                if (item_id === null) return;
                if (!selected_ids) selected_ids = new Set();
                if (selected_ids.has(item_id)) selected_ids.delete(item_id);
                else selected_ids.add(item_id);
                if (checkbox) checkbox.checked = selected_ids.has(item_id);
                update_action_state();
                return;
              }
              await handle_item_click(item);
            } catch (e) {}
          });

          fragment.appendChild(li);
        });
      }

      try {
        list_container.innerHTML = '';
        list_container.appendChild(fragment);
        schedule_update_scrollbar();
      } catch (e) {}
    });
  }

  /**
   * @brief 处理列表项点击复制
   * @param {Object} item 历史记录项
   */
  async function handle_item_click(item) {
    try {
      if (!is_extension_context_valid()) return;
      const clipboard_items = {};
      
      if (item.text) {
        clipboard_items['text/plain'] = new Blob([item.text], { type: 'text/plain' });
      }
      
      const direct_image = typeof item.image === 'string' ? item.image : '';
      const data_url_image = direct_image && direct_image.startsWith('data:') ? direct_image : '';
      const image_url = typeof item.image_url === 'string' ? item.image_url : (direct_image && !data_url_image ? direct_image : '');

      if (data_url_image) {
        const res = await fetch(data_url_image);
        const blob = await res.blob();
        const png_blob = await to_png_blob(blob);
        clipboard_items['image/png'] = png_blob;
      } else if (image_url) {
        try {
          show_toast('正在复制图片');
          chrome.runtime.sendMessage({
            action: 'COPY_IMAGE_URL',
            url: image_url,
            text: item.text || '',
            page_url: location.href
          }, (resp) => {
            try {
              const ok = resp && resp.status === 'ok';
              show_toast(ok ? '已复制！' : '复制失败');
            } catch (e2) {}
          });
        } catch (e) {}
        return;
      }

      if (Object.keys(clipboard_items).length === 0) {
        show_toast('无可复制内容');
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem(clipboard_items)
      ]);
      
      show_toast('已复制！');
    } catch (err) {
      console.error('复制失败:', err);
      // Fallback to text only if possible
      if (item.text) {
        try {
          await navigator.clipboard.writeText(item.text);
          show_toast('已复制文本');
        } catch(e) {
          show_toast('复制失败');
        }
      } else {
        show_toast('复制失败');
      }
    }
  }

  // 监听存储变化自动更新
  chrome.storage.onChanged.addListener((changes, namespace) => {
    try {
      if (!is_extension_context_valid()) return;
      if (!chrome.storage || !chrome.storage.local) return;
      if (namespace === 'local' && changes[STORAGE_KEY]) {
        if (is_panel_visible()) {
          render_history();
        }
      }
    } catch (e) {}
  });

  /**
   * @brief 显示提示信息
   * @param {String} msg 
   */
  function show_toast(msg) {
    let toast = shadow.querySelector('.pc-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'pc-toast';
      container.appendChild(toast);
    }
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  async function extract_clipboard_items(items) {
    if (!items || items.length === 0) return null;

    for (const item of items) {
      const data = {};

      if (item.types && item.types.includes('text/plain')) {
        try {
          const blob = await item.getType('text/plain');
          data.text = await blob.text();
        } catch (e) {}
      }

      if (item.types) {
        const img_type = item.types.find(t => typeof t === 'string' && t.startsWith('image/'));
        if (img_type) {
          try {
            const blob = await item.getType(img_type);
            data.image = await compress_image(blob);
            data.image_type = img_type;
          } catch (e) {}
        }
      }

      const typed_data = with_type(data);
      if (typed_data) return typed_data;
    }

    return null;
  }

  function with_type(data) {
    if (!data || (!data.text && !data.image)) return null;
    if (data.text && data.image) return { ...data, type: 'mixed' };
    if (data.text) return { ...data, type: 'text' };
    return { ...data, type: 'image' };
  }

  function compress_image(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          const MAX_SIZE = 800;
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
          resolve(canvas.toDataURL('image/jpeg', 0.7));
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

  } catch (e) {}

})();

