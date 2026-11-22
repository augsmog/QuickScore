These are minimal synthetic structural fixtures derived from AOSP android-15.0.0_r1,
not captured runner output and not native evidence. They contain no real device IDs.
WindowManagerService.java 6757-6769 selects display versus window-list dumps;
DisplayContent.java 3355-3389 emits the display header and current focus.
https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/services/core/java/com/android/server/wm/WindowManagerService.java#L6757
https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/services/core/java/com/android/server/wm/DisplayContent.java#L3355
AAPT XMLNode.cpp 408-485 formats tags/typed values and increments indentation for
namespace events as well as elements. Fixed absolute indentation is not structural.
https://github.com/aosp-mirror/platform_frameworks_base/blob/android-15.0.0_r1/tools/aapt/XMLNode.cpp#L408
WMS 6495 invokes RootWindowContainer.dumpTopFocusedDisplayId in the windows path.
The tests separately supply this global readback; the displays fixture itself does
not contain a global ID. Missing, duplicate, non-default and changing global IDs
are negative controls. No activity launch-name/suffix parser was introduced.
