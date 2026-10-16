export async function installMonacoEnvironment(): Promise<void> {
  const workerModule = await import('monaco-editor/esm/vs/editor/editor.worker?worker')
  const EditorWorker = workerModule.default
  const target = globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker }
  }
  target.MonacoEnvironment = {
    getWorker() {
      return new EditorWorker()
    },
  }
}
