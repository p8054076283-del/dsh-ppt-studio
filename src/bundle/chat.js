    /* ------------------------------------------------------------------ 右栏对话 */

    var CHAT_CSS =
      '.ppt4{position:relative;display:flex;flex-direction:column;flex:1 1 auto;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);container-type:inline-size}' +
      '.ppt4-head{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}' +
      '.ppt4-title{font-weight:650;font-size:12.5px;letter-spacing:.02em;white-space:nowrap;flex:0 0 auto}' +
      '.ppt4-pill{display:inline-flex;align-items:center;gap:5px;height:19px;padding:0 7px;border-radius:999px;font-size:10px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:0 0 auto}' +
      '.ppt4-pill.busy{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)}' +
      '.ppt4-dot{width:5px;height:5px;border-radius:999px;background:currentColor;display:inline-block}' +
      '.ppt4-log{flex:1 1 auto;min-height:0;overflow:auto;padding:14px 12px;display:flex;flex-direction:column;gap:14px}' +
      '.ppt4-msg{display:flex;gap:9px;align-items:flex-start}' +
      '.ppt4-msg.user{justify-content:flex-end}' +
      '.ppt4-avatar{flex:0 0 22px;width:22px;height:22px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:650;letter-spacing:.02em;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);margin-top:2px}' +
      '.ppt4-msg.user .ppt4-avatar{display:none}' +
      '.ppt4-body{flex:1 1 auto;min-width:0;max-width:100%;display:flex;flex-direction:column;gap:4px}' +
      '.ppt4-msg.user .ppt4-body{flex:0 1 auto;align-items:flex-end}' +
      '.ppt4-who{display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.05em;color:var(--dsw-alias-label-secondary)}' +
      '.ppt4-msg.user .ppt4-who{justify-content:flex-end}' +
      /* Assistant answers sit on the page itself: a hairline in the accent, no box, so long
         Markdown reports stay readable. The user's own words keep a tinted bubble. */
      '.ppt4-bubble{padding:1px 0 1px 10px;border-left:2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent);white-space:normal;word-break:break-word;line-height:1.68;color:var(--dsw-alias-label-primary);max-height:min(72vh,760px);overflow:auto}' +
      '.ppt4-bubble strong{font-weight:650}' +
      '.ppt4-msg.user .ppt4-bubble{max-width:86%;padding:8px 11px;border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent);border-left:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);border-radius:12px 12px 4px 12px}' +
      '.ppt4-foot{flex:0 0 auto;border-top:1px solid var(--dsw-alias-border-l1);padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-1)}' +
      '.ppt4-chips{display:flex;gap:6px;flex-wrap:nowrap;align-items:center;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}' +
      '.ppt4-chips::-webkit-scrollbar{height:0}' +
      '.ppt4-chips-sep{flex:0 0 auto;width:1px;height:14px;background:var(--dsw-alias-border-l1)}' +
      '.ppt4-attach{flex:0 0 auto;appearance:none;display:inline-flex;align-items:center;justify-content:center;width:23px;height:23px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .14s,color .14s,border-color .14s}' +
      '.ppt4-attach:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}' +
      /* pending attachments: name + size + remove, above the composer */
      '.ppt4-files{display:flex;flex-wrap:wrap;gap:6px}' +
      '.ppt4-file{display:inline-flex;align-items:center;gap:6px;max-width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);padding:4px 4px 4px 8px;font-size:11px}' +
      '.ppt4-file[data-state="uploading"]{border-style:dashed;color:var(--dsw-alias-label-secondary)}' +
      '.ppt4-file-name{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.ppt4-file-size{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:9.5px;color:var(--dsw-alias-label-secondary)}' +
      '.ppt4-file-x{appearance:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:1;padding:0 3px;border-radius:5px}' +
      '.ppt4-file-x:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)}' +
      '.ppt4-file-import{appearance:none;border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);color:var(--dsw-alias-brand-primary);border-radius:6px;font:inherit;font-size:10.5px;line-height:1;padding:3px 7px;cursor:pointer;white-space:nowrap}' +
      '.ppt4-file-import:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent)}' +
      '.ppt4-file-import:disabled{opacity:.6;cursor:default}' +
      /* drop target feedback while a file is dragged over the column */
      '.ppt4-drop{position:absolute;left:8px;right:8px;top:8px;bottom:8px;z-index:9;display:flex;align-items:center;justify-content:center;border:2px dashed var(--dsw-alias-brand-primary);border-radius:14px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-brand-primary);font-size:12.5px;pointer-events:none}' +
      '.ppt4[data-drop="true"] .ppt4-log{opacity:.35}' +
      /* 对话 / 过程 切换 */
      '.ppt4-tabs{display:flex;gap:2px;padding:5px 10px 0;flex:0 0 auto;border-bottom:1px solid var(--dsw-alias-border-l1)}' +
      '.ppt4-tab{appearance:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;padding:5px 9px 6px;border-radius:8px 8px 0 0;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background .14s,color .14s}' +
      '.ppt4-tab:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-bg-layer-2) 65%, transparent)}' +
      '.ppt4-tab.is-active{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}' +
      '.ppt4-tab-count{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:9.5px;font-weight:600;line-height:1;padding:2px 5px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);color:var(--dsw-alias-brand-primary)}' +
      /* 过程时间线 */
      '.ppt4-process{padding:6px 10px;gap:0}' +
      '.ppt4-step{display:grid;grid-template-columns:10px auto minmax(0,1fr) auto;align-items:center;gap:7px;padding:6px 2px;border-bottom:1px dashed color-mix(in srgb, var(--dsw-alias-border-l1) 65%, transparent);font-size:11.5px;line-height:1.35}' +
      '.ppt4-step:last-child{border-bottom:none}' +
      '.ppt4-step-dot{width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-label-secondary);justify-self:center}' +
      '.ppt4-step[data-status="done"] .ppt4-step-dot{background:var(--dsw-alias-state-success-primary)}' +
      '.ppt4-step[data-status="failed"] .ppt4-step-dot{background:var(--dsw-alias-state-error-primary)}' +
      '.ppt4-step[data-status="running"] .ppt4-step-dot{background:var(--dsw-alias-brand-primary);animation:ppt4-pulse 1.1s ease-in-out infinite}' +
      '.ppt4-step[data-status="failed"] .ppt4-step-label{color:var(--dsw-alias-state-error-primary)}' +
      '.ppt4-step-label{white-space:nowrap;color:var(--dsw-alias-label-primary)}' +
      '.ppt4-step-target{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.ppt4-step-ms{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}' +
      '.ppt4-process-empty{padding:16px 4px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.85}' +
      '@keyframes ppt4-pulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}' +
      '.ppt4-chip{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;height:23px;padding:0 10px;font-size:11px;font-family:inherit;cursor:pointer;white-space:nowrap;flex:0 0 auto;transition:background .14s,color .14s,border-color .14s}' +
      '.ppt4-chip:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}' +
      '.ppt4-input{display:flex;gap:7px;align-items:flex-end}' +
      '.ppt4-input textarea{-webkit-text-fill-color:currentColor!important;flex:1 1 auto;min-height:36px;max-height:104px;resize:vertical;border-radius:11px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;padding:9px 11px;box-sizing:border-box;line-height:1.5;transition:border-color .14s,box-shadow .14s}' +
      '.ppt4-input textarea:hover{border-color:var(--dsw-alias-border-l2)}' +
      '.ppt4-input textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)}' +
      '.ppt4-send{flex:0 0 auto;appearance:none;border:1px solid transparent;background:var(--dsw-alias-brand-primary);color:#fff;border-radius:11px;height:36px;padding:0 15px;font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer;transition:filter .14s,transform .06s;box-shadow:0 10px 22px -14px var(--dsw-alias-brand-primary)}' +
      '.ppt4-send:hover{filter:brightness(1.07)}' +
      '.ppt4-send:active{transform:translateY(1px)}' +
      '.ppt4-send:disabled{opacity:.38;cursor:default;filter:none;box-shadow:none}' +
      '.ppt4-empty{margin:auto;max-width:100%;color:var(--dsw-alias-label-secondary);font-size:12px;padding:16px;line-height:1.8;border:1px dashed var(--dsw-alias-border-l2);border-radius:14px;background:color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent)}' +
      '.ppt4-empty b{color:var(--dsw-alias-label-primary);font-weight:650}' +
      '.ppt4-ask{margin:10px 12px 0;border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, transparent);border-radius:14px;padding:11px;display:flex;flex-direction:column;gap:9px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent)}' +
      '.ppt4-ask-head{font-size:10px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-brand-primary)}' +
      '.ppt4-ask-item{display:flex;flex-direction:column;gap:6px}' +
      '.ppt4-ask-header{font-size:11px;color:var(--dsw-alias-label-secondary)}' +
      '.ppt4-ask-question{font-size:12.5px;line-height:1.55}' +
      '.ppt4-ask-detail{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.5}' +
      '.ppt4-ask-options{display:flex;flex-wrap:wrap;gap:6px}' +
      '.ppt4-ask-option{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:9px;min-height:27px;padding:4px 10px;font-size:12px;font-family:inherit;cursor:pointer;text-align:left;transition:border-color .14s,background .14s}' +
      '.ppt4-ask-option:hover{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}' +
      '.ppt4-ask-option.active{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);color:var(--dsw-alias-brand-primary)}' +
      '.ppt4-ask-input{border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:6px 9px}' +
      '.ppt4-ask-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}' +
      '.ppt4-banner-btn{margin-left:auto;appearance:none;border:1px solid currentColor;background:transparent;color:inherit;border-radius:7px;height:22px;padding:0 9px;font-size:11px;font-family:inherit;cursor:pointer}' +
      '.ppt4-error{color:var(--dsw-alias-state-error-primary);font-size:11.5px}' +
      /* rendered Markdown inside a bubble */
      '.ppt4-md{display:flex;flex-direction:column;gap:7px}' +
      '.ppt4-md-p{margin:0;white-space:pre-wrap;word-break:break-word}' +
      '.ppt4-md-h{font-weight:650;letter-spacing:.01em}' +
      '.ppt4-md-h[data-level="1"]{font-size:15px}' +
      '.ppt4-md-h[data-level="2"]{font-size:13.5px}' +
      '.ppt4-md-h[data-level="3"]{font-size:12.5px}' +
      '.ppt4-md-h[data-level="4"]{font-size:12.5px;color:var(--dsw-alias-label-secondary)}' +
      '.ppt4-md-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;padding:1px 4px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);word-break:break-all}' +
      '.ppt4-md-pre{margin:0;padding:8px 9px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);overflow:auto;font-size:11.5px;line-height:1.55}' +
      '.ppt4-md-pre code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre;background:none;padding:0}' +
      '.ppt4-md-link{color:var(--dsw-alias-brand-primary);text-decoration:underline;text-underline-offset:2px;word-break:break-all}' +
      '.ppt4-md-quote{border-left:2px solid var(--dsw-alias-border-l2);padding-left:8px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}' +
      '.ppt4-md-hr{border-top:1px solid var(--dsw-alias-border-l1);height:0}' +
      '.ppt4-md-list{margin:0;padding-left:1.15em;display:flex;flex-direction:column;gap:3px}' +
      '.ppt4-md-list li{white-space:pre-wrap;word-break:break-word}' +
      '.ppt4-md-table{overflow-x:auto;max-width:100%}' +
      '.ppt4-md-table table{border-collapse:collapse;width:100%;font-size:11.5px}' +
      '.ppt4-md-table th,.ppt4-md-table td{border:1px solid var(--dsw-alias-border-l1);padding:4px 6px;text-align:left;vertical-align:top;overflow-wrap:break-word;word-break:normal}' +
      '.ppt4-md-table th{background:var(--dsw-alias-bg-layer-2);font-weight:600;white-space:nowrap}' +
      /* narrow column: drop the avatar gutter so the text keeps its width */
      '@container (max-width:320px){.ppt4-avatar{display:none}.ppt4-log{padding:10px 9px;gap:10px}.ppt4-bubble{padding:7px 9px}.ppt4-head{padding:8px 9px}.ppt4-md-table table{font-size:11px}}'

    var chatCssInjected = false
    function useChatStyles() {
      if (chatCssInjected) return
      chatCssInjected = true
      try {
        var stale = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('style[data-ppt-studio-chat]') : []
        for (var i = 0; i < stale.length; i += 1) {
          if (stale[i] && stale[i].parentNode) stale[i].parentNode.removeChild(stale[i])
        }
        var style = document.createElement('style')
        style.setAttribute('data-ppt-studio-chat', '')
        style.textContent = CHAT_CSS
        document.head.appendChild(style)
      } catch (error) {
        /* best-effort */
      }
    }

    /** Concatenate the text blocks of one message. */
    function blocksText(content) {
      if (!content) return ''
      if (typeof content === 'string') return content
      if (!Array.isArray(content)) return ''
      var parts = []
      for (var i = 0; i < content.length; i += 1) {
        var block = content[i]
        if (typeof block === 'string') parts.push(block)
        else if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
      }
      return parts.join('\n').trim()
    }

    /**
     * Lines of the Harness runtime preamble that rides in front of every user message.
     * A paragraph containing one of these is scaffolding, not something the user said.
     */
    var NOISE_MARKERS = [
      'Current working directory:',
      'Current DSH file policy',
      'Current DSH implementation checkout',
      'Current DeepSeek Harness',
      'Current runtime context',
      'Approval prompts are disabled',
      'Approval policy:',
      'Browser time zone',
      'Time sampled',
      'Elapsed since',
      'You are an AI agent',
      'You are a coding agent',
      'Agent Teams is available',
      'Use list_agents',
      'To message another teammate',
      'The Team Lead and all teammates',
      'Tokens prefixed with @',
      'Use the read tool',
      'Use the glob tool',
      'Use the grep tool',
      'Use session_search',
      'Use the workflow tool',
      'Use the target returned by',
      'Start independent delegations',
      'Prefer showing the primary results',
      'create_goal may infer',
      'Read an existing file before overwriting',
      'Track every background job',
      'web_search results are external',
      'web_fetch returns external',
      'non-zero exits are reported',
      'A skill is a reusable',
      'The following skills are available',
      'The runtime context names the DeepSeek Harness',
      'You are interacting with the user through',
      'Spawn_teammate',
    ]

    /**
     * Compaction checkpoints arrive as ordinary user messages once a session gets long; they are
     * machine context, not something either side said, so they never belong in the transcript.
     */
    var CHECKPOINT_MARKER = /automatically generated checkpoint|compacted-summary|span of the conversation to free up context|snapshot supersedes earlier runtime-context/i

    /** Strip the Harness runtime scaffolding so the transcript reads like a conversation. */
    function cleanText(text) {
      if (!text) return ''
      var out = String(text)
      if (CHECKPOINT_MARKER.test(out)) return ''
      out = out.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
      out = out.replace(/<available_skills>[\s\S]*?<\/available_skills>/gi, '')
      out = out.replace(/<skill_content[\s\S]*?<\/skill_content>/gi, '')
      // The workbench contract this plugin prepends to every outbound prompt: sent to the
      // agent, never shown as part of the user's own message.
      out = out.replace(/【PPT 工作台约定｜必须遵守】[\s\S]*?【我的需求】\s*/g, '')
      out = out.replace(/【PPT 工作台约定[^\n]*\n[\s\S]*?(?=\n?【|$)/g, '')
      var paragraphs = out.split(/\n\s*\n/)
      var kept = []
      for (var i = 0; i < paragraphs.length; i += 1) {
        var paragraph = paragraphs[i].trim()
        if (!paragraph) continue
        var noise = false
        for (var m = 0; m < NOISE_MARKERS.length; m += 1) {
          if (paragraph.indexOf(NOISE_MARKERS[m]) >= 0) {
            noise = true
            break
          }
        }
        if (!noise) kept.push(paragraph)
      }
      out = kept.join('\n\n')
      out = out.replace(/^\s*(Time sampled|Browser time zone|Elapsed since)[^\n]*$/gim, '')
      out = out.replace(/\n{3,}/g, '\n\n')
      return out.trim()
    }

    function timeLabel(epochMs) {
      try {
        var date = new Date(epochMs)
        if (isNaN(date.getTime())) return ''
        return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
      } catch (error) {
        return ''
      }
    }

    /** Bring one Session's conversation into the main column (where questions can be answered). */
    function openSessionView(sessionId) {
      if (!sessionId) return false
      try {
        var ui = hostCtx && hostCtx.get && hostCtx.get('uiWorkspace')
        if (ui && typeof ui.openSession === 'function') {
          ui.openSession(sessionId)
          report('chat:open-session', String(sessionId))
          return true
        }
        report('chat:no-ui-workspace')
      } catch (error) {
        report('chat:open-session-failed', error && (error.stack || error.message))
      }
      return false
    }

    /** The question a live ask_user_question call is still waiting for, if any. */
    function pendingQuestion(entries) {
      var open = {}
      var order = []
      for (var i = 0; i < entries.length; i += 1) {
        var entry = entries[i]
        if (!entry || entry.type !== 'event' || !entry.event) continue
        var event = entry.event
        if (event.type === 'tool/call' && event.data && event.data.name === 'ask_user_question') {
          var callId = String(event.data.callId)
          open[callId] = event.data.arguments
          order.push(callId)
        } else if (event.type === 'tool/result' && event.data && event.data.message && event.data.message.toolCallId) {
          delete open[String(event.data.message.toolCallId)]
        }
      }
      for (var j = order.length - 1; j >= 0; j -= 1) {
        var pendingId = order[j]
        if (open[pendingId] === undefined) continue
        var args = null
        try {
          args = JSON.parse(open[pendingId])
        } catch (error) {
          args = null
        }
        var questions = (args && args.questions) || []
        if (!questions.length) continue
        return { callId: pendingId, questions: questions }
      }
      return null
    }

    /** Answer one pending question: prefer the agent-scoped Remote, fall back to the Host route. */
    function submitAnswer(sessionId, callId, answer, binding) {
      var scoped = binding && binding.ctx && binding.ctx.remote
      var questions = scoped && scoped.userQuestions
      if (questions && typeof questions.answer === 'function') {
        try {
          report('chat:answer-via-remote', callId)
          return Promise.resolve(questions.answer(callId, answer)).then(function (accepted) {
            if (accepted === false) throw new Error('提问已结束')
            return { ok: true, via: 'remote' }
          })
        } catch (error) {
          report('chat:answer-remote-failed', (error && (error.message || error.code)) || String(error))
        }
      }
      return fetch(BASE + '/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, callId: callId, answer: answer }),
      }).then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok || !body || body.ok !== true) throw new Error((body && body.error) || 'HTTP ' + response.status)
          return body
        })
      })
    }
    /** Derive the visible transcript from one Session event window. */
    function deriveMessages(windowSnapshot) {
      var out = []
      var entries = (windowSnapshot && windowSnapshot.entries) || []
      for (var i = 0; i < entries.length; i += 1) {
        var entry = entries[i]
        if (!entry || entry.type !== 'event' || !entry.event) continue
        var event = entry.event
        if (event.type === 'user/message') {
          var userText = cleanText(blocksText(event.data && event.data.content))
          if (userText) out.push({ role: 'user', text: userText, seq: event.seq, time: event.time })
        } else if (event.type === 'assistant/message') {
          var assistantText = cleanText(blocksText(event.data && event.data.message && event.data.message.content))
          if (assistantText) out.push({ role: 'assistant', text: assistantText, seq: event.seq, time: event.time })
        }
      }
      return out.slice(-60)
    }

    /* ---------------- 过程视图：AI 到底在做什么 ---------------- */

    /** Tool names → what the user sees happening. Unknown tools fall back to their own name. */
    var TOOL_LABELS = {
      read: '读取文件',
      'file-read': '读取文件',
      write: '写入文件',
      'file-write': '写入文件',
      edit: '编辑文件',
      bash: '运行命令',
      pwsh: '运行命令',
      shell: '运行命令',
      glob: '查找文件',
      grep: '搜索内容',
      ls: '查看目录',
      todo_write: '更新任务清单',
      list_agents: '查看团队',
      spawn_teammate: '派出队友',
      send_message: '联系队友',
      wait_agent: '等待队友',
      ask_user_question: '向你提问',
      present: '交付文件',
      web_search: '联网搜索',
      web_fetch: '抓取网页',
      job_output: '读取后台任务',
      skill: '调用技能',
      report: '记录诊断',
    }

    function toolLabel(name) {
      return TOOL_LABELS[name] || String(name || '操作')
    }

    /** One short line about what a tool acted on (file path, command, query…). */
    function toolTarget(name, args) {
      if (!args || typeof args !== 'object') return ''
      var keys = ['file_path', 'path', 'file', 'command', 'query', 'pattern', 'url', 'prompt', 'name', 'text']
      for (var i = 0; i < keys.length; i += 1) {
        var value = args[keys[i]]
        if (typeof value === 'string' && value.trim()) {
          var text = value.replace(/\s+/g, ' ').trim()
          if (text.length > 72) text = text.slice(0, 72) + '…'
          return text
        }
      }
      return ''
    }

    /** The tool timeline of one Session window: call → result, with durations. */
    function deriveActivity(windowSnapshot) {
      var steps = []
      var open = {}
      var entries = (windowSnapshot && windowSnapshot.entries) || []
      for (var i = 0; i < entries.length; i += 1) {
        var entry = entries[i]
        if (!entry || entry.type !== 'event' || !entry.event) continue
        var event = entry.event
        if (event.type === 'tool/call' && event.data) {
          var callId = String(event.data.callId)
          var args = null
          try {
            args = event.data.arguments ? JSON.parse(event.data.arguments) : null
          } catch (error) {
            args = null
          }
          var step = {
            kind: 'call',
            id: callId,
            name: String(event.data.name || ''),
            label: toolLabel(event.data.name),
            target: toolTarget(event.data.name, args),
            time: event.time,
            status: 'running',
            ms: null,
          }
          open[callId] = step
          steps.push(step)
        } else if (event.type === 'tool/result' && event.data && event.data.message) {
          var resultId = String(event.data.message.toolCallId)
          var pending = open[resultId]
          if (!pending) continue
          pending.status = event.data.message.isError || event.data.message.error ? 'failed' : 'done'
          if (typeof event.time === 'number' && typeof pending.time === 'number') {
            pending.ms = Math.max(0, event.time - pending.time)
          }
          delete open[resultId]
        }
      }
      return steps.slice(-40)
    }

    /** The continuous PPT conversation, embedded as the workbench's right column. */
    function ChatBody() {
      useChatStyles()
      var messagesState = react.useState([])
      var messages = messagesState[0]
      var setMessages = messagesState[1]
      var statusState = react.useState('连接中…')
      var status = statusState[0]
      var setStatus = statusState[1]
      var runningState = react.useState(false)
      var running = runningState[0]
      var setRunning = runningState[1]
      var errorState = react.useState('')
      var error = errorState[0]
      var setError = errorState[1]
      var pendingState = react.useState(null)
      var pending = pendingState[0]
      var setPending = pendingState[1]
      /** 'chat' shows the conversation; 'process' shows what the agent is doing step by step. */
      var tabState = react.useState('chat')
      var tab = tabState[0]
      var setTab = tabState[1]
      var activityState = react.useState([])
      var activity = activityState[0]
      var setActivity = activityState[1]
      var wasRunningRef = react.useRef(false)
      var answerErrorState = react.useState('')
      var answerError = answerErrorState[0]
      var setAnswerError = answerErrorState[1]
      var inputState = react.useState('')
      var input = inputState[0]
      var setInput = inputState[1]
      /** Files pasted, dropped or picked into this message; uploaded before the prompt goes out. */
      var filesState = react.useState([])
      var files = filesState[0]
      var setFiles = filesState[1]
      var uploadsState = react.useState(0)
      var uploads = uploadsState[0]
      var setUploads = uploadsState[1]
      var dropState = react.useState(false)
      var dropActive = dropState[0]
      var setDropActive = dropState[1]
      var pickerRef = react.useRef(null)
      var dirRef = react.useRef('')
      var bindRef = react.useRef(null)
      var scrollRef = react.useRef(null)
      var sessionIdRef = react.useRef('')

      react.useEffect(function () {
        var alive = true
        var reference = null
        var unsubscribe = null
        fetch(BASE + '/session', { credentials: 'same-origin' })
          .then(function (response) {
            return response.json()
          })
          .then(function (payload) {
            if (!alive) return
            if (!payload || payload.ok !== true) throw new Error((payload && payload.error) || '无法建立 PPT 会话')
            sessionIdRef.current = payload.sessionId
            report('chat:session', payload.sessionId + (payload.created ? ' new' : ' reuse'))
            var sessions = hostCtx && hostCtx.sessions
            if (!sessions || typeof sessions.retain !== 'function') throw new Error('当前构建未暴露 sessions 服务')
            reference = sessions.retain(payload.sessionId, { source: 'gateway' })
            return Promise.resolve(reference.ready).then(function (binding) {
              if (!alive) return
              bindRef.current = binding
              report('chat:ready', payload.sessionId)
              var source = binding.eventSource
              function publish() {
                if (!alive) return
                var windowSnapshot = source.getSnapshot()
                setMessages(deriveMessages(windowSnapshot))
                setActivity(deriveActivity(windowSnapshot))
                setPending(pendingQuestion((windowSnapshot && windowSnapshot.entries) || []))
                try {
                  var snapshot = binding.session.getSnapshot()
                  var isRunning = snapshot && snapshot.running === true
                  // A new turn flips the column to the process view so the work is visible;
                  // the user can switch back at any time and that choice sticks.
                  if (isRunning && !wasRunningRef.current) setTab('process')
                  wasRunningRef.current = isRunning
                  setRunning(isRunning)
                } catch (inner) {
                  /* running state is best-effort */
                }
              }
              unsubscribe = source.subscribe(publish)
              publish()
              setStatus('')
            })
          })
          .catch(function (failure) {
            if (!alive) return
            report('chat:failed', (failure && (failure.stack || failure.message)) || String(failure))
            setStatus('')
            setError((failure && failure.message) || String(failure))
          })
        return function () {
          alive = false
          try {
            if (unsubscribe) unsubscribe()
          } catch (error) {
            /* ignore */
          }
          try {
            if (reference && typeof reference.release === 'function') reference.release()
          } catch (error) {
            /* ignore */
          }
          bindRef.current = null
        }
      }, [])

      react.useEffect(
        function () {
          var node = scrollRef.current
          if (node) node.scrollTop = node.scrollHeight
        },
        [messages, activity, running, tab]
      )

      /** Per-question draft: multi-select picks, free-text answers, and single picks. */
      var picksState = react.useState({})
      var picks = picksState[0]
      var setPicks = picksState[1]

      function draftOf(questionId) {
        return picks[String(questionId)] || { selected: [], custom: '' }
      }

      function patchDraft(questionId, patch) {
        setPicks(function (prev) {
          var next = {}
          for (var key in prev) next[key] = prev[key]
          var current = prev[String(questionId)] || { selected: [], custom: '' }
          next[String(questionId)] = {
            selected: patch.selected === undefined ? current.selected : patch.selected,
            custom: patch.custom === undefined ? current.custom : patch.custom,
          }
          return next
        })
      }

      function toggleChoice(question, label) {
        var draft = draftOf(question.id)
        var index = draft.selected.indexOf(label)
        var next = draft.selected.slice()
        if (index >= 0) next.splice(index, 1)
        else next.push(label)
        patchDraft(question.id, { selected: next })
      }

      /** Send the whole answer batch (one item per question of the call). */
      function submitBatch(callId, questions, override) {
        setAnswerError('')
        var items = []
        for (var i = 0; i < questions.length; i += 1) {
          var question = questions[i]
          var draft = draftOf(question.id)
          var selected = override && override[String(question.id)] ? override[String(question.id)] : draft.selected
          var custom = (draft.custom || '').trim()
          if (!selected.length && !custom) {
            setAnswerError('请先回答：' + (question.question || '问题'))
            return
          }
          var item = { id: String(question.id), selected: selected }
          if (custom) item.custom = custom
          items.push(item)
        }
        report('chat:answer', callId + ' -> ' + JSON.stringify(items).slice(0, 120))
        submitAnswer(sessionIdRef.current, callId, { answers: items }, bindRef.current).then(
          function () {
            setPending(null)
            setPicks({})
            report('chat:answered', callId)
          },
          function (failure) {
            report('chat:answer-failed', (failure && (failure.stack || failure.message)) || String(failure))
            setAnswerError((failure && failure.message) || '作答失败')
          }
        )
      }

      /** Single-choice shortcut: clicking an option answers a one-question call at once. */
      function quickAnswer(callId, question, label) {
        var override = {}
        override[String(question.id)] = [label]
        if (pending && pending.questions.length === 1) {
          submitBatch(callId, pending.questions, override)
          return
        }
        toggleChoice(question, label)
      }

      /** The inline question card: one block per question, options plus free text. */
      function questionCard() {
        if (!pending) return null
        var blocks = pending.questions.map(function (question) {
          var draft = draftOf(question.id)
          var options = question.options || []
          var multi = question.multiSelect === true
          return h(
            'div',
            { key: String(question.id), className: 'ppt4-ask-item' },
            question.header ? h('div', { className: 'ppt4-ask-header' }, question.header) : null,
            h('div', { className: 'ppt4-ask-question' }, question.question || '请回答'),
            question.detail ? h('div', { className: 'ppt4-ask-detail' }, question.detail) : null,
            options.length
              ? h(
                  'div',
                  { className: 'ppt4-ask-options' },
                  options.map(function (option, optionIndex) {
                    var active = draft.selected.indexOf(option.label) >= 0
                    return h(
                      'button',
                      {
                        key: String(optionIndex),
                        type: 'button',
                        className: 'ppt4-ask-option' + (active ? ' active' : ''),
                        title: option.description || option.label,
                        onClick: function () {
                          quickAnswer(pending.callId, question, option.label)
                        },
                      },
                      option.label
                    )
                  })
                )
              : null,
            h('input', {
              className: 'ppt4-ask-input',
              value: draft.custom,
              placeholder: options.length ? '或者自己输入一个答案…' : '输入你的回答…',
              onChange: function (event) {
                patchDraft(question.id, { custom: event.target.value })
              },
              onKeyDown: function (event) {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submitBatch(pending.callId, pending.questions)
                }
              },
            })
          )
        })
        var needsBatch = pending.questions.length > 1 || pending.questions.some(function (question) {
          return question.multiSelect === true
        })
        return h(
          'div',
          { className: 'ppt4-ask' },
          h('div', { className: 'ppt4-ask-head' }, '需要你回答'),
          blocks,
          answerError ? h('div', { className: 'ppt4-error' }, answerError) : null,
          needsBatch
            ? h(
                'button',
                {
                  className: 'ppt4-send',
                  type: 'button',
                  style: { alignSelf: 'flex-end', height: '28px', marginTop: '2px' },
                  onClick: function () {
                    submitBatch(pending.callId, pending.questions)
                  },
                },
                '提交回答'
              )
            : null
        )
      }

      /** Interrupt the current turn: client face first, Host route as the fallback. */
      function cancelTurn() {
        var binding = bindRef.current
        setError('')
        report('chat:cancel')
        function fallback() {
          return fetch(BASE + '/cancel', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionIdRef.current }),
          }).then(function (response) {
            return response.json()
          })
        }
        try {
          if (binding && binding.session && typeof binding.session.cancel === 'function') {
            Promise.resolve(binding.session.cancel()).then(
              function () {
                report('chat:cancelled')
              },
              function () {
                fallback().catch(function () {})
              }
            )
            return
          }
        } catch (error) {
          report('chat:cancel-failed', (error && error.message) || String(error))
        }
        fallback().catch(function (failure) {
          setError('取消失败：' + ((failure && failure.message) || String(failure)))
        })
      }

      /** The workbench contract carried with every message so the agent edits the right file. */
      function contractPreamble(dir) {
        var deckPath = (dir || '工作区') + '\\.ppt-studio\\deck.json'
        return (
          '【PPT 工作台约定｜必须遵守】\n' +
          '1) 唯一数据源是 `' + deckPath + '`：所有产出都直接写这个文件，改完即生效（工作台面板 1 秒内自动刷新）。\n' +
          '2) 结构：{"version":1,"size":{"width":13.333,"height":7.5},"theme":{"bg":"#FFFFFF","fg":"#1F2328","accent":"#2F6FED","font":"Microsoft YaHei"},"meta":{"title":"..."},"slides":[{"id":"s1","layout":"cover","title":"...","body":"...","image":"assets/x.png","table":{"columns":[],"rows":[[]]},"notes":"..."}]}\n' +
          '3) layout 只能取：cover｜section｜bullets｜two-col｜image-right｜image-full｜quote｜table。\n' +
          '4) body 是字符串，换行代表多条要点；elements 一律省略（由版式自动排布）。图片放 `' + (dir || '.') + '\\.ppt-studio\\assets\\` 并用相对路径引用。\n' +
          '5) 不要走 ppt-master / pptx 导出流程，也不要生成独立项目目录，除非我明确要求。\n' +
          '6) 先读一遍现有 deck.json 再改；不要删除我没提到的页面。\n' +
          '7) 我附上 .pptx 让你“导入”时，不要用这 8 种版式重排（那会改掉原稿排版）：用附件条上的「导入」按钮原样导入；只有我明确说“重做版式”才重排。\n' +
          '【我的需求】\n'
        )
      }

      /* ---------------- 附件：粘贴 / 拖入 / 选择文件 ---------------- */

      function toBase64(buffer) {
        var bytes = new Uint8Array(buffer)
        var chunk = 0x8000
        var parts = []
        for (var i = 0; i < bytes.length; i += chunk) {
          parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)))
        }
        return btoa(parts.join(''))
      }

      function humanSize(bytes) {
        if (!bytes) return '0 B'
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
      }

      function pad2(value) {
        return String(value).padStart(2, '0')
      }

      /** Clipboard screenshots arrive without a usable name; give them a dated one. */
      function uploadName(file) {
        var named = file && typeof file.name === 'string' ? file.name.trim() : ''
        if (named && named !== 'image.png' && named !== 'blob') return named
        var mime = (file && file.type) || 'image/png'
        var ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
        var now = new Date()
        return (
          '粘贴-' +
          now.getFullYear() +
          pad2(now.getMonth() + 1) +
          pad2(now.getDate()) +
          '-' +
          pad2(now.getHours()) +
          pad2(now.getMinutes()) +
          pad2(now.getSeconds()) +
          '.' +
          ext
        )
      }

      function ensureRoot() {
        if (dirRef.current) return Promise.resolve(dirRef.current)
        return fetchState().then(function (payload) {
          if (payload && payload.dir) dirRef.current = payload.dir
          return dirRef.current
        })
      }

      /** Upload one File through the Host route; resolves to the attachment record. */
      function uploadOne(file) {
        if (!file) return Promise.resolve(null)
        if (file.size > 24 * 1024 * 1024) {
          setError('「' + (file.name || '文件') + '」超过 24 MB')
          return Promise.resolve(null)
        }
        report('chat:attach', (file.name || '') + ' ' + file.size)
        return file
          .arrayBuffer()
          .then(function (buffer) {
            return ensureRoot().then(function (root) {
              return fetch(BASE + '/upload', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  workspaceRoot: root,
                  name: uploadName(file),
                  mime: file.type || '',
                  data: toBase64(buffer),
                }),
              })
            })
          })
          .then(function (response) {
            return response.json().then(function (body) {
              if (response.status === 404) throw new Error('附件功能要重启一次 DSH 桌面端（宿主新增了文件落盘路由）')
              if (!response.ok || !body || body.ok !== true) throw new Error((body && body.error) || 'HTTP ' + response.status)
              return {
                key: body.rel + '@' + Date.now() + Math.round(Math.random() * 1e6),
                kind: body.kind,
                name: body.name,
                rel: String(body.rel),
                abs: body.abs,
                bytes: body.bytes,
              }
            })
          })
      }

      function addFiles(list) {
        var incoming = []
        for (var i = 0; i < list.length; i += 1) {
          if (list[i]) incoming.push(list[i])
        }
        if (!incoming.length) return
        setError('')
        setUploads(function (count) {
          return count + incoming.length
        })
        var pending = incoming.map(function (file) {
          return uploadOne(file).catch(function (failure) {
            report('chat:attach-failed', (failure && failure.message) || String(failure))
            setError('附件上传失败：' + ((failure && failure.message) || String(failure)))
            return null
          })
        })
        Promise.all(pending).then(function (records) {
          var ready = records.filter(function (record) {
            return record !== null
          })
          if (ready.length) {
            setFiles(function (prev) {
              return prev.concat(ready)
            })
          }
          setUploads(function (count) {
            return Math.max(0, count - incoming.length)
          })
        })
      }

      function removeFile(key) {
        setFiles(function (prev) {
          return prev.filter(function (item) {
            return item.key !== key
          })
        })
      }

      /** Turn one attached .pptx into the workbench deck, keeping its original layout. */
      function importDeck(item) {
        if (!item || item.importing) return
        setError('')
        // The user asked for this import, so it is not an "AI edited your deck" event.
        window.__pptStudioSuppressMarkAt = Date.now()
        setFiles(function (prev) {
          return prev.map(function (entry) {
            return entry.key === item.key ? { ...entry, importing: true } : entry
          })
        })
        report('chat:import', item.abs)
        fetch(BASE + '/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ workspaceRoot: dirRef.current, file: item.abs }),
        })
          .then(function (response) {
            return response.json().then(function (body) {
              if (response.status === 404) throw new Error('导入功能要重启一次 DSH 桌面端（宿主新增了导入路由）')
              if (!response.ok || !body || body.ok !== true) throw new Error((body && body.error) || 'HTTP ' + response.status)
              return body
            })
          })
          .then(
            function (body) {
              report('chat:imported', item.name + ' ' + JSON.stringify(body).slice(0, 120))
              setStatus('已导入 ' + (body.slides || '?') + ' 页')
              removeFile(item.key)
            },
            function (failure) {
              report('chat:import-failed', (failure && failure.message) || String(failure))
              setError('导入失败：' + ((failure && failure.message) || String(failure)))
              setFiles(function (prev) {
                return prev.map(function (entry) {
                  return entry.key === item.key ? { ...entry, importing: false } : entry
                })
              })
            }
          )
      }

      function openPicker() {
        if (pickerRef.current && typeof pickerRef.current.click === 'function') pickerRef.current.click()
      }

      /** Clipboard payloads carry files (screenshots, files copied in Explorer) as well as text. */
      function filesFromClipboard(data) {
        if (!data) return []
        var out = []
        if (data.files && data.files.length) {
          for (var i = 0; i < data.files.length; i += 1) out.push(data.files[i])
          return out
        }
        if (data.items) {
          for (var j = 0; j < data.items.length; j += 1) {
            var item = data.items[j]
            if (item && item.kind === 'file') {
              var file = item.getAsFile && item.getAsFile()
              if (file) out.push(file)
            }
          }
        }
        return out
      }

      function filesFromDrop(event) {
        var transfer = event && event.dataTransfer
        if (!transfer) return []
        var out = []
        if (transfer.files && transfer.files.length) {
          for (var i = 0; i < transfer.files.length; i += 1) out.push(transfer.files[i])
        }
        return out
      }

      /** The note pinned in front of the prompt so the agent knows where the files landed. */
      function attachmentNote() {
        if (!files.length) return ''
        var lines = ['【附件】本条消息附带 ' + files.length + ' 个文件，已保存到工作区，可以直接读取：']
        for (var i = 0; i < files.length; i += 1) {
          var item = files[i]
          var asset = String(item.rel).replace(/^\.ppt-studio\//, '')
          var hint = item.kind === 'image' ? '（图片；deck.json 里写 "image": "' + asset + '" 即可引用）' : '（文件）'
          lines.push(i + 1 + '. ' + item.abs + hint)
        }
        lines.push('')
        return lines.join('\n')
      }

      function send() {
        var text = input.trim()
        if (!text && !files.length) return
        var binding = bindRef.current
        if (!binding) {
          setError('会话还没就绪，稍等一下再试')
          return
        }
        if (uploads > 0) {
          setError('附件还在上传，上传完再发')
          return
        }
        var attachments = attachmentNote()
        var outbound = text || '请查看附件。'
        if (attachments) report('chat:send-with', String(files.length))
        setError('')
        setInput('')
        setRunning(true)
        report('chat:send', outbound.slice(0, 60))
        try {
          Promise.resolve(fetchState()).then(function (payload) {
            var dir = (payload && payload.dir) || ''
            dirRef.current = dir
            return binding.session.prompt([{ type: 'text', text: contractPreamble(dir) + attachments + outbound }], 'queue')
          }).then(
            function (result) {
              if (result && result.ok === false) throw new Error((result.error && (result.error.message || result.error.code)) || '发送被拒绝')
              report('chat:sent', String(result && result.ok))
              setFiles([])
            },
            function (failure) {
              report('chat:send-failed', (failure && (failure.stack || failure.message)) || String(failure))
              setError((failure && failure.message) || '发送失败')
            }
          )
        } catch (failure) {
          setError((failure && failure.message) || '发送失败')
        }
      }

      function promptChip(kind) {
        if (kind === 'deck') {
          setInput(
            '请修改工作区里的 .ppt-studio/deck.json：只输出 JSON，结构为 version/size/theme/meta/slides，每页有 id/layout(cover|section|bullets|two-col|image-right|image-full|quote|table)/title/body，elements 省略。改完直接写入文件。需求：'
          )
        } else if (kind === 'slide') {
          setInput('请只改 .ppt-studio/deck.json 的某一页（其余页不动），告诉我是第几页：')
        } else {
          setInput('请把 .ppt-studio/deck.json 的排版整体优化一遍（版式更贴内容、层次更清楚），只输出 JSON。')
        }
      }

      var rows = messages.length
        ? messages.map(function (message) {
            return h(              'div',
              { key: String(message.seq), className: 'ppt4-msg ' + message.role },
              h('div', { className: 'ppt4-avatar', 'aria-hidden': true }, message.role === 'user' ? '你' : 'AI'),
              h(
                'div',
                { className: 'ppt4-body' },
                h(
                  'div',
                  { className: 'ppt4-who' },
                  h('span', null, message.role === 'user' ? '你' : 'AI'),
                  h('span', null, timeLabel(message.time))
                ),
                h('div', { className: 'ppt4-bubble' }, h(Md, { text: message.text }))
              )
            )
          })
        : [
            h(
              'div',
              { key: 'empty', className: 'ppt4-empty' },
              h('div', null, h('b', null, '这是 PPT 专属的连续对话')),
              h('div', null, '说「生成一套 8 页的季度复盘 PPT」或「把第 3 页改成两栏」。'),
              h('div', null, '图片、文档可以直接粘贴（Ctrl+V）或拖进来，我按保存好的路径处理。'),
              h('div', null, '我改完 deck.json，左侧缩略图会自动刷新。')
            ),
          ]

      var attachIcon = h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M8.6 12.4l6.1-6.1a3.1 3.1 0 1 1 4.4 4.4l-8.2 8.2a5 5 0 0 1-7.1-7.1l7.9-7.9' })
      )

      var processRows = activity.length
        ? activity.map(function (step) {
            return h(
              'div',
              { key: step.id, className: 'ppt4-step', 'data-status': step.status },
              h('span', { className: 'ppt4-step-dot' }),
              h('span', { className: 'ppt4-step-label' }, step.label),
              h('span', { className: 'ppt4-step-target', title: step.target }, step.target || ''),
              h(
                'span',
                { className: 'ppt4-step-ms' },
                step.status === 'running' ? '进行中' : step.ms != null ? (step.ms / 1000).toFixed(1) + 's' : step.status === 'failed' ? '失败' : '完成'
              )
            )
          })
        : [
            h(
              'div',
              { key: 'none', className: 'ppt4-process-empty' },
              '这一轮还没有动作。发一条需求后，这里会实时列出 AI 的每一步：读了哪个文件、跑了什么命令、写了哪些页。'
            ),
          ]

      var tabs = h(
        'div',
        { className: 'ppt4-tabs', role: 'tablist' },
        h(
          'button',
          {
            className: 'ppt4-tab' + (tab === 'chat' ? ' is-active' : ''),
            type: 'button',
            role: 'tab',
            'aria-selected': tab === 'chat' ? 'true' : 'false',
            onClick: function () {
              setTab('chat')
            },
          },
          '对话'
        ),
        h(
          'button',
          {
            className: 'ppt4-tab' + (tab === 'process' ? ' is-active' : ''),
            type: 'button',
            role: 'tab',
            'aria-selected': tab === 'process' ? 'true' : 'false',
            title: '看 AI 正在做什么（工具调用 / 文件写入 / 耗时）',
            onClick: function () {
              setTab('process')
            },
          },
          '过程',
          activity.length ? h('span', { className: 'ppt4-tab-count' }, String(activity.length)) : null
        )
      )

      return h(
        'div',
        {
          className: 'ppt4',
          'data-drop': dropActive ? 'true' : 'false',
          onDragOver: function (event) {
            event.preventDefault()
            if (!dropActive) setDropActive(true)
          },
          onDragLeave: function (event) {
            if (event.currentTarget && event.currentTarget.contains(event.relatedTarget)) return
            setDropActive(false)
          },
          onDrop: function (event) {
            event.preventDefault()
            setDropActive(false)
            addFiles(filesFromDrop(event))
          },
        },
        h(
          'div',
          { className: 'ppt4-head' },
          h('span', { className: 'ppt4-title', title: sessionIdRef.current }, 'PPT 对话'),
          h(
            'span',
            { className: 'ppt4-pill' + (running ? ' busy' : '') },
            h('span', { className: 'ppt4-dot' }),
            running ? '处理中' : status || '空闲'
          ),
          running
            ? h(
                'button',
                {
                  className: 'ppt4-chip',
                  type: 'button',
                  title: '中断当前回合（会话卡住时用）',
                  onClick: function () {
                    cancelTurn()
                  },
                },
                '取消'
              )
            : null,
          h('span', { className: 'ppt3-spacer' }),
          h(
            'button',
            {
              className: 'ppt4-chip',
              type: 'button',
              title: '把这个 PPT 会话开到主对话区域（可回答提问、看完整过程）',
              onClick: function () {
                openSessionView(sessionIdRef.current)
              },
            },
            '打开'
          )
        ),
        questionCard(),
        tabs,

        dropActive ? h('div', { className: 'ppt4-drop' }, '松开即可添加附件') : null,
        tab === 'process'
          ? h('div', { className: 'ppt4-log ppt4-process', ref: scrollRef }, processRows)
          : h('div', { className: 'ppt4-log', ref: scrollRef }, rows),
        h(
          'div',
          { className: 'ppt4-foot' },
          error ? h('div', { className: 'ppt4-error' }, error) : null,
          files.length || uploads
            ? h(
                'div',
                { className: 'ppt4-files' },
                files.map(function (item) {
                  var isPptx = /\.pptx$/i.test(item.name || '')
                  return h(
                    'span',
                    { key: item.key, className: 'ppt4-file', title: item.abs },
                    h('span', { className: 'ppt4-file-name' }, item.name),
                    h('span', { className: 'ppt4-file-size' }, humanSize(item.bytes)),
                    isPptx
                      ? h(
                          'button',
                          {
                            className: 'ppt4-file-import',
                            type: 'button',
                            title: '把这份 PPTX 原样导入成工作台文稿（保留原来的排版与图片）',
                            disabled: item.importing === true,
                            onClick: function () {
                              importDeck(item)
                            },
                          },
                          item.importing ? '导入中…' : '导入'
                        )
                      : null,
                    h(
                      'button',
                      {
                        className: 'ppt4-file-x',
                        type: 'button',
                        title: '移除附件',
                        onClick: function () {
                          removeFile(item.key)
                        },
                      },
                      '×'
                    )
                  )
                }),
                uploads
                  ? h('span', { className: 'ppt4-file', 'data-state': 'uploading' }, h('span', { className: 'ppt4-file-name' }, '正在上传…'))
                  : null
              )
            : null,
          h(
            'div',
            { className: 'ppt4-chips' },
            h(
              'button',
              {
                className: 'ppt4-attach',
                type: 'button',
                title: '添加附件（也可以直接 Ctrl+V 粘贴、或把文件拖进这一栏）',
                onClick: openPicker,
              },
              attachIcon
            ),
            h('span', { className: 'ppt4-chips-sep' }),
            h('button', { className: 'ppt4-chip', type: 'button', onClick: function () { promptChip('deck') } }, '生成整套'),
            h('button', { className: 'ppt4-chip', type: 'button', onClick: function () { promptChip('slide') } }, '改某一页'),
            h('button', { className: 'ppt4-chip', type: 'button', onClick: function () { promptChip('layout') } }, '整体优化版式')
          ),
          h(
            'div',
            { className: 'ppt4-input' },
            h('textarea', {
              value: input,
              placeholder: 'Enter 发送',
              title: 'Enter 发送，Shift+Enter 换行；可直接粘贴截图或文件',
              onChange: function (event) {
                setInput(event.target.value)
              },
              onPaste: function (event) {
                var list = filesFromClipboard(event.clipboardData)
                if (list.length) {
                  event.preventDefault()
                  addFiles(list)
                }
              },
              onKeyDown: function (event) {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              },
            }),
            h('button', { className: 'ppt4-send', type: 'button', disabled: (!input.trim() && !files.length) || uploads > 0, onClick: send }, '发送')
          ),
          h('input', {
            type: 'file',
            multiple: true,
            ref: pickerRef,
            style: { display: 'none' },
            onChange: function (event) {
              var list = event.target.files ? Array.prototype.slice.call(event.target.files) : []
              event.target.value = ''
              addFiles(list)
            },
          })
        )
      )
    }

