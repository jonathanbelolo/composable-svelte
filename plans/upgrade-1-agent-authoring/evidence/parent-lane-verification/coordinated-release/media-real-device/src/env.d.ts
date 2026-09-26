// Vite `?raw` imports: used only to read the installed packages' `version` fields.
declare module '*?raw' {
  const content: string;
  export default content;
}
