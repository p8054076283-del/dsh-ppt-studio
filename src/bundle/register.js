    /* ------------------------------------------------------------------ 注册 */

    function registerPanel(ctx) {
      hostCtx = ctx
      var slots = ctx && ctx.slots
      if (!slots) {
        report('no-slots')
        return false
      }
      function install(label, seat, options, component) {
        try {
          slots.inject(seat, function () {
            try {
              return slots.register(options, component)
            } catch (error) {
              report('register-failed:' + label, error && (error.stack || error.message))
            }
          })
          report('ok:' + label)
        } catch (error) {
          report('inject-failed:' + label, error && (error.stack || error.message))
        }
      }
      install('panellist', 'sidebar.panellist', { name: 'sidebar.panellist', id: PANEL_KEY, order: 20, label: TITLE }, Icon)
      install('main', 'main', { name: 'main', key: PANEL_KEY }, Panel)
      // The right Sidebar only exists while the conversation fills the main column, and this
      // plugin replaces that column, so the continuous chat lives inside the panel instead.
      report('right-bar', 'skipped: chat is embedded in the panel')
      report('register-done', BUILD)
      return true
    }

    function apply(ctx) {
      try {
        hostCtx = ctx
        report('apply', BUILD)

        if (ctx && typeof ctx.inject === 'function') {
          ctx.inject(['slots'], function () {
            registerPanel(ctx)
          })
          return
        }
        registerPanel(ctx)
      } catch (error) {
        report('apply-failed', error && (error.stack || error.message))
        if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-ppt-studio] apply failed', error)
      }
    }

    var inject = ['slots', 'sessions']

    exports.apply = apply
    exports.inject = inject
    exports.registerPanel = registerPanel
    // Headless pre-flight test hook; the runtime never reads this.
    exports.__pptStudioInternals = {
      deriveActivity: deriveActivity,
      deriveMessages: deriveMessages,
      pendingQuestion: pendingQuestion,
      cleanText: cleanText,
    }
