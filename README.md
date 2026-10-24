# iFlow IPTV macOS Workspace

**Location:** `C:\epg2\scripts_custom\iflow-iptv-macos`  
**Reference Document:** [MACOS_IPTV_REFERENCE_OCT2026.md](file:///C:/epg2/scripts_custom/iflow-iptv-macos/MACOS_IPTV_REFERENCE_OCT2026.md)

This directory is reserved for the **macOS iFlow IPTV Player** project (Apple Silicon M1/M2/M3/M4 & Intel x86_64).

---

## 📌 Architecture & Dual-Engine Principles

The macOS player inherits 100% feature parity, category routing rules, multi-format DVR recording, and UI/UX standards established in the Windows desktop (`Beta 3.13`) and Android (`Beta 3.20`) releases:

- **Dual-Engine Auto Router**: 
  - **Google Shaka Engine (WKWebView / HLS.js)**: Handles `HK-I`, `MY-I`, `TW-III/VI`, `NZ-I`, `CA`, `UK`, `Music`, and `CN/CN-I/CN-II` (HTTP 302 cross-domain redirect resolution).
  - **Native VLCKit Engine (LibVLC)**: Handles `HK-II`, `MY-II`, `TW-I/II/IV/V`, `SG`, `US`, `AU`, `Sports`, `4K`, `Adult`, & all remaining groups for native multi-PID audio stream extraction (`[aaa]`, `[bbb]`).
- **Multi-Format DVR Recording (`.ts` / `.mp4` / `.mkv`)**:
  - **Strict Single-Connection Rule**: Enforces `:sout=#duplicate` on VLCKit to prevent provider session drops/freezes on channels like `TW-I`, `TW-II`, `MY-II`, and `CN`.
  - Zero-extra HTTP connection MediaRecorder for Web Engine with native background remuxing (`-c copy`).
  - Safe auto-finalization upon channel switching to prevent video corruption.
- **EPG OSD Standards**:
  - Real-time panel opacity settings (`100%`, `75%`, `50%`, `25%`).
  - High-contrast pure white (`#FFFFFF`) vertical divider between NOW PLAYING and UP NEXT.
- **Dynamic Audio Track Inspection**: Live PID querying and switching without restarting video streams.
- **Hardware Acceleration Quick Switcher**: Live `⚡ HW Accel` (H/W VideoToolbox ↔ S/W) toggle on the slide-out Quick Settings panel.

---

## 🔗 Quick Links & Cross-Platform Baselines
- 📘 **Architectural Plan & Reference Note**: [MACOS_IPTV_REFERENCE_OCT2026.md](file:///C:/epg2/scripts_custom/iflow-iptv-macos/MACOS_IPTV_REFERENCE_OCT2026.md)
- 🖥️ **Windows Beta 3.13 Baseline**: [C:\epg2\scripts_custom\iflow-iptv-vlc-3](file:///C:/epg2/scripts_custom/iflow-iptv-vlc-3)
- 📱 **Android Beta 3.20 Baseline**: [C:\epg2\scripts_custom\iflow-iptv-android-BETA-STABLE](file:///C:/epg2/scripts_custom/iflow-iptv-android-BETA-STABLE)
