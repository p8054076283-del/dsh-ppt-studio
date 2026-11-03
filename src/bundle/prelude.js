    /* ------------------------------------------------------------------ 常量 */

    var TITLE = 'PPT 工作台'
    var PANEL_KEY = 'ppt-studio'
    var BASE = '/ppt-studio'
    var BUILD = 'v1.0.1'
    var POLL_MS = 1400
    var LAYOUTS = ['cover', 'section', 'bullets', 'two-col', 'image-right', 'image-full', 'quote', 'table', 'imported']
    var LAYOUT_LABELS = {
      cover: '标题页',
      section: '章节页',
      bullets: '要点列表',
      'two-col': '双栏文字',
      'image-right': '左文右图',
      'image-full': '全图衬底',
      quote: '引用金句',
      table: '表格',
      imported: '原样排版',
    }

    /* ------------------------------------------------------------------ 诊断 */

    function report(kind, detail) {
      try {
        fetch(BASE + '/report', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: kind, detail: detail == null ? null : String(detail) }),
          keepalive: true,
        }).catch(function () {})
      } catch (error) {
        /* diagnostics must never break activation */
      }
    }

    /* ------------------------------------------------------------------ 宿主读写 */

    function fetchState(dir) {
      var url = BASE + '/state' + (dir ? '?dir=' + encodeURIComponent(dir) : '')
      return fetch(url, { credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status)
        return response.json()
      })
    }

    function saveDeck(dir, deck) {
      return fetch(BASE + '/deck', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceRoot: dir, deck: deck }),
      }).then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok || !body || body.ok !== true) throw new Error((body && body.error) || 'HTTP ' + response.status)
          return body
        })
      })
    }

    /* ------------------------------------------------------------------ 样式 */

    /*
     * Visual language: a projector room. The deck reads as a film strip on the left (page
     * numbers sit on a spine that only shows in the gaps between cards), the current page is
     * projected on a dimmed stage in the middle, and the AI sits at a side desk on the right.
     * Everything else stays quiet: one accent, hairline borders, tabular numerals for anything
     * that counts (page number, page count, directory).
     */
    var MONO = 'ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace'
    var PAGE_CSS =
      /* ---------------- 骨架 ---------------- */
      '.ppt3-page{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;letter-spacing:.01em}' +
      /* ---------------- 顶栏 ---------------- */
      '.ppt3-head{display:flex;align-items:center;gap:10px;padding:0 14px;height:46px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}' +
      '.ppt3-head-main{display:flex;align-items:baseline;gap:9px;min-width:0;flex:0 1 auto}' +
      '.ppt3-eyebrow{font-size:10px;letter-spacing:.12em;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:0 0 auto}' +
      '.ppt3-title{font-weight:650;font-size:13.5px;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ppt3-count{flex:0 0 auto;font:600 10.5px/1 ' + MONO + ';font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:3px 8px}' +
      '.ppt3-dir{flex:0 0 auto;font:11px/1.2 ' + MONO + ';color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:4px 8px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.ppt3-chip{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border-radius:999px;font-size:10.5px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:transparent;white-space:nowrap;flex:0 0 auto}' +
      '.ppt3-chip.ok{border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent);color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)}' +
      '.ppt3-chip.note{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, transparent);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)}' +
      '.ppt3-chip.warn{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent);color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)}' +
      '.ppt3-dot{width:5px;height:5px;border-radius:999px;background:currentColor;display:inline-block}' +
      '.ppt3-spacer{flex:1 1 auto}' +
      /* ---------------- 按钮 ---------------- */
      '.ppt3-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:9px;height:28px;padding:0 11px;font-size:12px;font-family:inherit;cursor:pointer;transition:background .14s,border-color .14s,color .14s,transform .06s,filter .14s}' +
      '.ppt3-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}' +
      '.ppt3-btn:active{transform:translateY(1px)}' +
      '.ppt3-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}' +
      '.ppt3-btn:disabled{opacity:.38;cursor:default;transform:none}' +
      '.ppt3-btn.primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff;box-shadow:0 8px 20px -14px var(--dsw-alias-brand-primary)}' +
      '.ppt3-btn.primary:hover{filter:brightness(1.07);background:var(--dsw-alias-brand-primary)}' +
      '.ppt3-btn.ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}' +
      '.ppt3-btn.ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}' +
      '.ppt3-btn.danger{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}' +
      '.ppt3-btn.danger:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 34%, transparent);color:var(--dsw-alias-state-error-primary)}' +
      '.ppt3-toolbar-sep{width:1px;height:16px;background:var(--dsw-alias-border-l1);margin:0 3px}' +
      /* ---------------- 主体 ---------------- */
      '.ppt3-body{flex:1 1 auto;display:flex;min-height:0}' +
      /* ---------------- 缩略图胶片条 ---------------- */
      '.ppt3-thumbs{position:relative;flex:0 0 clamp(148px,13vw,226px);min-width:0;overflow:auto;padding:12px 12px 16px;border-right:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-base);scrollbar-gutter:stable}' +
      '.ppt3-thumbs::before{content:"";position:absolute;left:21px;top:14px;bottom:14px;width:1px;background:var(--dsw-alias-border-l1);pointer-events:none}' +
      /* flex:0 0 auto — a card must never be squashed to fit the strip, otherwise its 16:9
         thumbnail gets clipped by the card's own overflow. The strip scrolls instead. */
      '.ppt3-thumb{position:relative;flex:0 0 auto;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s,transform .1s}' +
      '.ppt3-thumb:hover{border-color:var(--dsw-alias-border-l2);transform:translateY(-1px);box-shadow:0 12px 26px -20px rgba(0,0,0,.9)}' +
      '.ppt3-thumb:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}' +
      '.ppt3-thumb[data-selected="true"]{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 62%, transparent);background:var(--dsw-alias-bg-layer-2);box-shadow:0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent),0 14px 30px -22px rgba(0,0,0,.95)}' +
      '.ppt3-thumb[data-selected="true"]::after{content:"";position:absolute;left:0;top:9px;bottom:9px;width:2px;border-radius:0 2px 2px 0;background:var(--dsw-alias-brand-primary)}' +
      /* 刚被 AI 改过的页：暖色描边 + 呼吸，几秒后自动消失 */
      '.ppt3-thumb[data-ai="true"]{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 70%, transparent);animation:ppt3-aimark-pulse 1.6s ease-out 3}' +
      '.ppt3-thumb[data-ai="true"] .ppt3-thumb-num{background:var(--dsw-alias-state-warn-primary);border-color:transparent;color:#fff}' +
      '.ppt3-aimark{appearance:none;display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:999px;border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 48%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);color:var(--dsw-alias-state-warn-primary);font:inherit;font-size:10.5px;line-height:1;cursor:pointer;white-space:nowrap;transition:background .14s}' +
      '.ppt3-aimark:hover{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 22%, transparent)}' +
      '@keyframes ppt3-aimark-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-warn-primary) 46%, transparent)}70%{box-shadow:0 0 0 6px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 0%, transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-warn-primary) 0%, transparent)}}' +
      '.ppt3-thumb-head{display:flex;align-items:center;gap:7px;padding:6px 8px 6px 10px;font-size:11px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-bg-layer-2) 60%, transparent)}' +
      '.ppt3-thumb-num{flex:0 0 auto;font:600 10px/1 ' + MONO + ';font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:3px 5px;background:var(--dsw-alias-bg-base)}' +
      '.ppt3-thumb[data-selected="true"] .ppt3-thumb-num{color:#fff;background:var(--dsw-alias-brand-primary);border-color:transparent}' +
      '.ppt3-thumb-layout{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96px}' +
      '.ppt3-thumb-edited{flex:0 0 auto;width:5px;height:5px;border-radius:999px;background:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)}' +
      '.ppt3-thumb-frame{position:relative;width:100%;aspect-ratio:13.333/7.5;overflow:hidden;background:#fff}' +
      /* ---------------- 编辑区：舞台 + 表单 ---------------- */
      '.ppt3-main{--ppt3-w:min(100%,calc((100vh - 470px) * 1.7778));flex:1 1 auto;min-width:0;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px}' +
      '.ppt3-stage{flex:0 0 auto;width:100%;max-width:var(--ppt3-w);margin:0 auto;padding:11px 11px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:radial-gradient(130% 130% at 50% -25%, color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, var(--dsw-alias-bg-layer-1)), var(--dsw-alias-bg-base) 72%);box-shadow:inset 0 1px 0 color-mix(in srgb, #ffffff 5%, transparent);display:flex;flex-direction:column;gap:6px}' +
      '.ppt3-preview-wrap{position:relative;width:100%;border-radius:8px;overflow:hidden;box-shadow:0 24px 48px -30px rgba(0,0,0,.95)}' +
      '.ppt3-preview{position:relative;flex:0 0 auto;width:100%;aspect-ratio:13.333/7.5;border-radius:8px;overflow:hidden;background:#fff}' +
      /* 就地编辑：透明命中层 + 覆盖式输入框 */
      '.ppt3-hitlayer{position:absolute;inset:0;z-index:2;pointer-events:none}' +
      '.ppt3-hit{position:absolute;min-width:18px;min-height:13px;pointer-events:auto;cursor:text;border-radius:3px;outline:1px dashed transparent;outline-offset:1px;transition:outline-color .12s,background .12s}' +
      '.ppt3-hit:hover{outline-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, transparent);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent)}' +
      '.ppt3-editor{position:absolute;z-index:3;box-sizing:border-box;margin:0;padding:3px 5px;min-width:130px;min-height:30px;border:1px solid var(--dsw-alias-brand-primary);border-radius:5px;background:transparent;resize:both;overflow:auto;outline:none;white-space:pre-wrap;letter-spacing:inherit;line-height:1.4;caret-color:var(--dsw-alias-brand-primary);box-shadow:0 8px 22px -12px rgba(0,0,0,.75),0 0 0 1px color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent)}' +
      '.ppt3-editor[data-nowrap="true"]{white-space:pre;overflow-x:auto;overflow-y:hidden}' +
      /* Harness 的全局样式给表单控件设了浅色的 -webkit-text-fill-color，会盖住 color，
         导致编辑框里的字在浅色页面上几乎看不见——这里强制跟随 color。 */
      '.ppt3-editor,.ppt3-field input,.ppt3-field textarea,.ppt3-field select{-webkit-text-fill-color:currentColor!important}' +
      /* 双色描边：即使原文字色和编辑框底色撞了，也一定看得见 */
      '.ppt3-editor{text-shadow:0 0 1px rgba(0,0,0,.55),0 0 2px rgba(255,255,255,.45)}' +
      '.ppt3-stagebar{display:flex;align-items:center;gap:8px;min-height:24px;padding:0 2px}' +
      '.ppt3-stagenum{font:600 11.5px/1 ' + MONO + ';font-variant-numeric:tabular-nums;letter-spacing:.04em;color:var(--dsw-alias-label-primary)}' +
      '.ppt3-stagetotal{font:11px/1 ' + MONO + ';font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}' +
      '.ppt3-navbtn{appearance:none;width:22px;height:22px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1;cursor:pointer;transition:background .14s,border-color .14s,color .14s}' +
      '.ppt3-navbtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}' +
      '.ppt3-navbtn:disabled{opacity:.32;cursor:default}' +
      '.ppt3-toolbar{display:flex;flex:0 0 auto;gap:6px;flex-wrap:wrap;align-items:center;width:100%;max-width:var(--ppt3-w);margin:0 auto}' +
      '.ppt3-form{display:grid;flex:0 0 auto;grid-template-columns:160px minmax(0,1fr) minmax(0,1fr);gap:10px 12px;width:100%;max-width:var(--ppt3-w);margin:0 auto}' +
      '.ppt3-form .full{grid-column:1 / -1}' +
      '.ppt3-form .col-main{grid-column:2 / -1}' +
      '.ppt3-field{display:flex;flex-direction:column;gap:5px;min-width:0}' +
      '.ppt3-field:not(.full):not(.col-main){max-width:360px}' +
      '.ppt3-field > label{font-size:11px;letter-spacing:.07em;color:var(--dsw-alias-label-secondary)}' +
      '.ppt3-field input,.ppt3-field textarea,.ppt3-field select{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:8px 10px;transition:border-color .14s,box-shadow .14s,background .14s}' +
      '.ppt3-field input:hover,.ppt3-field textarea:hover,.ppt3-field select:hover{border-color:var(--dsw-alias-border-l2)}' +
      '.ppt3-field input:focus,.ppt3-field textarea:focus,.ppt3-field select:focus{outline:none;border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-base);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)}' +
      '.ppt3-field textarea{min-height:86px;resize:vertical;line-height:1.6}' +
      '.ppt3-section-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);padding:4px 0 1px}' +
      '.ppt3-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
      '.ppt3-error{color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:pre-wrap;flex:0 0 auto;width:100%;max-width:var(--ppt3-w);margin:0 auto;border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 32%, transparent);border-radius:10px;padding:8px 10px;background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent)}' +
      '.ppt3-notice{color:var(--dsw-alias-label-secondary);font-size:12px}' +
      '.ppt3-empty{margin:auto;display:flex;max-width:460px;flex-direction:column;gap:10px;align-items:center;justify-content:center;padding:28px 24px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:16px;background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent)}' +
      /* ---------------- 分隔条 ---------------- */
      '.ppt3-splitmain{display:flex;min-width:0;min-height:0}' +
      '.ppt3-chatcol{min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}' +
      '.ppt3-splitter{flex:0 0 9px;cursor:col-resize;background:transparent;position:relative;transition:background .15s}' +
      '.ppt3-splitter:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)}' +
      '.ppt3-splitter::after{content:"";position:absolute;top:0;bottom:0;left:4px;width:1px;background:var(--dsw-alias-border-l1)}' +
      '.ppt3-splitter::before{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4px;height:44px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-secondary) 40%, transparent);transition:background .15s}' +
      '.ppt3-splitter:hover::after,.ppt3-splitter[data-dragging="true"]::after{background:var(--dsw-alias-brand-primary)}' +
      '.ppt3-splitter:hover::before,.ppt3-splitter[data-dragging="true"]::before{background:var(--dsw-alias-brand-primary)}' +
      '.ppt3-chatcol .ppt4{flex:1 1 auto;min-height:0}' +
      /* ---------------- 滚动条 ---------------- */
      '.ppt3-thumbs::-webkit-scrollbar,.ppt3-main::-webkit-scrollbar,.ppt4-log::-webkit-scrollbar{width:9px;height:9px}' +
      '.ppt3-thumbs::-webkit-scrollbar-thumb,.ppt3-main::-webkit-scrollbar-thumb,.ppt4-log::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:999px;border:3px solid transparent;background-clip:padding-box}' +
      '.ppt3-thumbs::-webkit-scrollbar-thumb:hover,.ppt3-main::-webkit-scrollbar-thumb:hover,.ppt4-log::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary);border-width:3px;background-clip:padding-box}'

    var cssInjected = false
    /**
     * The Harness shell flattens every radius inside the main slot with
     * `border-radius: 0 !important`. Inline !important is the only thing that beats it,
     * so every rule we inject carries the flag.
     */
    function forceRadius(css) {
      return String(css).replace(/border-radius:([^;}]+)/g, function (match, value) {
        return /!important/.test(value) ? match : 'border-radius:' + value + ' !important'
      })
    }

    function useStyles() {
      if (cssInjected) return
      cssInjected = true
      try {
        // Plugin reloads leave the old <style> nodes behind; drop them so stale rules cannot
        // fight the current ones (they used to win the cascade after a few reloads).
        var stale = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('style[data-ppt-studio]') : []
        for (var i = 0; i < stale.length; i += 1) {
          if (stale[i] && stale[i].parentNode) stale[i].parentNode.removeChild(stale[i])
        }
        var style = document.createElement('style')
        style.setAttribute('data-ppt-studio', '')
        style.textContent = forceRadius(PAGE_CSS + Render.PREVIEW_CSS)
        document.head.appendChild(style)
      } catch (error) {
        /* styling is best-effort */
      }
    }

    /* ------------------------------------------------------------------ 图标 */

    function Icon(props) {
      var size = props && typeof props.size === 'number' && props.size > 0 ? props.size : 20
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 64 64', role: 'img', 'aria-label': TITLE, style: { display: 'block' } },
        h('rect', { key: 'a', x: 5, y: 10, width: 44, height: 28, rx: 5, fill: 'currentColor', opacity: 0.22 }),
        h('rect', { key: 'b', x: 13, y: 18, width: 46, height: 36, rx: 7, fill: 'none', stroke: 'currentColor', strokeWidth: 4 }),
        h('rect', { key: 'c', x: 19, y: 25, width: 10, height: 23, rx: 2.5, fill: 'currentColor' }),
        h('rect', { key: 'd', x: 33, y: 26, width: 20, height: 4, rx: 2, fill: 'currentColor' }),
        h('rect', { key: 'e', x: 33, y: 34, width: 15, height: 3.5, rx: 1.75, fill: 'currentColor', opacity: 0.55 }),
        h('rect', { key: 'f', x: 33, y: 41, width: 18, height: 3.5, rx: 1.75, fill: 'currentColor', opacity: 0.55 })
      )
    }

    /** Return the main column to the conversation (the PPT panel is a global panel). */
    function backToConversation() {
      try {
        var layout = hostCtx && hostCtx.get && hostCtx.get('layout')
        if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(null)
        report('back-to-conversation')
      } catch (error) {
        report('back-to-conversation-failed', error && error.message)
      }
    }
    /** The live Client context, captured at activation for the panel's remote calls. */
    var hostCtx = null






























