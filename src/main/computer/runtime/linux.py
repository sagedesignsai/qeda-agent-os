#!/usr/bin/env python3
"""
Linux AT-SPI accessibility sidecar for Qeda computer-use (Phase 1).

Speaks JSON-RPC-like messages over stdin/stdout, one JSON object per line:
  {"id": 1, "method": "handshake", "params": {}}
  -> {"id": 1, "result": {...}}

Methods:
  - handshake
  - get_app_state { app?: str, windowId?: str }
  - perform_action { app?: str, windowId?: str, element?: str, action?: str }
  - set_value { app?: str, windowId?: str, element?: str, value: str }
  - synthetic_click { x: int, y: int, button?: str }
  - type_text { text: str } (best-effort via Atspi.generate_keyboard_event)
  - screenshot {} (best-effort; may return null)

Implementation notes:
  - Uses gi.repository Atspi (and optionally Gdk/GdkPixbuf) when available.
  - Keeps dependencies to standard desktop libraries; degrades gracefully.
  - Assigns stable-ish element tags (@e1, @e2, ...) per snapshot.
"""

import argparse
import json
import sys
import traceback

try:
    import gi  # type: ignore

    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi  # type: ignore
except Exception:  # pragma: no cover - environment dependent
    Atspi = None  # type: ignore

try:
    import gi as _gi  # noqa: F401
    _gi.require_version("Gdk", "3.0")
    from gi.repository import Gdk  # type: ignore
except Exception:  # pragma: no cover
    Gdk = None  # type: ignore


def ok(id_, result):
    return {"id": id_, "result": result}


def err(id_, message, code="error"):
    return {"id": id_, "error": {"code": code, "message": str(message)}}


def safe_str(fn, default=""):
    try:
        v = fn()
        return "" if v is None else str(v)
    except Exception:
        return default


def get_role_name(acc):
    try:
        return Atspi.Accessible.get_role_name(acc) or "unknown"
    except Exception:
        try:
            role = acc.get_role()
            return Atspi.role_get_name(role)
        except Exception:
            return "unknown"


def get_states(acc):
    states = []
    try:
        sset = acc.get_state_set()
        # Common states we care about
        mapping = [
            (Atspi.StateType.FOCUSABLE, "focusable"),
            (Atspi.StateType.FOCUSED, "focused"),
            (Atspi.StateType.ENABLED, "enabled"),
            (Atspi.StateType.SENSITIVE, "sensitive"),
            (Atspi.StateType.VISIBLE, "visible"),
            (Atspi.StateType.SHOWING, "showing"),
            (Atspi.StateType.EDITABLE, "editable"),
            (Atspi.StateType.EXPANDABLE, "expandable"),
            (Atspi.StateType.EXPANDED, "expanded"),
            (Atspi.StateType.CHECKED, "checked"),
            (Atspi.StateType.SELECTED, "selected"),
        ]
        for st, name in mapping:
            try:
                if sset.contains(st):
                    states.append(name)
            except Exception:
                pass
    except Exception:
        pass
    return states


def get_actions(acc):
    actions = []
    try:
        iface = acc.get_action_iface()
    except Exception:
        iface = None
    if not iface:
        return actions
    try:
        n = iface.get_n_actions()
        for i in range(n):
            try:
                name = iface.get_action_name(i)
                if name:
                    actions.append(str(name))
            except Exception:
                pass
    except Exception:
        pass
    return actions


def get_extents(acc):
    try:
        comp = acc.get_component_iface()
        if not comp:
            return None
        rect = comp.get_extents(Atspi.CoordType.SCREEN)
        return {"x": int(rect.x), "y": int(rect.y), "width": int(rect.width), "height": int(rect.height)}
    except Exception:
        return None


def get_text_value(acc):
    try:
        text = acc.get_text_iface()
        if text:
            try:
                n = text.get_character_count()
                if n > 0:
                    return text.get_text(0, min(n, 500))
            except Exception:
                pass
    except Exception:
        pass
    try:
        editable = acc.get_editable_text_iface()
        if editable:
            try:
                n = acc.get_text_iface().get_character_count()
                return acc.get_text_iface().get_text(0, min(n, 500))
            except Exception:
                pass
    except Exception:
        pass
    return None


