import { beforeAll, expect, it } from 'vitest';
import { attachClosedToDiv, defineElements } from '../src/elements.js';
import { shadowEvidence } from '../src/detect.js';

beforeAll(() => defineElements());
const engine = navigator.userAgent.includes('Firefox') ? 'firefox' : /Chrome\//.test(navigator.userAgent) ? 'chromium' : 'webkit';

it('classifies shadow evidence without patching or mutation', () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <closed-badge label="x"></closed-badge>
    <closed-slot-card><span slot="title">T</span><p>unslotted</p></closed-slot-card>
    <closed-slot-card><span slot="title">only slotted</span></closed-slot-card>
    <light-card>light text</light-card>
    <light-card></light-card>
    <closed-serial></closed-serial>
    <div id="open"></div>
    <div id="closed-empty"></div>
    <div id="closed-child"><p>unrendered</p></div>
    <div id="closed-text">loose text</div>
    <div id="plain"><p>rendered</p></div>
    <div id="hidden-child"><p style="display:none">hidden</p></div>`;
  document.body.append(root);
  root.querySelector('#open')!.attachShadow({ mode: 'open' });
  for (const id of ['closed-empty', 'closed-child', 'closed-text']) attachClosedToDiv(root.querySelector<HTMLElement>(`#${id}`)!);
  const got = [...root.children].map(element => `${element.id || element.localName}:${shadowEvidence(element)}`);
  console.info(`[detect:${engine}] ${got.join(' ')}`);
  expect(got).toEqual([
    'closed-badge:suspected',          // no light children: closed or light-only cannot be told apart
    'closed-slot-card:confirmed',      // the unslotted <p> has no boxes
    'closed-slot-card:suspected',      // every light child is slotted (rendered)
    'light-card:suspected',            // rendered light text: still ambiguous for a defined custom element
    'light-card:suspected',
    'closed-serial:declared',
    'open:open',
    'closed-empty:none',               // closed root on a built-in element, no light children: undetectable
    'closed-child:confirmed',
    'closed-text:confirmed',
    'plain:none',
    'hidden-child:none'                // display:none children are not evidence
  ]);
  root.remove();
});

it('ordinary no-rect content is not taken as closed-root evidence', () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <div id="cv-hidden" style="content-visibility:hidden;width:50px;height:20px"><p>skipped</p></div>
    <div id="empty-span"><span></span></div>
    <div id="wbr">a<wbr>b</div>
    <div id="zero-font"><span style="font-size:0">zero</span></div>
    <div id="zero-font-text" style="font-size:0">zero text</div>
    <div id="contents"><span style="display:contents"><b>in contents</b></span></div>
    <div id="hidden-attr"><p hidden>h</p></div>
    <div id="template"><template><p>t</p></template></div>
    <div id="script"><script type="x"></script></div>
    <div id="abs"><p style="position:absolute;left:-9999px">off</p></div>
    <div id="zero-size"><p style="width:0;height:0;overflow:hidden;margin:0"></p></div>
    <div id="visibility-hidden"><p style="visibility:hidden">v</p></div>
    <div id="pseudo-only" class="pseudo"></div>
    <details id="details"><summary>s</summary><p>closed details body</p></details>
    <select id="select"><option>a</option><option>b</option></select>
    <video id="video"><source src="x.mp4"><p>fallback</p></video>
    <canvas id="canvas"><p>fallback</p></canvas>
    <div id="closed-cv" style="content-visibility:auto"><p>x</p></div>`;
  const style = document.createElement('style'); style.textContent = '.pseudo::before{content:"generated"}'; root.prepend(style);
  document.body.append(root);
  attachClosedToDiv(root.querySelector<HTMLElement>('#closed-cv')!);
  const got = [...root.children].filter(element => element.id).map(element => `${element.id}:${shadowEvidence(element)}`);
  console.info(`[detect:${engine}] ${got.join(' ')}`);
  expect(got.filter(entry => !entry.startsWith('closed-cv')).every(entry => entry.endsWith(':none'))).toBe(true);
  expect(got).toContain('closed-cv:confirmed');
  root.remove();
});

it('indistinguishable pair: every public signal is identical, yet one hides paint in a closed root', () => {
  const root = document.createElement('div');
  root.innerHTML = `<pair-light style="display:block"><span>Pair text</span></pair-light><pair-closed><span>Pair text</span></pair-closed>`;
  document.body.append(root);
  const [a, b] = [...root.children] as HTMLElement[];
  const serialize = (element: Element) => { const cs = getComputedStyle(element); return Array.from(cs).map(name => `${name}:${cs.getPropertyValue(name)}`).join(';'); };
  const rect = (element: Element) => { const r = element.getBoundingClientRect(); return [r.width, r.height].join('x'); };
  const html = (element: Element) => (element as Element & { getHTML(o: object): string }).getHTML({ serializableShadowRoots: true });
  const signals = (host: HTMLElement) => ({
    shadowRoot: String(host.shadowRoot), getHTML: html(host), innerHTML: host.innerHTML, evidence: shadowEvidence(host),
    hostStyle: serialize(host), hostSize: rect(host), childStyle: serialize(host.firstElementChild!), childSize: rect(host.firstElementChild!),
    childRects: host.firstElementChild!.getClientRects().length, assignedSlot: String(host.firstElementChild!.assignedSlot),
    childOffset: String((host.firstElementChild as HTMLElement).offsetTop - host.offsetTop)
  });
  const sa = signals(a!), sb = signals(b!);
  const differing = Object.keys(sa).filter(key => sa[key as keyof typeof sa] !== sb[key as keyof typeof sb]);
  console.info(`[pair:${engine}] differing public signals=${JSON.stringify(differing)} evidence=${sa.evidence}/${sb.evidence} sizes=${sa.hostSize}/${sb.hostSize}`);
  expect(differing).toEqual([]);
  root.remove();
});
