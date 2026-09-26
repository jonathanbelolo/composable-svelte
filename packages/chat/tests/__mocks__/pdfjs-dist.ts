/** PDF.js engine boundary fake. Default remains an immediate three-page document. */
export const GlobalWorkerOptions = { workerSrc: '' };
export const version = '5.0.0';
export interface PDFTestRender { promise: Promise<void>; cancel(): void; }
export interface PDFTestPage { getViewport(options: { scale: number }): { width: number; height: number }; render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): PDFTestRender; }
export interface PDFTestDocument { numPages: number; getPage(page: number): Promise<PDFTestPage>; destroy(): Promise<void>; }
export interface PDFTestLoading { promise: Promise<PDFTestDocument>; destroy(): Promise<void>; }
let factory: ((url: string) => PDFTestLoading) | undefined;
export function setPDFDocumentFactory(next?: (url: string) => PDFTestLoading): void { factory = next; }
export function getDocument(url: string): PDFTestLoading {
  if (factory) return factory(url);
  return { destroy: async () => {}, promise: Promise.resolve({ numPages: 3, destroy: async () => {}, getPage: async () => ({ getViewport: () => ({ width: 800, height: 600 }), render: () => ({ promise: Promise.resolve(), cancel() {} }) }) }) };
}
export default { GlobalWorkerOptions, version, getDocument };
