declare module '*?url' {
  const url: string
  export default url
}

declare module '@tanstack/react-start/config' {
  export function defineConfig(config: Record<string, unknown>): Record<string, unknown>
}
