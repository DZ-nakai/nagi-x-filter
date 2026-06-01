// ==UserScript==
// @name         凪 (Nagi) - X Search Filter
// @namespace    https://github.com/DZ-nakai/nagi-x-filter
// @version      0.4.0
// @description  ブロック/ミュートしたアカウントをXの検索結果から非表示にする（非公式・API不使用・端末内完結）
// @author       DZ-nakai
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// @license      MIT
// ==/UserScript==

/*
 * 凪 (Nagi) — nagi-x-filter
 * ------------------------------------------------------------------
 * 方針:
 *   - 公式APIは叩かない。ログイン済みブラウザのDOMだけで完結する。
 *   - 端末内（GM_setValue）に保持した非表示リストの handle に一致する投稿を、
 *     検索結果（およびTL）からDOM上で非表示にする。
 *   - ブロック/ミュート一覧ページ（/settings/blocked/all 等）から一括インポート（#2）。
 *   - ブロック/ミュート操作の成功トーストを検知して、その handle を自動で追加（#9）。
 *     解除トーストを検知したらリストから削除する。
 *
 * 注意:
 *   XのDOMはクラス名がランダム化されるため、構造の手がかりには data-testid を使い、
 *   セレクタは SELECTORS に集約してX側変更へ追従しやすくする。
 */