def enumerate_windows(app_filter=None, window_filter=None):
    if Atspi is None:
        raise RuntimeError("AT-SPI (gi.repository.Atspi) is not available")
    desktop = Atspi.get_desktop(0)
    count = desktop.get_child_count()
    out = []
    for i in range(count):
        try:
            app = desktop.get_child_at_index(i)
        except Exception:
            continue
        app_name = safe_str(app.get_name)
        if app_filter and app_filter.lower() not in app_name.lower():
            continue
        try:
            wcount = app.get_child_count()
        except Exception:
            wcount = 0
        for j in range(wcount):
            try:
                win = app.get_child_at_index(j)
            except Exception:
                continue
            role = get_role_name(win)
            if role not in ("frame", "dialog", "window", "alert", "application"):
                # still include if it looks like a top-level window
                pass
            title = safe_str(win.get_name) or app_name
            wid = f"{i}:{j}"
            if window_filter and window_filter not in (wid, title):
                if window_filter.lower() not in title.lower():
                    continue
            out.append({"app_index": i, "win_index": j, "app": app_name, "title": title, "role": role, "windowId": wid, "acc": win})
    return out


ELEMENT_INDEX = {}  # ref -> (app_index, win_index, path tuple)


def walk(acc, app_name, window_id, elements, roots, depth=0, path=(), counter=None, max_nodes=400):
    if counter is None:
        counter = {"i": 1}
    if counter["i"] > max_nodes or depth > 12:
        return None
    try:
        name = safe_str(acc.get_name)
        role = get_role_name(acc)
        states = get_states(acc)
    except Exception:
        return None

    # Skip invisible noise but keep structure roots
    if depth > 0 and ("visible" not in states and "showing" not in states):
        # allow if it has a meaningful name/role
        if not name and role in ("unknown", "section", "panel", "filler"):
            return None

    ref = f"@e{counter['i']}"
    counter["i"] += 1
    el = {
        "ref": ref,
        "role": role,
        "name": name or None,
        "description": None,
        "value": get_text_value(acc),
        "bounds": get_extents(acc),
        "actions": get_actions(acc) or None,
        "states": states or None,
        "app": app_name,
        "windowId": window_id,
    }
    # prune None fields
    el = {k: v for k, v in el.items() if v is not None}
    elements[ref] = el
    ELEMENT_INDEX[ref] = (path, app_name, window_id)

    try:
        n = acc.get_child_count()
    except Exception:
        n = 0
    child_refs = []
    for idx in range(min(n, 60)):
        try:
            child = acc.get_child_at_index(idx)
        except Exception:
            continue
        cref = walk(child, app_name, window_id, elements, roots, depth + 1, path + (idx,), counter, max_nodes)
        if cref:
            child_refs.append(cref)
    if child_refs:
        elements[ref]["children"] = child_refs
    return ref


def get_app_state(params):
    global ELEMENT_INDEX
    ELEMENT_INDEX = {}
    if Atspi is None:
        return {
            "at": 0,
            "error": "AT-SPI not available on this system (gi.repository.Atspi missing)",
            "elements": {},
            "roots": [],
        }
    try:
        windows = enumerate_windows(params.get("app"), params.get("windowId"))
    except Exception as e:
        return {"at": 0, "error": str(e), "elements": {}, "roots": []}
    if not windows:
        return {"at": 0, "app": params.get("app"), "title": None, "elements": {}, "roots": [], "warning": "No matching windows found"}

    w = windows[0]
    elements = {}
    roots = []
    root_ref = walk(w["acc"], w["app"], w["windowId"], elements, roots, 0, ())
    if root_ref:
        roots.append(root_ref)
    return {
        "at": int(__import__("time").time() * 1000),
        "app": w["app"],
        "title": w["title"],
        "windowId": w["windowId"],
        "elements": elements,
        "roots": roots,
    }


def find_element(ref, window_hint=None):
    # Best-effort: re-scan and pick by traversal order index encoded in ref (@eN)
    if Atspi is None:
        raise RuntimeError("AT-SPI not available")
    if not ref or not ref.startswith("@e"):
        raise RuntimeError("Invalid element ref")
    try:
        target_n = int(ref[2:])
    except Exception:
        raise RuntimeError("Invalid element ref")
    windows = enumerate_windows(None, window_hint)
    if not windows:
        raise RuntimeError("No windows available")
    # search across windows in order
    for w in windows:
        stack = [(w["acc"], 0)]
        counter = 1
        while stack:
            acc, depth = stack.pop()
            if counter == target_n:
                return acc, w
            counter += 1
            try:
                n = acc.get_child_count()
            except Exception:
                n = 0
            # push children in reverse to approximate pre-order
            for idx in range(min(n, 60) - 1, -1, -1):
                try:
                    child = acc.get_child_at_index(idx)
                except Exception:
                    continue
                stack.append((child, depth + 1))
    raise RuntimeError(f"Element {ref} not found")


