// ==UserScript==
// @name         凪 (Nagi) - X Search Filter
// @namespace    https://github.com/DZ-nakai/nagi-x-filter
// @version      0.1.0
// @description  ブロック/ミュートしたアカウントをXの検索結果から非表示にする（非公式・API不使用・端末内完結）
// @author       DZ-nakai
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// @license      MIT
// ==/UserScript==

/*
 * 凪 (Nagi) — nagi-x-filter
 * ------------------------------------------------------------------
 * 方針:
 *   - 公式APIは叩かない。ログイン済みブラウザのDOMだけで完結する。
 *   - ブロック/ミュート一覧ページを開いたとき、その画面からhandleを収集して
 *     端末内（GM_setValue）に保存する。
 *   - 検索結果ページでは、保存済みhandleに一致する投稿をDOMから非表示にする。
 *
 * 注意:
 *   XのDOMはクラス名がランダム化されるため、構造の手がかりには
 *   data-testid を使う。セレクタは selectors.js 相当として一箇所に集約し、
 *   X側の変更に追従しやすくする。
 *
 * 現状: スケルトン。検索結果の非表示ロジックは TODO で骨組みのみ。
 */

(function () {
  'use strict';

  // ---- 設定 / ストレージキー --------------------------------------
  const STORAGE_KEY = 'nagi:hidden-handles';

  // ---- セレクタ集約（X側変更時はここだけ直す） -------------------
  const SELECTORS = {
    // 検索結果・TL共通の1投稿
    tweet: 'article[data-testid="tweet"]',
    // 投稿内のユーザー名ブロック（@handle を含む）
    userName: '[data-testid="User-Name"]',
    // ブロック/ミュート一覧ページの各セル
    userCell: '[data-testid="UserCell"]',
  };

  // ---- ストレージユーティリティ -----------------------------------
  /** @returns {Set<string>} 小文字のhandle集合（'@'なし） */
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

  // ---- handle抽出 -------------------------------------------------
  /**
   * 要素内の最初の @handle を返す（'@'を除いた小文字）。見つからなければ null。
   * @param {Element} root
   * @returns {string|null}
   */
  function extractHandle(root) {
    // プロフィールリンク href="/handle" から拾うのが最も安定
    const link = root.querySelector('a[href^="/"][role="link"]');
    if (!link) return null;
    const m = link.getAttribute('href').match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
    return m ? m[1].toLowerCase() : null;
  }

  // ---- ① 検索結果での非表示 ---------------------------------------
  const hidden = loadHiddenHandles();

  /** @param {Element} tweet */
  function applyToTweet(tweet) {
    if (tweet.dataset.nagiChecked) return;
    tweet.dataset.nagiChecked = '1';

    const nameBlock = tweet.querySelector(SELECTORS.userName);
    const handle = nameBlock ? extractHandle(nameBlock) : null;
    if (handle && hidden.has(handle)) {
      tweet.style.display = 'none';
      tweet.dataset.nagiHidden = '1';
    }
  }

  function scanTweets(root = document) {
    root.querySelectorAll(SELECTORS.tweet).forEach(applyToTweet);
  }

  // ---- ② 設定ページからの収集（TODO） ------------------------------
  // /settings/blocked/all, /settings/muted/all を開いたときに UserCell から
  // handle を収集して hidden に追記・保存する。無限スクロールに追従する想定。
  function harvestFromSettingsPage() {
    // TODO: location.pathname を見て対象ページのみ動作させる
    // TODO: UserCell ごとに extractHandle → hidden.add → saveHiddenHandles
  }

  // ---- 起動 -------------------------------------------------------
  function start() {
    scanTweets();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.(SELECTORS.tweet)) applyToTweet(node);
          else scanTweets(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    harvestFromSettingsPage();
  }

  start();
})();