(function () {
  'use strict';

  // ---- ストレージキー ---------------------------------------------
  const STORAGE_KEY = 'nagi:hidden-handles';

  // ---- セレクタ集約（X側変更時はここだけ直す） -------------------
  const SELECTORS = {
    tweet: 'article[data-testid="tweet"]', // 検索結果・TL共通の1投稿
    userName: '[data-testid="User-Name"]', // 投稿内のユーザー名ブロック（@handleを含む）
    userCell: '[data-testid="UserCell"]', // ブロック/ミュート一覧ページの各セル
    toast: '[data-testid="toast"]', // 操作成功時の通知トースト（#9）
  };

  // ブロック/ミュート一覧ページ判定（/settings/blocked..., /settings/muted...）
  const BLOCK_MUTE_PAGE = /^\/settings\/(blocked|muted)/;

  // トースト文言の分類キーワード（言語別。必要に応じ追加）。
  // 「追加」=ブロック/ミュート成功、「削除」=その解除。先に解除を判定する。
  const TOAST_KEYWORDS = {
    remove: [/ブロックを解除/, /ミュートを解除/, /\bunblocked\b/i, /\bunmuted\b/i],
    add: [/ブロックしました/, /ミュートしました/, /\byou blocked\b/i, /\byou muted\b/i],
  };
  const RE_HANDLE_IN_TEXT = /@([A-Za-z0-9_]{1,15})/;

  // ---- 汎用ユーティリティ -----------------------------------------
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function isBlockOrMuteListPage() {
    return BLOCK_MUTE_PAGE.test(location.pathname);
  }

  // ---- ストレージユーティリティ -----------------------------------
  /** @returns {Set<string>} 小文字handle集合（'@'なし） */
  function loadHiddenHandles() {
    const raw = GM_getValue(STORAGE_KEY, '[]');
    try {
      return new Set(JSON.parse(raw).map((h) => h.toLowerCase()));
    } catch {
      return new Set();
    }
  }

  /** @param {Set<string>} set */
  function saveHiddenHandles(set) {
    GM_setValue(STORAGE_KEY, JSON.stringify([...set]));
  }

  /** メモリ上の非表示リスト（起動時にロード、変更時に都度保存） */
  const hidden = loadHiddenHandles();

  // ---- handleユーティリティ ---------------------------------------
  /** 入力文字列を正規化（前後空白・先頭@を除去して小文字化） */
  function normalizeHandle(input) {
    return String(input).trim().replace(/^@+/, '').toLowerCase();
  }

  /**
   * 要素内の最初の @handle を href から返す（'@'なし小文字）。なければ null。
   * 表示テキストではなくプロフィールリンク href="/handle" を使うのが最も安定。
   * @param {Element} root
   * @returns {string|null}
   */
  function extractHandle(root) {
    const link = root.querySelector('a[href^="/"][role="link"]');
    if (!link) return null;
    const m = link.getAttribute('href').match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
    return m ? m[1].toLowerCase() : null;
  }

  // ---- リスト操作（共通） -----------------------------------------
  function addToHidden(handle) {
    if (!handle || hidden.has(handle)) return false;
    hidden.add(handle);
    saveHiddenHandles(hidden);
    reapplyAll();
    return true;
  }

  function removeFromHidden(handle) {
    if (!hidden.delete(handle)) return false;
    saveHiddenHandles(hidden);
    reapplyAll();
    return true;
  }

  // ---- 1投稿の処理 -------------------------------------------------
  /**
   * 投稿要素の著者handleを返す。一度取得できたらキャッシュして再計算を避ける。
   * （レンダリング途中でhandle未確定のことがあるため、取得できるまではキャッシュしない）
   */
  function tweetHandle(tweet) {
    if (tweet.dataset.nagiHandle) return tweet.dataset.nagiHandle;
    const nameBlock = tweet.querySelector(SELECTORS.userName);
    const handle = nameBlock ? extractHandle(nameBlock) : null;
    if (handle) tweet.dataset.nagiHandle = handle;
    return handle;
  }

  /** 非表示リストに応じて1投稿の表示/非表示を冪等に更新する */
  function applyToTweet(tweet) {
    const handle = tweetHandle(tweet);
    const shouldHide = !!handle && hidden.has(handle);
    if (shouldHide) {
      if (tweet.dataset.nagiHidden !== '1') {
        tweet.style.display = 'none';
        tweet.dataset.nagiHidden = '1';
      }
    } else if (tweet.dataset.nagiHidden === '1') {
      // リストから外れた等で再表示に戻すケース
      tweet.style.removeProperty('display');
      delete tweet.dataset.nagiHidden;
    }
  }

  /** 現在DOM上にある全投稿へ再適用（リスト変更時に呼ぶ） */
  function reapplyAll() {
    document.querySelectorAll(SELECTORS.tweet).forEach(applyToTweet);
  }

  // ---- ② ブロック/ミュート一覧のインポート（#2） ------------------
  /** いま画面に出ている UserCell から handle を収集。新規追加件数を返す。 */
  function harvestVisibleCells() {
    let added = 0;
    document.querySelectorAll(SELECTORS.userCell).forEach((cell) => {
      const h = extractHandle(cell);
      if (h && !hidden.has(h)) {
        hidden.add(h);
        added++;
      }
    });
    if (added) saveHiddenHandles(hidden);
    return added;
  }

  /**
   * 一覧ページを自動スクロールしながら全件収集する。
   * 仮想リストはスクロールしないと全件描画されないため、件数が一定回数
   * 変化しなくなるまでスクロール→収集を繰り返す。
   */
  async function importBlockMuteList() {
    if (!isBlockOrMuteListPage()) {
      alert(
        '凪: ブロック/ミュート済みアカウントの「すべて」ページ\n' +
          '（設定 → プライバシーと安全 → ブロック/ミュート済みアカウント）で実行してください。'
      );
      return;
    }
    const before = hidden.size;
    let lastSize = -1;
    let stable = 0;
    for (let i = 0; i < 300 && stable < 4; i++) {
      harvestVisibleCells();
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(600);
      if (hidden.size === lastSize) {
        stable++;
      } else {
        stable = 0;
        lastSize = hidden.size;
      }
    }
    harvestVisibleCells();
    reapplyAll();
    alert(`凪: インポート完了。${hidden.size - before} 件を追加（合計 ${hidden.size} 件）。`);
  }

  // ---- ⑨ ブロック/ミュート操作と同時に自動追加（#9） ---------------
  /** トースト要素から handle を取り出す（リンク優先、なければテキストの @handle） */
  function handleFromToast(toast) {
    const viaLink = extractHandle(toast);
    if (viaLink) return viaLink;
    const m = (toast.textContent || '').match(RE_HANDLE_IN_TEXT);
    return m ? m[1].toLowerCase() : null;
  }

  /** 成功トーストを分類して、ブロック/ミュートなら追加、解除なら削除する */
  function processToast(toast) {
    const text = toast.textContent || '';
    const isRemove = TOAST_KEYWORDS.remove.some((re) => re.test(text));
    const isAdd = !isRemove && TOAST_KEYWORDS.add.some((re) => re.test(text));
    if (!isAdd && !isRemove) return;

    const handle = handleFromToast(toast);
    if (!handle) {
      // 文言は合致したが handle を取れなかった＝調整が必要。文言を出して報告できるように。
      console.warn('[nagi] ブロック/ミュート系トーストを検知したが handle 取得失敗:', JSON.stringify(text));
      return;
    }
    if (isRemove) {
      if (removeFromHidden(handle)) console.debug('[nagi] 解除を検知 → リストから削除:', handle);
    } else if (addToHidden(handle)) {
      console.debug('[nagi] ブロック/ミュートを検知 → リストに追加:', handle);
    }
  }

  // ---- 手動リスト操作（最小UI。フルUIは #4） ----------------------
  function addHandle() {
    const input = prompt('凪: 非表示にする @handle を入力（@は省略可）');
    if (input == null) return;
    const h = normalizeHandle(input);
    if (h) addToHidden(h);
  }

  function removeHandle() {
    const input = prompt('凪: 非表示を解除する @handle を入力');
    if (input == null) return;
    removeFromHidden(normalizeHandle(input));
  }

  function showList() {
    const list = [...hidden].sort();
    alert(
      list.length
        ? `凪: 非表示リスト (${list.length})\n` + list.map((h) => '@' + h).join('\n')
        : '凪: 非表示リストは空です'
    );
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand('凪: この一覧をインポート（ブロック/ミュート設定ページで）', importBlockMuteList);
    GM_registerMenuCommand('凪: 非表示リストに追加', addHandle);
    GM_registerMenuCommand('凪: 非表示リストから削除', removeHandle);
    GM_registerMenuCommand('凪: 非表示リストを表示', showList);
  }

  // ---- 起動 -------------------------------------------------------
  function start() {
    reapplyAll();
    if (isBlockOrMuteListPage()) harvestVisibleCells();

    // 仮想スクロール（DOMの付け外し）と遅延レンダリングに追従する。
    const observer = new MutationObserver((mutations) => {
      const tweets = new Set();
      const cells = new Set();
      const toasts = new Set();
      const onListPage = isBlockOrMuteListPage();
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.(SELECTORS.tweet)) tweets.add(node);
          node.querySelectorAll?.(SELECTORS.tweet).forEach((t) => tweets.add(t));
          // 既存の投稿の内部に後からhandleが描画されるケースを拾う
          const closest = node.closest?.(SELECTORS.tweet);
          if (closest) tweets.add(closest);
          // ブロック/ミュート操作の成功トースト（#9）
          if (node.matches?.(SELECTORS.toast)) toasts.add(node);
          node.querySelectorAll?.(SELECTORS.toast).forEach((t) => toasts.add(t));
          // ブロック/ミュート一覧ページではスクロールに合わせて受動的に収集（#2）
          if (onListPage) {
            if (node.matches?.(SELECTORS.userCell)) cells.add(node);
            node.querySelectorAll?.(SELECTORS.userCell).forEach((c) => cells.add(c));
          }
        }
      }

      tweets.forEach(applyToTweet);

      // トーストはテキスト描画が一瞬遅れることがあるので少し待ってから処理（重複処理は防止）
      toasts.forEach((t) => {
        if (t.dataset.nagiToastSeen === '1') return;
        t.dataset.nagiToastSeen = '1';
        setTimeout(() => processToast(t), 60);
      });

      if (cells.size) {
        let added = 0;
        cells.forEach((cell) => {
          const h = extractHandle(cell);
          if (h && !hidden.has(h)) {
            hidden.add(h);
            added++;
          }
        });
        if (added) saveHiddenHandles(hidden);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    registerMenu();
  }

  start();
})();