def perform_action(params):
    ref = params.get("element")
    action_name = params.get("action")
    acc, w = find_element(ref, params.get("windowId"))
    try:
        iface = acc.get_action_iface()
    except Exception:
        iface = None
    if iface:
        try:
            n = iface.get_n_actions()
            chosen = -1
            for i in range(n):
                try:
                    name = str(iface.get_action_name(i) or "")
                except Exception:
                    name = ""
                if action_name and action_name.lower() == name.lower():
                    chosen = i
                    break
                if chosen < 0 and name.lower() in ("click", "press", "activate", "jump"):
                    chosen = i
            if chosen < 0 and n > 0:
                chosen = 0
            if chosen >= 0:
                ok_do = iface.do_action(chosen)
                return {"success": bool(ok_do), "actionIndex": chosen, "windowId": w["windowId"]}
        except Exception as e:
            return {"success": False, "error": str(e)}
    # Fallback: try component click at center
    ext = get_extents(acc)
    if ext and ext["width"] > 0 and ext["height"] > 0:
        x = ext["x"] + ext["width"] // 2
        y = ext["y"] + ext["height"] // 2
        try:
            Atspi.generate_mouse_event(x, y, "b1c")
            return {"success": True, "fallback": "synthetic_click", "x": x, "y": y}
        except Exception as e:
            return {"success": False, "error": str(e)}
    return {"success": False, "error": "No action interface or bounds available"}


def set_value(params):
    ref = params.get("element")
    value = params.get("value", "")
    acc, w = find_element(ref, params.get("windowId"))
    # Try editable text interface first
    try:
        et = acc.get_editable_text_iface()
        if et:
            try:
                # clear existing text if possible
                ti = acc.get_text_iface()
                if ti:
                    n = ti.get_character_count()
                    if n > 0:
                        try:
                            et.delete_text(0, n)
                        except Exception:
                            pass
                et.insert_text(0, str(value), len(str(value)))
                return {"success": True, "windowId": w["windowId"]}
            except Exception:
                pass
    except Exception:
        pass
    # Fallback: focus/click then type via keyboard events (best-effort)
    ext = get_extents(acc)
    if ext:
        try:
            x = ext["x"] + max(1, ext["width"] // 2)
            y = ext["y"] + max(1, ext["height"] // 2)
            Atspi.generate_mouse_event(x, y, "b1c")
        except Exception:
            pass
    try:
        # naive per-char typing; limited but dependency-free
        for ch in str(value):
            try:
                Atspi.generate_keyboard_event(ord(ch), None, Atspi.KeySynthType.STRING)
            except Exception:
                # try printable fallback
                pass
        return {"success": True, "fallback": "keyboard_events", "windowId": w["windowId"]}
    except Exception as e:
        return {"success": False, "error": str(e)}


def synthetic_click(params):
    x = int(params.get("x", 0))
    y = int(params.get("y", 0))
    button = str(params.get("button", "left"))
    name = "b1c"
    if button == "right":
        name = "b3c"
    elif button == "middle":
        name = "b2c"
    Atspi.generate_mouse_event(x, y, name)
    return {"success": True}


def type_text(params):
    text = str(params.get("text", ""))
    for ch in text:
        Atspi.generate_keyboard_event(0, ch, Atspi.KeySynthType.STRING)
    return {"success": True}


def screenshot(params):
    # Best-effort: AT-SPI itself doesn't capture pixels; return null to let
    # callers fall back to other capture mechanisms.
    return {"dataUrl": None, "warning": "Screenshot not implemented in AT-SPI sidecar"}


METHODS = {
    "handshake": lambda params: {
        "ok": True,
        "atspi": Atspi is not None,
        "platform": sys.platform,
    },
    "get_app_state": get_app_state,
    "perform_action": perform_action,
    "set_value": set_value,
    "synthetic_click": synthetic_click,
    "type_text": type_text,
    "screenshot": screenshot,
}


def handle_line(line):
    try:
        msg = json.loads(line)
    except Exception:
        return None
    id_ = msg.get("id")
    method = msg.get("method")
    params = msg.get("params") or {}
    if method not in METHODS:
        return err(id_, f"Unknown method: {method}", "method_not_found")
    try:
        result = METHODS[method](params)
        return ok(id_, result)
    except Exception as e:
        tb = traceback.format_exc(limit=3)
        return err(id_, f"{e}\n{tb}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true", help="run a basic smoke test and exit")
    args = ap.parse_args()

    if args.test:
        result = {"handshake": METHODS["handshake"]({})}
        try:
            result["state"] = METHODS["get_app_state"]({})
        except Exception as e:
            result["state_error"] = str(e)
        print(json.dumps(result, ensure_ascii=False))
        return 0

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        resp = handle_line(line)
        if resp is None:
            continue
        sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
