# Protected-media primary-source notes — Sol, 2026-09-27

Supporting research, not runtime qualification or proof of universal impossibility.

- [W3C EME](https://www.w3.org/TR/encrypted-media/#dom-mediakeystatus-output-restricted): keys may carry output restrictions which block presentation or downscale it; MediaKeys association/replacement behavior depends on the implementation. This supports a narrow CDM/key-policy capability constraint. It does not prove all encrypted content cannot be visually retained; Clear Key and protected hardware-output systems differ.
- [Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/#security-considerations): inaccessible media must remain protected from document-origin access. Unavailable/inaccessible captured tracks become muted and can show the last frame. Therefore a frozen captured frame is not evidence of live protected-video continuity.
- Chromium's indexed primary source at commit756af69b67c9e40e0a0c92cb6c0a911c96ea6835, `third_party/blink/renderer/modules/mediacapturefromelement/html_media_element_capture.cc`, states captureStream unsupported with EME. Full browser-tool retrieval failed; treat as a source lead, not current-version qualification. Official URL: https://chromium.googlesource.com/chromium/src/+/756af69b67c9e40e0a0c92cb6c0a911c96ea6835/third_party/blink/renderer/modules/mediacapturefromelement/html_media_element_capture.cc

Practical disposition should distinguish untouched authorized real-player presentation from pixel extraction/copying forbidden by the active content-protection system. No license, CDM or extraction workaround. Missing real protected fixture remains an evidence gap separately from an established output-policy constraint.
