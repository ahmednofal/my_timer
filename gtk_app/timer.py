#!/usr/bin/env python3
"""
GTK + WebKit2 overlay launcher for my_timer.
Runs under XWayland (GDK_BACKEND=x11) for reliable always-on-top behaviour.
"""

import gi, os, json, cairo

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
for _v in ('4.1', '4.0'):
    try:
        gi.require_version('WebKit2', _v)
        break
    except ValueError:
        continue

# Force X11 backend so DOCK/keep-above hints work (XWayland on Wayland desktops)
os.environ.setdefault('GDK_BACKEND', 'x11')

from gi.repository import Gtk, Gdk, WebKit2

WIDGET_WIDTH  = 390
WIDGET_HEIGHT = 560
OPACITY_HOVER = 1.0
OPACITY_IDLE  = 0.55
MARGIN        = 16

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_INDEX = os.path.abspath(os.path.join(SCRIPT_DIR, '..', 'dist', 'index.html'))

GLUE_JS = """
(function () {
  document.documentElement.classList.add('electron-app');

  const bridge = (msg) =>
    window.webkit.messageHandlers.gtkBridge.postMessage(JSON.stringify(msg));

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('close-btn')
      ?.addEventListener('click', () => bridge({ action: 'quit' }));
    document.getElementById('minimize-btn')
      ?.addEventListener('click', () => bridge({ action: 'quit' }));
  });

  document.addEventListener('mousedown', (e) => {
    const bar = e.target.closest('.drag-bar');
    if (!bar || e.target.closest('button')) return;
    if (e.button !== 0) return;
    bridge({ action: 'beginDrag', sx: e.screenX, sy: e.screenY });
  }, true);
})();
"""


class TimerOverlay(Gtk.Window):
    def __init__(self):
        super().__init__(type=Gtk.WindowType.TOPLEVEL)
        self._current_opacity = OPACITY_IDLE

        # RGBA visual for transparency
        screen = self.get_screen()
        visual = screen.get_rgba_visual()
        if visual and screen.is_composited():
            self.set_visual(visual)
        self.set_app_paintable(True)
        self.connect('draw', self._on_draw)

        self.set_default_size(WIDGET_WIDTH, WIDGET_HEIGHT)
        self.set_decorated(False)
        self.set_resizable(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)

        # UTILITY: floats above other windows, receives keyboard focus (unlike DOCK)
        # keep_above + stick handles the always-on-top / all-workspaces part
        self.set_type_hint(Gdk.WindowTypeHint.UTILITY)
        self.set_keep_above(True)
        self.stick()
        self.connect('realize', self._position_topright)

        # WebView
        self.webview = WebKit2.WebView()
        self.webview.set_background_color(Gdk.RGBA(0, 0, 0, 0))

        s = self.webview.get_settings()
        s.set_allow_file_access_from_file_urls(True)
        s.set_allow_universal_access_from_file_urls(True)

        ucm = self.webview.get_user_content_manager()
        ucm.register_script_message_handler('gtkBridge')
        ucm.connect('script-message-received::gtkBridge', self._on_js_message)
        ucm.add_script(WebKit2.UserScript(
            GLUE_JS,
            WebKit2.UserScriptInjectionTime.END,
            WebKit2.UserContentInjectedFrames.ALL_FRAMES,
        ))

        self.webview.load_uri('file://' + DIST_INDEX)
        self.add(self.webview)

        self.connect('realize', lambda *_: self._set_opacity(OPACITY_IDLE))
        # Grab keyboard focus when the mouse enters the window
        self.webview.connect('enter-notify-event', self._on_enter)
        self.webview.connect('leave-notify-event', self._on_leave)

        self.connect('delete-event', lambda *_: Gtk.main_quit() or False)
        self.show_all()

    def _on_enter(self, *_):
        self._set_opacity(OPACITY_HOVER)
        # Explicitly take keyboard focus — needed because UTILITY windows
        # don't auto-focus on hover like normal windows do
        gdk_win = self.get_window()
        if gdk_win:
            gdk_win.focus(Gdk.CURRENT_TIME)

    def _on_leave(self, *_):
        self._set_opacity(OPACITY_IDLE)

    def _set_opacity(self, value):
        self._current_opacity = value
        gdk_win = self.get_window()
        if gdk_win:
            gdk_win.set_opacity(value)

    def _position_topright(self, *_):
        display = self.get_screen().get_display()
        mon = display.get_primary_monitor() or display.get_monitor(0)
        if mon:
            g = mon.get_geometry()
            self.move(g.x + g.width - WIDGET_WIDTH - MARGIN, g.y + MARGIN)

    def _on_draw(self, widget, cr):
        cr.set_source_rgba(0, 0, 0, 0)
        cr.set_operator(cairo.OPERATOR_SOURCE)
        cr.paint()
        return False

    def _on_js_message(self, ucm, result):
        try:
            msg = json.loads(result.get_js_value().to_string())
        except Exception:
            return
        action = msg.get('action')
        if action in ('hide', 'quit'):
            Gtk.main_quit()
        elif action == 'beginDrag':
            # Ask GDK for the real screen pointer position — JS screenX/Y is
            # unreliable inside a WebView and Gdk.CURRENT_TIME (0) is rejected
            # by the WM unless paired with real coordinates.
            display = Gdk.Display.get_default()
            seat = display.get_default_seat()
            _screen, px, py = seat.get_pointer().get_position()
            self.begin_move_drag(1, px, py, Gdk.CURRENT_TIME)


if __name__ == '__main__':
    if not os.path.exists(DIST_INDEX):
        print('ERROR: dist not found at', DIST_INDEX)
        print('Run "npm run build" first.')
        raise SystemExit(1)
    TimerOverlay()
    Gtk.main()
