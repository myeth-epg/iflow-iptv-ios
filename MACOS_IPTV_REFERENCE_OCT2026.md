# macOS iFlow IPTV Development Reference & Architecture Plan
**Date:** Tuesday, 13 October 2026  
**Target Platform:** macOS (Apple Silicon M1/M2/M3/M4 & Intel x86_64)  
**Workspace Path:** `C:\epg2\scripts_custom\iflow-iptv-macos`  
**Reference Baselines:** Windows Beta 3.13 ([iflow-iptv-vlc-3](file:///C:/epg2/scripts_custom/iflow-iptv-vlc-3)) & Android Beta 3.20 ([iflow-iptv-android-BETA-STABLE](file:///C:/epg2/scripts_custom/iflow-iptv-android-BETA-STABLE))

---

## 🎯 Architecture Overview & Cross-Platform Parity

The **macOS iFlow IPTV Player** is engineered to share 100% feature parity, stream stability, category routing rules, multi-format DVR recording, and dynamic audio track inspection capabilities established in the Windows desktop (`Beta 3.13`) and Android (`Beta 3.20`) releases.

```
                  ┌─────────────────────────────────────────┐
                  │          macOS iFlow IPTV UI            │
                  │   (SwiftUI / WKWebView / Avalonia UI)   │
                  └────────────────────┬────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │     Dual-Engine Auto Router         │
                    └─────────┬─────────────────┬─────────┘
                              │                 │
            ┌─────────────────┴─┐             ┌─┴─────────────────┐
            │   Google Shaka    │             │  Native VLCKit    │
            │   Web Engine      │             │  Engine (LibVLC)  │
            │ (WKWebView/HLS.js)│             │ (VLCKit Framework)│
            └───────────────────┘             └───────────────────┘
```

---

## 🔀 1. Category Engine Routing Table & Substring Guard Fix

To guarantee smooth playback across all regional stream providers, macOS will enforce the identical **Dual-Engine Auto Routing Table** developed during Windows Beta 3.13 and Android Beta 3.20.

> [!CAUTION]
> **Substring Matching Guard Rule**:
> Substring queries like `group.contains("HK-I")` and `group.contains("MY-I")` evaluate to `true` for `"HK-II"` and `"MY-II"`. 
> You **MUST** use explicit negative guards or token boundary checks to prevent `HK-II` and `MY-II` channels from accidentally routing into the Web Engine!

### Exact Guard Logic (Swift / C# Parity):

```swift
// Swift Implementation (macOS AppKit / SwiftUI)
let group = (channel.category ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()

let isHk1 = group.contains("HK-I") && !group.contains("HK-II")
let isMy1 = group.contains("MY-I") && !group.contains("MY-II")
let isCa  = group == "CA" || group.hasPrefix("CA-") || group.hasPrefix("CA ") || group.contains("CANADA")
let isUk  = group == "UK" || group.hasPrefix("UK-") || group.hasPrefix("UK ")
let isCn  = group == "CN" || group.hasPrefix("CN-") || group.hasPrefix("CN ") || group.contains("CHINA")

let useWebEngine = isMy1 || isHk1 || isCa || isUk || isCn ||
                   group.contains("TW-III") || group.contains("TW-VI") || 
                   group.contains("NZ-I") || group.contains("CA-II") || 
                   group.contains("MUSIC")
```

### Master Engine Routing Table:

| Engine | Assigned Categories | Technical Rationale & Behavior |
| :--- | :--- | :--- |
| **Google Shaka Engine (WKWebView / HLS.js)** | `HK-I`, `MY-I`, `TW-III`, `TW-VI`, `NZ-I`, `CA-II`, `UK`, `CA`, `Music`, `CN`, `CN-I`, `CN-II` | Resolves HLS HTTP 302 redirects (e.g. `CN` channels redirecting from `176868.cloud` to `core-uhd-1.web6868.com` where relative HLS segments require redirected host resolution) and low-latency browser stream playback. |
| **Native VLCKit Engine (LibVLC)** | `HK-II`, `MY-II`, `TW-I`, `TW-II`, `TW-IV`, `TW-V`, `SG`, `US`, `AU`, `Sports`, `4K`, `Adult`, & all remaining groups | Hardware-accelerated native playback for MPEG-TS streams and multi-PID audio stream extraction (`[aaa]`, `[bbb]`). |

---

## ⏺️ 2. Dual-Engine Multi-Format DVR Recording (.ts / .mp4 / .mkv)

As standardized in **Windows Beta 3.13**, macOS will support user-selectable DVR recording formats with **strict single-connection protection**:

### A. Supported DVR Formats & Storage Settings
Users can configure their preferred recording container under **Settings ➔ Interface ➔ Recording Paths**:
1. **MPEG-TS (`.ts`) - Broadcast Default**: Direct packet-by-packet disk streaming with zero CPU overhead and 100% crash protection.
2. **MP4 Video (`.mp4`) - Universal Mobile & Desktop**: Direct playback compatibility for QuickTime, iPhone, iPad, and web upload.
3. **Matroska Video (`.mkv`) - Multi-Track Container**: Ideal for multi-track audio and high-bitrate archiving.

### B. CRITICAL ARCHITECTURAL RULE (Single Connection Requirement)
> [!IMPORTANT]
> **Single Connection Requirement for Native VLCKit Engine**:
> Regional IPTV providers (e.g. `TW-I`, `TW-II`, `MY-II`, `CN`) enforce strict **1-connection limits per IP/token**.
> Opening a 2nd background HTTP connection causes the provider server to immediately throttle/freeze the 1st connection ("stop and on .. interrupted").
> **Rule**: ALL VLCKit recording MUST use single-connection stream duplication:
> ```
> :sout=#duplicate{dst=display,dst=std{access=file,mux=[format],dst="..."}} :sout-all :sout-keep
> ```
> Where `mux` dynamically matches the selected format: `mux=ts`, `mux=mp4`, or `mux=mkv`.
> This guarantees **0 extra HTTP connections**, preventing stream freezes on live playback.

### C. Google Shaka Web Engine Recording (WKWebView)
- Uses HTML5 `MediaRecorder` on `<video>` with **0 extra HTTP connections**.
- Buffers stream chunks in memory and outputs clean temporary video.
- Invokes native background remuxing (`ffmpeg -y -i "temp.webm" -c copy "recording.[format]"`) with zero re-encoding in ~0.05s, cleans up temporary files, and notifies the user upon completion.

### D. Safe Auto-Stop on Channel Switch
- If a user changes channels while recording is active, the app automatically **finalizes and closes the active file cleanly** before loading the new channel.
- Prevents container corruption from mixing differing resolutions, codecs, or audio PIDs into a single file.

---

## 🎨 3. EPG OSD UI/UX & Visual Standards

Inheriting the visual polish from Windows Beta 3.13:
1. **Real-Time Panel Opacity Control**:
   - Customizable OSD background transparency accessible via Settings:
     - `100% (Solid)`: Full contrast opaque overlay.
     - `75% (Standard)`: Default balanced transparency.
     - `50% (Transparent)`: Moderate see-through overlay.
     - `25% (Very Transparent)`: Minimal overlay.
2. **High-Contrast Vertical Divider**:
   - The vertical divider between **NOW PLAYING** (Current Programme, Left) and **UP NEXT** (Next Programme, Right) is styled in **Pure White (`#FFFFFF`)** with `1.5pt` thickness for crisp legibility over dark video streams.
3. **EPG Timeline Progress Bar**:
   - Real-time elapsed percentage bar, showing duration in minutes and exact start/stop hours (`HH:mm — HH:mm`).

---

## 🎵 4. Dynamic Audio Track Stream Inspection & Live Switching

- **Dynamic Track Discovery**: Query stream audio tracks directly from native stream descriptors (`_mediaPlayer.audioTrackDescription` for VLCKit / Shaka track API for Web Engine).
- **No Legacy Hardcoded Options**: Completely strip out old static choices (`Left Only`, `Right Only`, `Full Stereo`). Display exact native PIDs (`🎵 Audio Track 1 (Track 1 - [aaa])`, `🎵 Audio Track 2 (Track 2 - [bbb])`).
- **Seamless Live Switching**: Execute live audio track switches (`_mediaPlayer.setAudioTrack(id)`) directly on active players **without stopping or restarting** the video stream.

---

## ⚡ 5. Hardware Acceleration Quick Switcher (H/W ↔ S/W)

- **Quick Settings Toggle**: Place a `⚡ HW Accel: H/W` vs `S/W` toggle on the slide-out Quick Settings panel.
- **VLCKit HW Binding**:
  - `H/W Mode`: Enable Apple VideoToolbox hardware decoding (`media.addOption(":hwdec=auto")` / `setHWDecoderEnabled(true)`).
  - `S/W Mode`: Force software decoding (`media.addOption(":hwdec=none")` / `setHWDecoderEnabled(false)`).
- **Live Stream Reload**: Toggling hardware acceleration reloads the active stream live so the new decoding pipeline takes effect immediately.

---

## 📋 6. Data Architecture & Custom Favorites

1. **3-Profile Schema**: Hot-swappable configuration for Profile A, Profile B, and Profile C (M3U & EPG URLs).
2. **Custom Favorites (`⭐`)**:
   - User-configurable favorite groups (`SettingsFav1Name` .. `SettingsFav4Name`).
   - Highlighted in sidebar category list with `⭐` badges.
   - Context menu / Right-click to add or remove channels dynamically.
3. **Persistent Settings**: All user preferences saved cleanly into local JSON configuration (`config.json` / `UserDefaults`).

---

## 🛠️ Recommended macOS Tech Stack Options

* **Option 1: Swift / SwiftUI + VLCKit + WKWebView (Native Apple)**
  * **Pros**: Native Apple Silicon performance (M1–M4), 60fps Metal UI rendering, native VideoToolbox hardware acceleration, zero runtime dependencies.
* **Option 2: Avalonia UI / .NET 9 for macOS**
  * **Pros**: Shares 100% C# data structures, M3U/EPG parsing code, and settings logic directly from Windows `iflow-iptv-vlc-3`.

---

## 📡 7. In-App Casting & Screen Handoff (AirPlay & Google Cast)
- **AirPlay 2 (macOS Native)**: Native AirPlay route picker button (`AVRoutePickerView`) to stream video directly to Apple TV / AirPlay 2 Smart TVs.
- **Google Cast SDK Framework**: Cross-platform Cast protocol to hand off live stream URLs to nearby Chromecast and Android TV devices (matching Android Beta 3.20 capabilities).

---

### 📦 Baseline Reference Code Locations
* **Windows Baseline Workspace**: [`C:\epg2\scripts_custom\iflow-iptv-vlc-3`](file:///C:/epg2/scripts_custom/iflow-iptv-vlc-3)
* **Windows Beta 3.13 Zip**: [`iFlow_IPTV_Portable_Beta_v3.13.zip`](file:///C:/epg2/scripts_custom/iflow-iptv-vlc-3/BETA/iFlow_IPTV_Portable_Beta_v3.13.zip)
* **Android Baseline Workspace**: [`C:\epg2\scripts_custom\iflow-iptv-android-BETA-STABLE`](file:///C:/epg2/scripts_custom/iflow-iptv-android-BETA-STABLE)
* **Android Beta 3.20 APK**: [`iFlow_IPTV_Android_Beta_v3.20.apk`](file:///C:/epg2/scripts_custom/iflow-iptv-android-BETA-STABLE/iFlow_IPTV_Android_Beta_v3.20.apk)
