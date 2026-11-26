# device-layout/v1 Godot 4 geometry dumper (writes device-layout/godot-dump/v1).
# Usage from a test/tool scene after the target screen is ready:
#   var Dumper = load("res://tools/device_layout/dump_layout.gd")
#   Dumper.dump(get_tree().root, "main_menu", "iphone-15-pro-landscape", "user://layout/main_menu.json")
# Run the build at the device's window size (e.g. --resolution 2556x1179) so the
# visible rect matches the device aspect; the node adapter rejects mismatches.
# NOTE: not executed in AUG-1381 CI (no Godot on the Mac lane); the JS adapter is
# tested against a fixture with this exact shape. LRD wiring is the follow-up.
extends RefCounted

const INTERACTIVE := ["BaseButton", "LineEdit", "TextEdit", "Range", "ItemList", "Tree", "TabBar", "SpinBox"]

static func _is_interactive(c: Control) -> bool:
	if c.has_meta("device_layout_target"):
		return bool(c.get_meta("device_layout_target"))
	for cls in INTERACTIVE:
		if c.is_class(cls) and not (cls == "Range" and c.is_class("ProgressBar")):
			return true
	return false

static func _text(c: Control) -> String:
	if c is Label or c is Button or c is RichTextLabel or c is LineEdit:
		return c.text if not (c is RichTextLabel) else c.get_parsed_text()
	return ""

static func _walk(n: Node, out: Array, parent_interactive: String) -> void:
	var next_parent := parent_interactive
	if n is Control and n.is_visible_in_tree():
		var c: Control = n
		var r := c.get_global_rect()
		var interactive := _is_interactive(c)
		out.append({
			"path": str(c.get_path()),
			"name": c.name,
			"class": c.get_class(),
			"rect": [r.position.x, r.position.y, r.size.x, r.size.y],
			"visible": true,
			"interactive": interactive,
			"text": _text(c),
			"parent_interactive": parent_interactive if parent_interactive != "" else null,
			"rotated": absf(c.get_global_transform().get_rotation()) > 0.001,
		})
		if interactive:
			next_parent = str(c.get_path())
	for child in n.get_children():
		_walk(child, out, next_parent)

static func dump(root: Node, screen: String, device: String, path: String, screenshot := "") -> Error:
	var nodes := []
	_walk(root, nodes, "")
	var vp := root.get_viewport().get_visible_rect().size
	var doc := {
		"schema": "device-layout/godot-dump/v1",
		"screen": screen,
		"device": device,
		"engine": Engine.get_version_info().string,
		"viewport": {"width": vp.x, "height": vp.y},
		"screenshot": screenshot if screenshot != "" else null,
		"nodes": nodes,
	}
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	f.store_string(JSON.stringify(doc, "  "))
	return OK
