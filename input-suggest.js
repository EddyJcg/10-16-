(() => {
  'use strict';

  const STORAGE_PREFIX = 'inputSuggest:v1:';
  const MAX_HISTORY = 300;
  const MAX_RESULTS = 50;
  const MAX_VALUE_LENGTH = 200;
  const TEXT_TYPES = ['text', 'search', 'email', 'tel', 'url', 'number'];
  const SENSITIVE_AUTOCOMPLETE = /\b(username|current-password|new-password|one-time-code)\b/;

  let panel = null;
  let target = null;
  let items = [];
  let activeIndex = -1;
  let picking = false;

  const isSuggestTarget = el => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
    if (el instanceof HTMLInputElement && !TEXT_TYPES.includes(el.type)) return false;
    if (el.disabled || el.readOnly || el.hasAttribute('data-no-suggest')) return false;
    return !SENSITIVE_AUTOCOMPLETE.test(el.getAttribute('autocomplete') || '');
  };

  const storageKey = el => {
    const key = el.dataset.suggestKey || el.id || el.name;
    return key ? STORAGE_PREFIX + key : '';
  };

  const readHistory = key => {
    if (!key) return [];
    try {
      const values = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(values) ? values.filter(value => typeof value === 'string') : [];
    } catch {
      return [];
    }
  };

  const saveValue = el => {
    const key = storageKey(el);
    const value = el.value.trim();
    if (!key || !value || value.length > MAX_VALUE_LENGTH) return;
    const next = [value, ...readHistory(key).filter(item => item !== value)].slice(0, MAX_HISTORY);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // 저장 공간이 가득 찬 경우 자동완성 기록만 건너뜁니다.
    }
  };

  const prepare = el => {
    if (!el.hasAttribute('list')) return;
    el.dataset.suggestList = el.getAttribute('list');
    el.removeAttribute('list');
  };

  const candidatesFor = el => {
    const candidates = new Map();
    const add = (value, label = '') => {
      if (value && !candidates.has(value)) candidates.set(value, { value, label });
    };
    readHistory(storageKey(el)).forEach(value => add(value));
    const datalist = el.dataset.suggestList && document.getElementById(el.dataset.suggestList);
    if (datalist) {
      Array.from(datalist.options).forEach(option => {
        add(option.value, option.label && option.label !== option.value ? option.label : '');
      });
    }
    return [...candidates.values()];
  };

  const findItems = el => {
    const typed = el.value.trim();
    const query = typed.toLocaleLowerCase();
    if (!query) return [];
    const startsWith = [];
    const contains = [];
    candidatesFor(el).forEach(candidate => {
      if (candidate.value === typed) return;
      const value = candidate.value.toLocaleLowerCase();
      const label = candidate.label.toLocaleLowerCase();
      if (value.startsWith(query)) startsWith.push(candidate);
      else if (value.includes(query) || label.includes(query)) contains.push(candidate);
    });
    return [...startsWith, ...contains].slice(0, MAX_RESULTS);
  };

  const ensurePanel = () => {
    if (panel) return panel;
    panel = document.createElement('ul');
    panel.className = 'input-suggest-panel';
    panel.setAttribute('role', 'listbox');
    panel.hidden = true;
    panel.addEventListener('mousedown', event => event.preventDefault());
    panel.addEventListener('mouseover', event => {
      const item = event.target.closest('[data-index]');
      if (!item) return;
      activeIndex = Number(item.dataset.index);
      highlight();
    });
    panel.addEventListener('click', event => {
      const item = event.target.closest('[data-index]');
      if (item) choose(Number(item.dataset.index));
    });
    return panel;
  };

  const highlight = () => {
    panel.querySelectorAll('[data-index]').forEach(item => {
      const active = Number(item.dataset.index) === activeIndex;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      if (active) item.scrollIntoView({ block: 'nearest' });
    });
  };

  const position = () => {
    if (!target || !panel || panel.hidden) return;
    const rect = target.getBoundingClientRect();
    const parent = panel.offsetParent;
    const origin = !parent || (parent === document.body && getComputedStyle(parent).position === 'static')
      ? { left: -window.scrollX, top: -window.scrollY }
      : (() => {
        const parentRect = parent.getBoundingClientRect();
        return { left: parentRect.left + parent.clientLeft, top: parentRect.top + parent.clientTop };
      })();
    const height = panel.offsetHeight;
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight && rect.top - height - 4 > 0) top = rect.top - height - 4;
    panel.style.left = `${rect.left - origin.left}px`;
    panel.style.top = `${top - origin.top}px`;
    panel.style.minWidth = `${rect.width}px`;
  };

  const hide = () => {
    if (panel) panel.hidden = true;
    target = null;
    items = [];
    activeIndex = -1;
  };

  const render = () => {
    items = findItems(target);
    if (!items.length) return hide();
    const element = ensurePanel();
    activeIndex = -1;
    element.replaceChildren(...items.map((item, index) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.dataset.index = String(index);
      li.className = 'input-suggest-item';
      const value = document.createElement('span');
      value.className = 'input-suggest-value';
      value.textContent = item.value;
      li.append(value);
      if (item.label) {
        const label = document.createElement('small');
        label.className = 'input-suggest-label';
        label.textContent = item.label;
        li.append(label);
      }
      return li;
    }));
    const container = target.closest('dialog[open]') || document.body;
    if (element.parentElement !== container) container.append(element);
    element.hidden = false;
    position();
  };

  const choose = index => {
    const item = items[index];
    const el = target;
    if (!item || !el) return;
    el.value = item.value;
    picking = true;
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      picking = false;
    }
    hide();
  };

  const move = step => {
    if (!items.length) return;
    if (activeIndex < 0) activeIndex = step > 0 ? 0 : items.length - 1;
    else activeIndex = (activeIndex + step + items.length) % items.length;
    highlight();
  };

  document.addEventListener('focusin', event => {
    if (isSuggestTarget(event.target)) prepare(event.target);
  }, true);

  document.addEventListener('input', event => {
    if (picking || !isSuggestTarget(event.target)) return;
    target = event.target;
    render();
  }, true);

  document.addEventListener('change', event => {
    if (isSuggestTarget(event.target)) saveValue(event.target);
  }, true);

  document.addEventListener('focusout', event => {
    if (event.target === target) hide();
  }, true);

  document.addEventListener('keydown', event => {
    const el = event.target;
    if (!isSuggestTarget(el) || event.isComposing) return;
    const open = target === el && panel && !panel.hidden;
    if (open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        move(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        choose(activeIndex);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        hide();
        return;
      }
    }
    if (event.key === 'Enter') saveValue(el);
  }, true);

  document.addEventListener('scroll', event => {
    if (panel && !panel.hidden && !panel.contains(event.target)) hide();
  }, true);

  window.addEventListener('resize', position);
})();
