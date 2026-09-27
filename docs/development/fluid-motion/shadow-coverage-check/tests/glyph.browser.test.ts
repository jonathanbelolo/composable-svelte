// Isolated witness for Core91's generated-text pixel gap: does literal text render like the same generated text?
import { it } from 'vitest';
import { page } from 'vitest/browser';

const engine = navigator.userAgent.includes('Firefox') ? 'firefox' : /Chrome\//.test(navigator.userAgent) ? 'chromium' : 'webkit';
async function pixels(element: Element) {
  const raw = await page.screenshot({ element, base64: true, save: false } as never) as unknown;
  const base64 = typeof raw === 'string' ? raw : (raw as { base64: string }).base64;
  const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
  const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; c.getContext('2d')!.drawImage(image, 0, 0);
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
}
const differing = (a: Uint8ClampedArray, b: Uint8ClampedArray) => { let bad = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i += 4) if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) > 24) bad++; return (bad / (n / 4)).toFixed(4); };

it('generated vs literal glyphs', async () => {
  const root = document.createElement('div');
  root.innerHTML = `<style>
    @counter-style circled { system: cyclic; symbols: "Ⓐ" "Ⓑ"; suffix: " "; }
    .box { display: block; width: 160px; height: 24px; font: 16px sans-serif; margin: 2px; }
    .g1::before { content: "Ⓐ 👍"; } .g2::before { content: counter(c, circled) "👍"; counter-reset: c 0; }
    .q { quotes: auto; } .q::before { content: open-quote; } .q::after { content: close-quote; }
    .m { display: list-item; list-style: circled inside; }
    .g3 { counter-reset: d 1; } .g3::before { content: counter(d, circled) "👍"; }
    .g4 { counter-reset: e 1; } .g4::before { content: counter(e, circled); white-space: pre; }
  </style>
  <span class="box g1" id="g1"></span><span class="box" id="l1">Ⓐ 👍</span>
  <span class="box g2" id="g2"></span><span class="box" id="l2">Ⓐ 👍</span>
  <span class="box" id="l2e" style="font-variant-emoji: normal">Ⓐ 👍</span><span class="box" id="l2t" style="font-variant-emoji: text">Ⓐ 👍</span>
  <q class="box q" id="q1" lang="en">hi</q><span class="box" id="lq">“hi”</span>
  <span class="box m" id="m1">x</span><span class="box" id="lm">Ⓐ x</span>
  <span class="box" id="lmtab" style="font-variant-numeric: tabular-nums; white-space: pre">Ⓐ x</span>
  <span class="box g3" id="g3"></span><span class="box" id="l3a">Ⓐ👍</span><span class="box" id="l3b">Ⓑ👍</span><span class="box" id="l3c">Ⓐ 👍</span>
  <span class="box g4" id="g4"></span><span class="box" id="l4a">Ⓐ</span><span class="box" id="l4b">Ⓐ </span>`;
  document.body.append(root);
  await new Promise(r => setTimeout(r, 100));
  const p = async (id: string) => pixels(root.querySelector(`#${id}`)!);
  const out: string[] = [];
  for (const [a, b] of [['g1', 'l1'], ['g2', 'l2'], ['g2', 'l2e'], ['g2', 'l2t'], ['q1', 'lq'], ['m1', 'lm'], ['m1', 'lmtab'], ['g3', 'l3a'], ['g3', 'l3b'], ['g3', 'l3c'], ['g4', 'l4a'], ['g4', 'l4b']] as const) out.push(`${a}~${b}=${differing(await p(a), await p(b))}`);
  const cs = (id: string, pseudo?: string) => { const s = getComputedStyle(root.querySelector(`#${id}`)!, pseudo); return `${s.fontFamily}|${s.getPropertyValue('font-variant-emoji')}|${s.fontVariantNumeric}|${s.whiteSpace}|${s.content}`; };
  console.info(`[glyph:${engine}] ${out.join(' ')} | g2::before=${cs('g2', '::before')} m1::marker=${cs('m1', '::marker')} q1::before=${cs('q1', '::before')}`);
  root.remove();
});
