    /* ------------------------------------------------------------------ Markdown */

    /*
     * The agent answers in Markdown, so the chat column renders it instead of dumping raw
     * `**bold**`, `|tables|` and backticks into the transcript. Everything here builds React
     * elements (never innerHTML), so model output cannot inject markup into the page.
     */

    /**
     * Split one line into inline tokens: code, bold, italic, link, text.
     * The pattern is per-call so nested rendering (bold inside link text) can recurse safely.
     */
    function mdInline(text) {
      var pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s)）】，。]+)/g
      var rest = String(text == null ? '' : text)
      var out = []
      var last = 0
      var match
      while ((match = pattern.exec(rest))) {
        if (match.index > last) out.push({ t: 'text', v: rest.slice(last, match.index) })
        var token = match[0]
        if (token.charAt(0) === '`') {
          out.push({ t: 'code', v: token.slice(1, -1) })
        } else if (token.indexOf('**') === 0) {
          out.push({ t: 'bold', v: token.slice(2, -2) })
        } else if (token.indexOf('__') === 0) {
          out.push({ t: 'bold', v: token.slice(2, -2) })
        } else if (token.charAt(0) === '[') {
          var link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
          out.push({ t: 'link', v: link ? link[1] : token, href: link ? link[2] : '' })
        } else if (token.indexOf('http') === 0) {
          out.push({ t: 'link', v: token, href: token })
        } else {
          out.push({ t: 'italic', v: token.slice(1, -1) })
        }
        last = match.index + token.length
      }
      if (last < rest.length) out.push({ t: 'text', v: rest.slice(last) })
      return out
    }

    function mdCells(line) {
      var trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
      return trimmed.split('|').map(function (cell) {
        return cell.trim()
      })
    }

    function mdIsDivider(line) {
      if (line.indexOf('-') < 0 && line.indexOf(':') < 0) return false
      if (line.indexOf('|') < 0) return false
      return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line)
    }

    function mdIsListStart(line) {
      return /^\s*([-*+•]|\d+[.)])\s+/.test(line)
    }

    function mdIsBlockStart(line, next) {
      if (/^\s*```/.test(line)) return true
      if (/^\s{0,3}#{1,6}\s+/.test(line)) return true
      if (/^\s*>/.test(line)) return true
      if (mdIsListStart(line)) return true
      if (line.indexOf('|') >= 0 && next != null && mdIsDivider(next)) return true
      return false
    }

    /** Parse Markdown into a small block list the renderer can turn into elements. */
    function mdBlocks(text) {
      var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n')
      var blocks = []
      var i = 0
      while (i < lines.length) {
        var line = lines[i]
        if (!line.trim()) {
          i += 1
          continue
        }
        if (/^\s*```/.test(line)) {
          var lang = line.trim().replace(/^```/, '').trim()
          var buffer = []
          i += 1
          while (i < lines.length && !/^\s*```/.test(lines[i])) {
            buffer.push(lines[i])
            i += 1
          }
          i += 1
          blocks.push({ type: 'code', lang: lang, text: buffer.join('\n') })
          continue
        }
        var heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          blocks.push({ type: 'h', level: heading[1].length, text: heading[2].trim() })
          i += 1
          continue
        }
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
          blocks.push({ type: 'hr' })
          i += 1
          continue
        }
        if (line.indexOf('|') >= 0 && i + 1 < lines.length && mdIsDivider(lines[i + 1])) {
          var head = mdCells(line)
          i += 2
          var rows = []
          while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) {
            rows.push(mdCells(lines[i]))
            i += 1
          }
          blocks.push({ type: 'table', head: head, rows: rows })
          continue
        }
        if (/^\s*>/.test(line)) {
          var quoted = []
          while (i < lines.length && /^\s*>/.test(lines[i])) {
            quoted.push(lines[i].replace(/^\s*>\s?/, ''))
            i += 1
          }
          blocks.push({ type: 'quote', text: quoted.join('\n') })
          continue
        }
        if (mdIsListStart(line)) {
          var ordered = /^\s*\d/.test(line)
          var items = []
          while (i < lines.length && mdIsListStart(lines[i])) {
            var itemMatch = /^\s*([-*+•]|\d+[.)])\s+(.*)$/.exec(lines[i])
            var item = itemMatch ? itemMatch[2] : lines[i].trim()
            i += 1
            while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !mdIsListStart(lines[i])) {
              item += '\n' + lines[i].trim()
              i += 1
            }
            items.push(item)
          }
          blocks.push({ type: 'list', ordered: ordered, items: items })
          continue
        }
        var paragraph = [line]
        i += 1
        while (i < lines.length && lines[i].trim() && !mdIsBlockStart(lines[i], lines[i + 1])) {
          paragraph.push(lines[i])
          i += 1
        }
        blocks.push({ type: 'p', text: paragraph.join('\n') })
      }
      return blocks
    }

    function mdInlineNodes(tokens) {
      var nodes = []
      for (var i = 0; i < tokens.length; i += 1) {
        var token = tokens[i]
        if (token.t === 'code') nodes.push(h('code', { key: 'i' + i, className: 'ppt4-md-code' }, token.v))
        else if (token.t === 'bold') nodes.push(h('strong', { key: 'i' + i }, mdInlineNodes(mdInline(token.v))))
        else if (token.t === 'italic') nodes.push(h('em', { key: 'i' + i }, mdInlineNodes(mdInline(token.v))))
        // Links stay non-navigating: a click must never reload the Harness shell.
        else if (token.t === 'link') nodes.push(h('span', { key: 'i' + i, className: 'ppt4-md-link', title: token.href || token.v }, token.v))
        else nodes.push(token.v)
      }
      return nodes
    }

    /** Render one Markdown string as a stack of chat blocks. */
    function Md(props) {
      var text = props && props.text
      if (!text) return null
      var blocks = mdBlocks(text)
      var nodes = []
      for (var i = 0; i < blocks.length; i += 1) {
        var block = blocks[i]
        var key = 'b' + i
        if (block.type === 'p') {
          nodes.push(h('div', { key: key, className: 'ppt4-md-p' }, mdInlineNodes(mdInline(block.text))))
        } else if (block.type === 'h') {
          nodes.push(
            h('div', { key: key, className: 'ppt4-md-h', 'data-level': String(Math.min(block.level, 4)) }, mdInlineNodes(mdInline(block.text)))
          )
        } else if (block.type === 'code') {
          nodes.push(h('pre', { key: key, className: 'ppt4-md-pre' }, h('code', null, block.text)))
        } else if (block.type === 'quote') {
          nodes.push(h('div', { key: key, className: 'ppt4-md-quote' }, mdInlineNodes(mdInline(block.text))))
        } else if (block.type === 'hr') {
          nodes.push(h('div', { key: key, className: 'ppt4-md-hr' }))
        } else if (block.type === 'list') {
          var items = []
          for (var j = 0; j < block.items.length; j += 1) {
            items.push(h('li', { key: 'l' + j }, mdInlineNodes(mdInline(block.items[j]))))
          }
          nodes.push(h(block.ordered ? 'ol' : 'ul', { key: key, className: 'ppt4-md-list' }, items))
        } else if (block.type === 'table') {
          var headCells = []
          for (var c = 0; c < block.head.length; c += 1) {
            headCells.push(h('th', { key: 'h' + c }, mdInlineNodes(mdInline(block.head[c]))))
          }
          var bodyRows = []
          for (var r = 0; r < block.rows.length; r += 1) {
            var cells = []
            for (var k = 0; k < block.rows[r].length; k += 1) {
              cells.push(h('td', { key: 'c' + k }, mdInlineNodes(mdInline(block.rows[r][k]))))
            }
            bodyRows.push(h('tr', { key: 'r' + r }, cells))
          }
          nodes.push(
            h(
              'div',
              { key: key, className: 'ppt4-md-table' },
              h('table', null, h('thead', null, h('tr', null, headCells)), h('tbody', null, bodyRows))
            )
          )
        }
      }
      return h('div', { className: 'ppt4-md' }, nodes)
    }
