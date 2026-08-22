/**
 * A real, decodable video — 16×16, one tenth of a second, black.
 *
 * `data:video/mp4;base64,AAAA` is enough for a test that only reads attributes,
 * but `VideoPlayer` hides its whole control bar behind `{#if !error}`, and an
 * undecodable source fires `error` a beat after mount. Any test of the controls
 * needs a source the browser accepts.
 *
 * WebM/VP8 rather than MP4/H.264 on purpose: headless Chromium ships without the
 * proprietary codecs, so a perfectly valid H.264 file errors here exactly like a
 * corrupt one — which cost an hour the first time.
 *
 * Produced with:
 *   ffmpeg -f lavfi -i color=c=black:s=16x16:d=0.1 -c:v libvpx -b:v 10k tiny.webm
 */
export const TINY_VIDEO = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIXEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggElTbuMU6uEHFO7a1OsggIB7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTIuMTAxV0GNTGF2ZjYyLjEyLjEwMUSJiEBeAAAAAAAAFlSua8iuAQAAAAAAAD/XgQFzxYjtSdKKem6iuJyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAJiWgDgkLCBELqBEJqBAlWwhFW5gQESVMNn/HNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjIuMTIuMTAxc3PWY8CLY8WI7UnSinpuorhnyKFFo4dFTkNPREVSRIeUTGF2YzYyLjI4LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjEyMDAwMDAwMAAfQ7Z11ueBAKOjgQAAgBACAJ0BKhAAEAAARwiFhYiFhIgCAgAMDWAA/v+rUICjlYEAKACxAQABEBAAGAAYWC/0AAgAAKOVgQBQALEBAAEQEAAYABhYL/QACAAAHFO7a5G7j7OBALeK94EB8YIBpvCBAw==';
