import type { MainToWorker, WorkerToMain } from "./types"

export class RenderWorkerClient {
  private worker: Worker

  constructor() {
    this.worker = new Worker(
      new URL("./worker/entry.ts", import.meta.url),
      { type: "module" }
    )
  }

  send(msg: MainToWorker, transfer?: Transferable[]): void {
    this.worker.postMessage(msg, transfer ?? [])
  }

  onMessage(handler: (msg: WorkerToMain) => void): () => void {
    const listener = (e: MessageEvent) => handler(e.data as WorkerToMain)
    this.worker.addEventListener("message", listener)
    return () => this.worker.removeEventListener("message", listener)
  }

  onError(handler: (e: ErrorEvent) => void): () => void {
    this.worker.addEventListener("error", handler)
    return () => this.worker.removeEventListener("error", handler)
  }

  terminate(): void {
    this.worker.terminate()
  }
}
