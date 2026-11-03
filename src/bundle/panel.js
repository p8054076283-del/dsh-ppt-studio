    /* ------------------------------------------------------------------ 面板页 */

    function Panel() {
      useStyles()
      var snapshotState = react.useState({ status: 'loading', dir: '', deck: null, text: '', manual: {}, error: '', parseError: '' })
      var snapshot = snapshotState[0]
      var setSnapshot = snapshotState[1]
      var selectionState = react.useState(0)
      var selected = selectionState[0]
      var setSelected = selectionState[1]
      var chatOpenState = react.useState(true)
      var chatOpen = chatOpenState[0]
      var setChatOpen = chatOpenState[1]
      /** Share of the split row the editing side keeps; the chat column takes the rest. */
      var SPLIT_KEY = 'pptStudio.splitRatio.v2'
      var SPLITTER_PX = 9
      var SPLIT_MIN = 0.34
      var SPLIT_MAX = 0.82
      var SPLIT_DEFAULT = 0.66
      var splitState = react.useState(function () {
        try {
          window.localStorage.removeItem('pptStudio.splitRatio')
          var stored = window.localStorage.getItem(SPLIT_KEY)
          var value = stored ? Number(stored) : NaN
          return isFinite(value) && value > SPLIT_MIN - 0.05 && value < SPLIT_MAX + 0.05 ? value : SPLIT_DEFAULT
        } catch (error) {
          return SPLIT_DEFAULT
        }
      })
      var splitRatio = splitState[0]
      var setSplitRatio = splitState[1]
      var splitRatioRef = react.useRef(SPLIT_DEFAULT)
      splitRatioRef.current = splitRatio
      var draggingRef = react.useRef(false)
      var bodyRef = react.useRef(null)
      var noticeState = react.useState('')
      var notice = noticeState[0]
      var setNotice = noticeState[1]
      /** Pages the AI just touched (diffed from the file), highlighted for a few seconds. */
      var aiMarkState = react.useState(null)
      var aiMark = aiMarkState[0]
      var setAiMark = aiMarkState[1]
      var aiMarkTimer = react.useRef(null)
      var rawDeckRef = react.useRef('')
      /** Exact file text our own save produced — so our writes are never reported as AI edits. */
      var selfWriteRef = react.useRef(null)
      /** In-place editing: click a text block (or table cell) on the slide and type there. */
      var editState = react.useState(null)
      var edit = editState[0]
      var setEdit = editState[1]
      var previewRef = react.useRef(null)
      var wrapRef = react.useRef(null)
      var editorRef = react.useRef(null)

      function expectedFileText(payload) {
        try {
          return JSON.stringify(payload, null, 2) + '\n'
        } catch (error) {
          return ''
        }
      }

      var pollRef = react.useRef({ text: '', busy: false })

      /* 读取 + 轮询：AI 或人直接改 deck.json 时自动刷新 */
      /** Compare two raw deck.json texts page by page (ids stable, elements untouched). */
      function diffDecks(prevText, nextText) {
        var prev = null
        var next = null
        try {
          prev = prevText ? JSON.parse(prevText) : null
        } catch (error) {
          prev = null
        }
        try {
          next = nextText ? JSON.parse(nextText) : null
        } catch (error) {
          next = null
        }
        if (!prev || !next || !Array.isArray(prev.slides) || !Array.isArray(next.slides)) return null
        var prevMap = {}
        prev.slides.forEach(function (item) {
          if (item && item.id != null) prevMap[String(item.id)] = JSON.stringify(item)
        })
        var added = []
        var changed = []
        var seen = {}
        next.slides.forEach(function (item, index) {
          var id = item && item.id != null ? String(item.id) : ''
          seen[id] = true
          if (!prevMap[id]) added.push(index + 1)
          else if (prevMap[id] !== JSON.stringify(item)) changed.push(index + 1)
        })
        var removed = prev.slides.filter(function (item) {
          return item && item.id != null && !seen[String(item.id)]
        }).length
        return { changed: changed, added: added, removed: removed }
      }

      react.useEffect(function () {
        var alive = true

        function adopt(payload, external) {
          if (!alive) return
          if (external) {
            var ownWrite = selfWriteRef.current && payload.text === selfWriteRef.current.text
            if (ownWrite) selfWriteRef.current = null
            var suppressedAt = window.__pptStudioSuppressMarkAt || 0
            if (ownWrite || Date.now() - suppressedAt < 8000) external = false
          }
          if (!payload || payload.ok !== true) {
            setSnapshot(function (prev) {
              return { status: 'error', dir: prev.dir, deck: null, text: '', manual: {}, error: (payload && payload.error) || '读取失败', parseError: '' }
            })
            return
          }
          var manual = {}
          var deck = payload.deck
          if (deck && Array.isArray(deck.slides)) {
            for (var i = 0; i < deck.slides.length; i += 1) {
              var slide = deck.slides[i]
              if (slide && Array.isArray(slide.elements) && slide.elements.length > 0) manual[String(slide.id)] = true
            }
            try {
              deck = Render.ensureElements(JSON.parse(JSON.stringify(deck)))
            } catch (error) {
              /* render-time regeneration is best-effort */
            }
          }
          if (external) {
            var mark = diffDecks(rawDeckRef.current, payload.text || '')
            if (mark && (mark.changed.length || mark.added.length || mark.removed)) {
              setAiMark({
                pages: mark.changed.concat(mark.added).slice(0, 12),
                changed: mark.changed.length,
                added: mark.added.length,
                removed: mark.removed,
                at: Date.now(),
              })
              if (aiMarkTimer.current) clearTimeout(aiMarkTimer.current)
              aiMarkTimer.current = setTimeout(function () {
                setAiMark(null)
              }, 9000)
            }
          }
          rawDeckRef.current = payload.text || ''
          pollRef.current.text = payload.text || ''
          setSnapshot({
            status: 'ready',
            dir: payload.dir || '',
            deck: deck,
            text: payload.text || '',
            manual: manual,
            error: '',
            parseError: payload.errorText || '',
          })
          setSelected(function (prev) {
            var count = deck && deck.slides ? deck.slides.length : 0
            return count > 0 ? Math.min(prev, count - 1) : 0
          })
        }

        function load() {
          fetchState()
            .then(function (payload) {
              report('state:ok', payload && payload.dir)
              adopt(payload)
            })
            .catch(function (error) {
              report('state:failed', error && error.message)
              adopt({ ok: false, error: error && error.message ? error.message : String(error) })
            })
        }

        load()
        var timer = setInterval(function () {
          if (!alive || pollRef.current.busy) return
          fetchState()
            .then(function (payload) {
              if (!alive || !payload || payload.ok !== true) return
              if ((payload.text || '') !== pollRef.current.text) {
                report('adopted-external', payload.dir)
                adopt(payload, true)
              }
            })
            .catch(function () {})
        }, POLL_MS)
        return function () {
          alive = false
          clearInterval(timer)
        }
      }, [])

      /* The thumbnail strip scrolls now that cards keep their full height: keep the picked card
         in view when the selection moves (AI edits, 上移/下移, 新增页). */
      react.useEffect(
        function () {
          var body = bodyRef.current
          if (!body) return
          var node = body.querySelector('.ppt3-thumb[data-selected="true"]')
          if (node && typeof node.scrollIntoView === 'function') {
            try {
              node.scrollIntoView({ block: 'nearest' })
            } catch (error) {
              /* scrolling is cosmetic */
            }
          }
        },
        [selected]
      )

      /* 保存（防抖）：编辑后写回同一份 deck.json */
      var saveTimer = react.useRef(null)
      function queueSave(deck, forcedManualId) {
        pollRef.current.busy = true
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(function () {
          saveTimer.current = null
          var payload = JSON.parse(JSON.stringify(deck))
          payload.slides = (payload.slides || []).map(function (slide) {
            var manual = snapshot.manual[String(slide.id)] || (forcedManualId && String(slide.id) === forcedManualId)
            if (!manual) delete slide.elements
            return slide
          })
          var sent = expectedFileText(payload)
          selfWriteRef.current = { text: sent, at: Date.now() }
          saveDeck(snapshot.dir, payload).then(
            function (result) {
              pollRef.current.busy = false
              pollRef.current.text = sent
              report('saved', result && result.bytes)
              setNotice('已保存')
            },
            function (error) {
              pollRef.current.busy = false
              report('save-failed', error && error.message)
              setNotice('保存失败：' + (error && error.message))
            }
          )
        }, 420)
      }

      /**
       * @param {boolean} [bake] keep this page's elements in the file (the first in-place edit
       * turns a template-built page into a hand-positioned one, otherwise the next save would
       * drop the layout the user just edited).
       */
      function mutate(nextDeck, bake) {
        var bakeId = bake && slide ? String(slide.id) : ''
        setSnapshot(function (prev) {
          var manual = prev.manual
          if (bakeId) {
            manual = Object.assign({}, prev.manual)
            manual[bakeId] = true
          }
          return { status: prev.status, dir: prev.dir, deck: nextDeck, text: prev.text, manual: manual, error: '', parseError: '' }
        })
        queueSave(nextDeck, bakeId)
      }

      var deck = snapshot.deck
      var slides = (deck && deck.slides) || []
      var slide = slides[selected] || null
      var resolveImage = function (src) {
        if (!src || typeof src !== 'string') return null
        if (src.indexOf('://') >= 0) return src
        if (/^[a-zA-Z]:[\\/]/.test(src) || src.charAt(0) === '/') return null
        return BASE + '/asset?dir=' + encodeURIComponent(snapshot.dir || '') + '&rel=' + encodeURIComponent(src)
      }

      function previewHtml(target) {
        if (!deck || !target) return ''
        try {
          return Render.slideHtml(target, deck.theme, resolveImage)
        } catch (error) {
          report('render-failed', error && error.message)
          return ''
        }
      }

      /** Percent box of a node inside the slide wrapper. */
      function percentBox(node) {
        var wrap = wrapRef.current
        if (!node || !wrap) return null
        var rect = node.getBoundingClientRect()
        var base = wrap.getBoundingClientRect()
        if (!base.width || !base.height) return null
        return {
          left: ((rect.left - base.left) / base.width) * 100,
          top: ((rect.top - base.top) / base.height) * 100,
          width: (rect.width / base.width) * 100,
          height: (rect.height / base.height) * 100,
        }
      }

      /** Copy the rendered look so the editor looks exactly like the text it replaces. */
      function nodeStyle(node) {
        var style = window.getComputedStyle(node)
        return {
          fontSize: style.fontSize,
          color: style.color,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          textAlign: style.textAlign,
        }
      }

      /** 编辑框底色：按文字亮暗选深/浅底，保证在任何幻灯片上都读得清。 */
      function editorSurface(colorText) {
        var value = String(colorText || '').trim()
        var rgb = null
        var match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(value)
        if (match) {
          rgb = [Number(match[1]), Number(match[2]), Number(match[3])]
        } else if (/^#[0-9a-fA-F]{6}$/.test(value)) {
          rgb = [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)]
        }
        if (!rgb) return 'rgba(20,22,28,0.78)'
        var luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
        // 亮字 → 深底；暗字 → 浅底。中间灰阶两边都试一下，深底更保险些。
        if (luminance > 0.62) return 'rgba(20,22,28,0.82)'
        if (luminance < 0.38) return 'rgba(255,255,255,0.94)'
        return 'rgba(20,22,28,0.70)'
      }

      function elementNodes() {
        var preview = previewRef.current
        if (!preview) return []
        return Array.prototype.slice.call(preview.querySelectorAll('.el'))
      }

      function resetHidden() {
        elementNodes().forEach(function (node) {
          node.style.visibility = ''
        })
      }

      function beginTextEdit(index) {
        if (!slide || !Array.isArray(slide.elements)) return
        var element = slide.elements[index]
        if (!element || element.type !== 'text') return
        var node = elementNodes()[index]
        if (!node) return
        resetHidden()
        var box = percentBox(node)
        if (!box) return
        var style = nodeStyle(node)
        node.style.visibility = 'hidden'
        setEdit({ kind: 'text', index: index, draft: element.text || '', box: box, style: style, nowrap: element.nowrap === true })
        report('edit:start-text', index)
      }

      function beginCellEdit(cellNode) {
        if (!slide || !Array.isArray(slide.elements)) return
        var preview = previewRef.current
        var el = cellNode && cellNode.closest ? cellNode.closest('.el') : null
        if (!preview || !el) return
        var index = elementNodes().indexOf(el)
        var element = slide.elements[index]
        if (!element || element.type !== 'table') return
        var table = cellNode.closest('table')
        var row = cellNode.parentElement
        var rowIndex = table ? Array.prototype.slice.call(table.querySelectorAll('tr')).indexOf(row) : 0
        var colIndex = row ? Array.prototype.indexOf.call(row.children, cellNode) : 0
        if (rowIndex < 0) rowIndex = 0
        if (colIndex < 0) colIndex = 0
        var isHead = String(cellNode.tagName).toUpperCase() === 'TH'
        var text = isHead
          ? (element.columns || [])[colIndex] || ''
          : ((element.rows || [])[rowIndex - 1] || [])[colIndex] || ''
        var box = percentBox(cellNode)
        if (!box) return
        setEdit({ kind: 'cell', index: index, row: rowIndex, col: colIndex, head: isHead, draft: String(text), box: box, style: nodeStyle(cellNode) })
        report('edit:start-cell', rowIndex + ':' + colIndex)
      }

      /** Write one editor draft back into the deck and save. */
      function commitEdit() {
        if (!edit || !deck || !slide) return
        var next = JSON.parse(JSON.stringify(deck))
        var target = next.slides[selected]
        var element = target.elements && target.elements[edit.index]
        if (!element) {
          setEdit(null)
          resetHidden()
          return
        }
        var draft = String(edit.draft || '')
        if (edit.kind === 'text') {
          if (draft === element.text) {
            setEdit(null)
            resetHidden()
            return
          }
          element.text = draft
          if (element.role === 'title') target.title = draft.split('\n')[0]
          else if (element.role === 'body' && target.layout !== 'two-col') target.body = draft
        } else {
          if (edit.head) {
            element.columns = (element.columns || []).slice()
            element.columns[edit.col] = draft
          } else {
            var rows = (element.rows || []).map(function (row) {
              return row.slice()
            })
            var line = edit.row - 1
            while (rows.length <= line) rows.push([])
            while (rows[line].length <= edit.col) rows[line].push('')
            rows[line][edit.col] = draft
            element.rows = rows
          }
        }
        setEdit(null)
        resetHidden()
        mutate(next, true)
        report('edit:commit', edit.kind)
      }

      function cancelEdit() {
        setEdit(null)
        resetHidden()
        report('edit:cancel')
      }

      react.useEffect(
        function () {
          var node = editorRef.current
          if (!node) return
          try {
            node.focus()
            var end = node.value.length
            node.setSelectionRange(end, end)
            // The Harness shell styles form controls with a pale -webkit-text-fill-color;
            // force the editor back to its own text colour (inline + important wins).
            if (edit && edit.style && edit.style.color) {
              node.style.setProperty('-webkit-text-fill-color', edit.style.color, 'important')
            }
          } catch (error) {
            /* focus is best-effort */
          }
        },
        [edit && edit.index, edit && edit.kind, edit && edit.row, edit && edit.col]
      )

      function patchSlide(patch) {
        if (!deck || !slide) return
        var next = JSON.parse(JSON.stringify(deck))
        var target = next.slides[selected]
        for (var key in patch) target[key] = patch[key]
        next.slides[selected] = Render.relayout(next.slides[selected], next, target.layout || 'bullets')
        mutate(next)
      }

      /** Imported pages keep their text in elements, so the heading field writes there. */
      function patchTitleText(value) {
        if (!deck || !slide) return
        var next = JSON.parse(JSON.stringify(deck))
        var target = next.slides[selected]
        target.title = value
        var list = target.elements || []
        for (var i = 0; i < list.length; i += 1) {
          if (list[i] && list[i].type === 'text' && list[i].role === 'title') {
            list[i].text = value
            break
          }
        }
        mutate(next)
      }

      function relayout(layout) {
        if (!deck || !slide) return
        var next = JSON.parse(JSON.stringify(deck))
        next.slides[selected] = Render.relayout(next.slides[selected], next, layout)
        mutate(next)
      }

      function addSlide() {
        if (!deck) return
        var next = JSON.parse(JSON.stringify(deck))
        var blank = { id: Render.newId('s'), layout: 'bullets', title: '新页面', body: '', elements: [] }
        next.slides.push(Render.relayout(blank, next, 'bullets'))
        setSelected(next.slides.length - 1)
        mutate(next)
      }

      function duplicateSlide() {
        if (!deck || !slide) return
        var next = JSON.parse(JSON.stringify(deck))
        var copy = JSON.parse(JSON.stringify(next.slides[selected]))
        copy.id = Render.newId('s')
        next.slides.splice(selected + 1, 0, copy)
        setSelected(selected + 1)
        mutate(next)
      }

      function deleteSlide() {
        if (!deck || slides.length <= 1) return
        var next = JSON.parse(JSON.stringify(deck))
        next.slides.splice(selected, 1)
        setSelected(Math.max(0, Math.min(selected, next.slides.length - 1)))
        mutate(next)
      }

      function moveSlide(delta) {
        if (!deck) return
        var target = selected + delta
        if (target < 0 || target >= slides.length) return
        var next = JSON.parse(JSON.stringify(deck))
        var moved = next.slides.splice(selected, 1)[0]
        next.slides.splice(target, 0, moved)
        setSelected(target)
        mutate(next)
      }

      function createSample() {
        if (!snapshot.dir) return
        var payload = JSON.parse(JSON.stringify(Render.ensureElements(Render.sampleDeck())))
        payload.slides = payload.slides.map(function (item) {
          delete item.elements
          return item
        })
        var sampleText = expectedFileText(payload)
        selfWriteRef.current = { text: sampleText, at: Date.now() }
        saveDeck(snapshot.dir, payload).then(
          function () {
            pollRef.current.text = sampleText
            setNotice('已创建示例文稿')
          },
          function (error) {
            setNotice('创建失败：' + (error && error.message))
          }
        )
      }

      /** Drag the divider to size the two halves; double-click restores the default ratio. */
      function startResize(event) {
        event.preventDefault()
        draggingRef.current = true
        var splitterNode = event.currentTarget
        if (splitterNode) splitterNode.setAttribute('data-dragging', 'true')
        try {
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        } catch (error) {
          /* cosmetic only */
        }
        var body = bodyRef.current
        function move(moveEvent) {
          if (!draggingRef.current || !body) return
          var rect = body.getBoundingClientRect()
          var thumbsNode = body.querySelector('.ppt3-thumbs')
          var leftInset = thumbsNode ? thumbsNode.getBoundingClientRect().width : 0
          var usable = Math.max(1, rect.width - leftInset - SPLITTER_PX)
          var ratio = (moveEvent.clientX - rect.left - leftInset) / usable
          ratio = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, ratio))
          setSplitRatio(ratio)
        }
        function stop() {
          draggingRef.current = false
          if (splitterNode) splitterNode.removeAttribute('data-dragging')
          try {
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
          } catch (error) {
            /* cosmetic only */
          }
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', stop)
          try {
            window.localStorage.setItem(SPLIT_KEY, String(splitRatioRef.current))
          } catch (error) {
            /* persistence is best-effort */
          }
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', stop)
      }

      function resetResize() {
        setSplitRatio(SPLIT_DEFAULT)
        try {
          window.localStorage.removeItem(SPLIT_KEY)
        } catch (error) {
          /* best-effort */
        }
      }
      /* ---------------- 顶栏 ---------------- */
      /* The deck name is the primary line: it is what you are looking at all day. */
      var head = h(
        'div',
        { className: 'ppt3-head' },
        h(
          'div',
          { className: 'ppt3-head-main' },
          h('span', { className: 'ppt3-eyebrow' }, TITLE),
          h('span', { className: 'ppt3-title', title: deck && deck.meta ? deck.meta.title : '正在读取…' }, deck ? (deck.meta && deck.meta.title) || '未命名文稿' : '正在读取…'),
          deck ? h('span', { className: 'ppt3-count', title: '共 ' + slides.length + ' 页' }, String(slides.length).padStart(2, '0') + ' 页') : null
        ),
        notice
          ? h('span', { className: 'ppt3-chip ' + (/失败/.test(notice) ? 'warn' : 'note') }, notice)
          : h('span', { className: 'ppt3-chip ok' }, h('span', { className: 'ppt3-dot' }), '已同步'),
        h('span', { className: 'ppt3-spacer' }),
        snapshot.dir ? h('span', { className: 'ppt3-dir', title: snapshot.dir }, snapshot.dir) : null,
        h(
          'button',
          { className: 'ppt3-btn ghost', type: 'button', onClick: function () { setChatOpen(!chatOpen) }, title: chatOpen ? '收起右侧对话' : '展开右侧对话' },
          chatOpen ? '收起对话 ›' : '‹ 展开对话'
        ),
        h('button', { className: 'ppt3-btn', type: 'button', onClick: backToConversation, title: '把主区域还给对话' }, '回到对话')
      )

      /* ---------------- 缩略图列 ---------------- */
      var thumbs = h(
        'div',
        { className: 'ppt3-thumbs' },
        slides.length === 0
          ? h('div', { className: 'ppt3-notice' }, '还没有页面')
          : slides.map(function (item, index) {
              return h(
                'div',
                {
                  key: item.id || String(index),
                  className: 'ppt3-thumb',
                  'data-selected': index === selected ? 'true' : 'false',
                  'data-ai': aiMark && aiMark.pages.indexOf(index + 1) >= 0 ? 'true' : undefined,
                  title: (LAYOUT_LABELS[item.layout] || item.layout || '') + ' · 第 ' + (index + 1) + ' 页',
                  onClick: function () {
                    setSelected(index)
                  },
                },
                h(
                  'div',
                  { className: 'ppt3-thumb-head' },
                  h('span', { className: 'ppt3-thumb-num' }, String(index + 1).padStart(2, '0')),
                  index === selected ? h('span', { className: 'ppt3-thumb-edited', title: '当前编辑页' }) : null,
                  h('span', { className: 'ppt3-thumb-layout' }, LAYOUT_LABELS[item.layout] || item.layout || '')
                ),
                h('div', { className: 'ppt3-thumb-frame', dangerouslySetInnerHTML: { __html: previewHtml(item) } })
              )
            })
      )

      /* ---------------- 中间编辑区 ---------------- */
      var editor = null
      if (!slide) {
        editor = h(
          'div',
          { className: 'ppt3-main' },
          h(
            'div',
            { className: 'ppt3-empty' },
            h('div', { className: 'ppt3-title' }, snapshot.status === 'loading' ? '正在读取…' : '这个工作区还没有 PPT 文稿'),
            h('div', { className: 'ppt3-notice' }, '在工作区生成 .ppt-studio/deck.json 会自动出现在这里'),
            h(
              'div',
              { className: 'ppt3-row' },
              h('button', { className: 'ppt3-btn primary', type: 'button', onClick: createSample }, '新建示例文稿'),
              h('button', { className: 'ppt3-btn', type: 'button', onClick: backToConversation }, '回到对话让 AI 生成')
            ),
            snapshot.error ? h('div', { className: 'ppt3-error' }, snapshot.error) : null
          )
        )
      } else {
        var table = slide.table || { columns: [], rows: [] }
        var showImage = slide.layout === 'image-right' || slide.layout === 'image-full'
        var importedPage = slide.layout === 'imported'
        var usesBody = !importedPage && !(slide.layout === 'table' && table.columns.length > 0)
        var titleElementIndex = -1
        if (importedPage && Array.isArray(slide.elements)) {
          for (var ei = 0; ei < slide.elements.length; ei += 1) {
            if (slide.elements[ei] && slide.elements[ei].type === 'text' && slide.elements[ei].role === 'title') {
              titleElementIndex = ei
              break
            }
          }
        }
        var titleValue = importedPage && titleElementIndex >= 0 ? slide.elements[titleElementIndex].text : slide.title || ''
        var canvasW = (deck.size && deck.size.width) || 13.333
        var canvasH = (deck.size && deck.size.height) || 7.5
        var hitLayer =
          !edit && Array.isArray(slide.elements)
            ? h(
                'div',
                { className: 'ppt3-hitlayer' },
                slide.elements.map(function (element, index) {
                  if (!element || element.type !== 'text' || !String(element.text || '').trim()) return null
                  return h('div', {
                    key: 'hit' + index,
                    className: 'ppt3-hit',
                    title: '点击直接改这段文字',
                    style: {
                      left: (element.x / canvasW) * 100 + '%',
                      top: (element.y / canvasH) * 100 + '%',
                      width: (element.w / canvasW) * 100 + '%',
                      height: (element.h / canvasH) * 100 + '%',
                    },
                    onMouseDown: function (event) {
                      event.preventDefault()
                      beginTextEdit(index)
                    },
                  })
                })
              )
            : null
        var stageEditor = edit
          ? h('textarea', {
              className: 'ppt3-editor',
              ref: editorRef,
              value: edit.draft,
              spellCheck: false,
              'data-nowrap': edit.nowrap ? 'true' : undefined,
              wrap: edit.nowrap ? 'off' : 'soft',
              style: {
                left: edit.box.left + '%',
                top: edit.box.top + '%',
                width: edit.box.width + '%',
                height: edit.box.height + '%',
                background: editorSurface(edit.style.color),
                // 幻灯片缩到 ~570px 宽时，小字只剩 5px：编辑器里至少给到 11px 才可用
                fontSize: Math.min(48, Math.max(11, parseFloat(edit.style.fontSize) || 11)) + 'px',
                color: edit.style.color,
                fontFamily: edit.style.fontFamily,
                fontWeight: edit.style.fontWeight,
                lineHeight: edit.style.lineHeight,
                textAlign: edit.style.textAlign,
              },
              onChange: function (event) {
                setEdit(Object.assign({}, edit, { draft: event.target.value }))
              },
              onBlur: function () {
                commitEdit()
              },
              onKeyDown: function (event) {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelEdit()
                } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  commitEdit()
                }
              },
            })
          : null

        editor = h(
          'div',
          { className: 'ppt3-main' },
          /* The projected slide: stage frame, slide, then a caption strip carrying the page
             counter and the two page-flip buttons (paging is the one thing you do constantly). */
          h(
            'div',
            { className: 'ppt3-stage' },
            h(
              'div',
              { className: 'ppt3-preview-wrap', ref: wrapRef },
              h('div', {
                className: 'ppt3-preview',
                ref: previewRef,
                onClick: function (event) {
                  var target = event.target
                  var cell = target && target.closest ? target.closest('td,th') : null
                  if (cell) beginCellEdit(cell)
                },
                dangerouslySetInnerHTML: { __html: previewHtml(slide) },
              }),
              hitLayer,
              stageEditor
            ),
            h(
              'div',
              { className: 'ppt3-stagebar' },
              h('span', { className: 'ppt3-stagenum' }, String(selected + 1).padStart(2, '0')),
              h('span', { className: 'ppt3-stagetotal' }, '/ ' + String(slides.length).padStart(2, '0')),
              aiMark && aiMark.pages.length
                ? h(
                    'button',
                    {
                      className: 'ppt3-aimark',
                      type: 'button',
                      title:
                        '文件刚被外部改动：' +
                        (aiMark.changed ? '改动 ' + aiMark.changed + ' 页' : '') +
                        (aiMark.added ? (aiMark.changed ? ' · ' : '') + '新增 ' + aiMark.added + ' 页' : '') +
                        (aiMark.removed ? (aiMark.changed || aiMark.added ? ' · ' : '') + '删除 ' + aiMark.removed + ' 页' : '') +
                        '，点击跳过去',
                      onClick: function () {
                        setSelected(Math.max(0, Math.min(slides.length - 1, aiMark.pages[0] - 1)))
                      },
                    },
                    '第 ' + aiMark.pages[0] + ' 页刚更新',
                    aiMark.pages.length > 1 ? ' 等 ' + aiMark.pages.length + ' 页' : ''
                  )
                : null,
              h('span', { className: 'ppt3-spacer' }),
              h(
                'button',
                {
                  className: 'ppt3-navbtn',
                  type: 'button',
                  title: '上一页',
                  disabled: selected <= 0,
                  onClick: function () {
                    setSelected(selected - 1)
                  },
                },
                '‹'
              ),
              h(
                'button',
                {
                  className: 'ppt3-navbtn',
                  type: 'button',
                  title: '下一页',
                  disabled: selected >= slides.length - 1,
                  onClick: function () {
                    setSelected(selected + 1)
                  },
                },
                '›'
              )
            )
          ),
          h(
            'div',
            { className: 'ppt3-toolbar' },
            h('button', { className: 'ppt3-btn primary', type: 'button', onClick: addSlide }, '＋ 新增页'),
            h('button', { className: 'ppt3-btn', type: 'button', onClick: duplicateSlide }, '复制本页'),
            h('span', { className: 'ppt3-toolbar-sep' }),
            h('button', { className: 'ppt3-btn ghost', type: 'button', title: '上移本页', onClick: function () { moveSlide(-1) }, disabled: selected <= 0 }, '↑ 上移'),
            h('button', { className: 'ppt3-btn ghost', type: 'button', title: '下移本页', onClick: function () { moveSlide(1) }, disabled: selected >= slides.length - 1 }, '↓ 下移'),
            h('span', { className: 'ppt3-spacer' }),
            h('button', { className: 'ppt3-btn danger', type: 'button', title: '删除本页', onClick: deleteSlide, disabled: slides.length <= 1 }, '删除本页')
          ),
          h(
            'div',
            { className: 'ppt3-form' },
            h(
              'div',
              { className: 'ppt3-field' },
              h('label', null, '版式'),
              h(
                'select',
                {
                  value: slide.layout || 'bullets',
                  onChange: function (event) {
                    relayout(event.target.value)
                  },
                },
                LAYOUTS.map(function (id) {
                  return h('option', { key: id, value: id }, LAYOUT_LABELS[id])
                })
              )
            ),
            h(
              'div',
              { className: 'ppt3-field col-main' },
              h('label', null, importedPage ? '标题 · 同步到原稿的主标题' : '标题'),
              h('input', {
                value: titleValue,
                onChange: function (event) {
                  if (importedPage) patchTitleText(event.target.value)
                  else patchSlide({ title: event.target.value })
                },
              })
            ),
            /* The table layout renders title + table only, so the body field would be dead weight. */
            usesBody
              ? h(
                  'div',
                  { className: 'ppt3-field full' },
                  h('label', null, '正文 · 每行一条要点'),
                  h('textarea', {
                    value: slide.body || '',
                    onChange: function (event) {
                      patchSlide({ body: event.target.value })
                    },
                  })
                )
              : null,
            showImage
              ? h(
                  'div',
                  { className: 'ppt3-field full' },
                  h('label', null, '图片路径 · 相对 .ppt-studio/assets'),                  h('input', {
                    value: slide.image || '',
                    placeholder: 'assets/banner.png',
                    onChange: function (event) {
                      patchSlide({ image: event.target.value })
                    },
                  })
                )
              : null,
            importedPage
              ? h(
                  'div',
                  { className: 'ppt3-field full' },
                  h(
                    'div',
                    { className: 'ppt3-notice' },
                    '原样排版页 · 共 ' + (slide.elements || []).length + ' 个元素。直接点页面上的文字就能改（表格点单元格），点别处自动保存；颜色 / 字号 / 位置暂不支持。'
                  )
                )
              : null,
            slide.layout === 'table'
              ? h(
                  'div',
                  { className: 'ppt3-field full' },
                  h('div', { className: 'ppt3-section-label' }, '表格内容'),
                  h('label', null, '列名 · 用 | 分隔'),
                  h('input', {
                    value: table.columns.join(' | '),
                    onChange: function (event) {
                      var columns = event.target.value
                        .split('|')
                        .map(function (cell) {
                          return cell.trim()
                        })
                        .filter(function (cell) {
                          return cell.length > 0
                        })
                      patchSlide({ table: { columns: columns, rows: table.rows } })
                    },
                  }),
                  h('label', null, '数据 · 每行一条，单元格用 | 分隔'),
                  h('textarea', {
                    value: (table.rows || [])
                      .map(function (row) {
                        return row.join(' | ')
                      })
                      .join('\n'),
                    onChange: function (event) {
                      var rows = event.target.value.split('\n').map(function (line) {
                        return line.split('|').map(function (cell) {
                          return cell.trim()
                        })
                      })
                      patchSlide({ table: { columns: table.columns, rows: rows } })
                    },
                  })
                )
              : null
          ),
          snapshot.error ? h('div', { className: 'ppt3-error' }, snapshot.error) : null,
          snapshot.parseError ? h('div', { className: 'ppt3-error' }, 'deck.json 解析失败：' + snapshot.parseError) : null
        )
      }

      /** Flex-grow strings for the two halves; three decimals keep React output stable. */
      function shareRatio(value) {
        return String(Math.round(value * 1000) / 1000)
      }

      return h(
        'div',
        { className: 'ppt3-page' },
        head,
        h(
          'div',
          { className: 'ppt3-body', ref: bodyRef },
          thumbs,
          h(
            'div',
            {
              className: 'ppt3-splitmain',
              style: chatOpen
                ? { flex: shareRatio(splitRatio) + ' 1 0%', minWidth: 0, display: 'flex' }
                : { flex: '1 1 auto', minWidth: 0, display: 'flex' },
            },
            editor
          ),
          chatOpen
            ? h('div', {
                className: 'ppt3-splitter',
                onMouseDown: startResize,
                onDoubleClick: resetResize,
                title: '拖动调整左右宽度，双击恢复默认',
              })
            : null,
          chatOpen
            ? h(
                'div',
                { className: 'ppt3-chatcol', style: { flex: shareRatio(1 - splitRatio) + ' 1 0%', minWidth: '220px', maxWidth: '70%' } },
                h(ChatBody, null)
              )
            : null
        )
      )
    }

