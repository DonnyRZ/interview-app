# Windows Audio Capture Plan

## Current State

- Electron renderer can enumerate `audioinput` devices exposed by Windows/Chromium.
- The app can open the selected input with `getUserMedia` and validate local signal level with WebAudio.
- This proves microphone or virtual input readiness only.
- This does not prove direct Zoom, Meet, Teams, or YouTube system audio capture.

## Device Bias Guardrails

- Do not hardcode development device names.
- Always enumerate devices at runtime.
- Store user preference by device id, then revalidate it every session.
- If the stored device is gone, fall back to runtime default or ask user to choose again.
- Treat label-based detection only as a hint, not as product truth.

## Capture Paths

### 1. Microphone Input

Status: implemented as diagnostic readiness.

Pros:
- Works through Chromium/Electron without native module.
- Easy to validate with local signal meter.

Cons:
- Captures room audio, not meeting/system audio directly.
- Can accidentally pass when speaker audio leaks into the mic.

### 2. Virtual/System Input

Status: partially supported if Windows exposes it as `audioinput`.

Examples:
- Stereo Mix
- What U Hear
- VB-Audio Virtual Cable / CABLE Output
- Other loopback-like virtual input devices

Pros:
- Fastest MVP fallback.
- Still uses the existing picker and signal validation.

Cons:
- Requires user/system setup.
- Device naming varies by driver/vendor.
- Not ideal as the final product path.

### 3. Native WASAPI Loopback

Status: not implemented.

Recommended product path for Windows MVP.

Pros:
- Captures speaker/output audio directly.
- Works independently from microphone leakage.
- Better fit for Zoom, Meet, Teams, browser audio, and system audio.

Cons:
- Requires native Windows capture component.
- Needs packaging/build pipeline for native code or a helper binary.
- Needs PCM chunk streaming interface back to Electron.

## Recommended Next Step

Build a small Windows-only WASAPI loopback spike as a separate capture adapter:

1. Enumerate output render devices.
2. Select default output device first.
3. Capture loopback PCM frames.
4. Compute local level meter from PCM.
5. Expose start/stop/status to Electron.
6. Do not send audio to AI until local signal validation is stable.

Acceptance:
- Playing YouTube produces signal without relying on microphone input.
- Muting system output stops signal.
- Changing default output device can be detected or recovered with a refresh.
