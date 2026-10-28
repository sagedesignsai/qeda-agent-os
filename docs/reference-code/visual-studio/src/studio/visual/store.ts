"use client"
import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import type { RFEdge, RFGraph, RFNode } from "./compile"
import type { FeatureArtifact } from "../analysis/format"
import type {
  FeatureName,
  NodeTransform,
  TimelineMarker,
  VisualEventSettings,
} from "./types"

type Viewport = { x: number; y: number; zoom: number }

type VisualEditorState = {
  // Project identity
  projectId: string | null
  title: string
  mediaId: string | null
  analysisId: string | null

  // React Flow graph
  graph: {
    nodes: RFNode[]
    edges: RFEdge[]
    viewport: Viewport
    markers: TimelineMarker[]
  }

  // Selection
  selection: { nodeId: string | null }

  // Playback transport
  transport: {
    playing: boolean
    time: number
    duration: number
    rate: number
    loop: boolean
  }

  // Analysis status
  analysisStatus: "idle" | "pending" | "ready" | "failed"
  analysisProgress: number // 0..100
  features: FeatureArtifact | null

  // Save state
  dirty: boolean
  graphVersion: number
  saving: boolean
  saveError: string | null

  // Actions
  init(project: {
    id: string
    title: string
    mediaId: string | null
    analysisId: string | null
    graph: {
      nodes: RFNode[]
      edges: RFEdge[]
      viewport: Viewport
      markers?: TimelineMarker[]
    }
    graphVersion: number
  }): void
  setTitle(title: string): void
  setMediaId(mediaId: string | null): void
  setAnalysisId(analysisId: string | null): void
  setNodes(nodes: RFNode[]): void
  setEdges(edges: RFEdge[]): void
  setViewport(viewport: Viewport): void
  selectNode(nodeId: string | null): void
  addNode(node: RFNode): void
  removeNode(nodeId: string): void
  addEdge(edge: RFEdge): void
  removeEdge(edgeId: string): void
  updateNodeParams(nodeId: string, params: Record<string, unknown>): void
  updateNodeBinding(
    nodeId: string,
    binding: { feature: FeatureName; gain: number; smoothing: number }
  ): void
  updateNodePalette(
    nodeId: string,
    palette: { color: string; emissive: string }
  ): void
  updateNodeTransform(nodeId: string, transform: NodeTransform): void
  updateNodeEvents(nodeId: string, events: VisualEventSettings): void
  addTimelineMarker(time: number): void
  removeTimelineMarker(markerId: string): void
  applyTemplate(graph: RFGraph): void
  replaceWithTemplate(graph: RFGraph): void
  setTransport(update: Partial<VisualEditorState["transport"]>): void
  setAnalysisStatus(
    status: VisualEditorState["analysisStatus"],
    progress?: number
  ): void
  setFeatures(features: FeatureArtifact): void
  setSaving(saving: boolean, error?: string | null): void
  setGraphVersion(version: number): void
  markDirty(): void
  markClean(): void
}

export const useVisualEditor = create<VisualEditorState>()(
  subscribeWithSelector((set, get) => ({
    // -----------------------------------------------------------------------
    // Initial state
    // -----------------------------------------------------------------------
    projectId: null,
    title: "Untitled Visual",
    mediaId: null,
    analysisId: null,

    graph: {
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      markers: [],
    },

    selection: { nodeId: null },

    transport: {
      playing: false,
      time: 0,
      duration: 0,
      rate: 1,
      loop: false,
    },

    analysisStatus: "idle",
    analysisProgress: 0,
    features: null,

    dirty: false,
    graphVersion: 0,
    saving: false,
    saveError: null,

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    init(project) {
      set({
        projectId: project.id,
        title: project.title,
        mediaId: project.mediaId,
        analysisId: project.analysisId,
        graph: {
          nodes: project.graph.nodes,
          edges: project.graph.edges,
          viewport: project.graph.viewport,
          markers: (project.graph.markers ?? []).filter(
            (marker) => Number.isFinite(marker.time) && marker.time >= 0
          ),
        },
        graphVersion: project.graphVersion,
        dirty: false,
        saving: false,
        saveError: null,
        selection: { nodeId: null },
        transport: {
          playing: false,
          time: 0,
          duration: 0,
          rate: 1,
          loop: false,
        },
        analysisStatus: "idle",
        analysisProgress: 0,
        features: null,
      })
    },

    setTitle(title) {
      set({ title, dirty: true })
    },

    setMediaId(mediaId) {
      // Changing the source is persisted immediately by the editor, so it does
      // not make the graph/title save state dirty on its own.
      set({ mediaId, analysisId: null, features: null, analysisStatus: "idle" })
    },

    setAnalysisId(analysisId) {
      set({ analysisId })
    },

    setNodes(nodes) {
      set((state) => ({ graph: { ...state.graph, nodes } }))
    },

    setEdges(edges) {
      set((state) => ({ graph: { ...state.graph, edges } }))
    },

    setViewport(viewport) {
      set((state) => ({ graph: { ...state.graph, viewport } }))
    },

    selectNode(nodeId) {
      set({ selection: { nodeId } })
    },

    addNode(node) {
      set((state) => ({
        graph: {
          ...state.graph,
          nodes: [...state.graph.nodes, node],
        },
        selection: { nodeId: node.id },
        dirty: true,
      }))
    },

    removeNode(nodeId) {
      set((state) => ({
        graph: {
          ...state.graph,
          nodes: state.graph.nodes.filter((node) => node.id !== nodeId),
          edges: state.graph.edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId
          ),
        },
        selection:
          state.selection.nodeId === nodeId
            ? { nodeId: null }
            : state.selection,
        dirty: true,
      }))
    },

    addEdge(edge) {
      set((state) => ({
        graph: { ...state.graph, edges: [...state.graph.edges, edge] },
        dirty: true,
      }))
    },

    removeEdge(edgeId) {
      set((state) => ({
        graph: {
          ...state.graph,
          edges: state.graph.edges.filter((edge) => edge.id !== edgeId),
        },
        dirty: true,
      }))
    },

    updateNodeParams(nodeId, params) {
      set((state) => ({
        graph: {
          ...state.graph,
          nodes: state.graph.nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: { ...n.data, params: { ...n.data.params, ...params } },
                }
              : n
          ),
        },
        dirty: true,
      }))
    },

    updateNodeBinding(nodeId, binding) {
      set((state) => ({
        graph: {
          ...state.graph,
          nodes: state.graph.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, binding } } : n
          ),
        },
        dirty: true,
      }))
    },

    updateNodePalette(nodeId, palette) {
      set((state) => ({
        graph: {
          ...state.graph,
          nodes: state.graph.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, palette } } : n
          ),
        },
        dirty: true,
      }))
    },

    updateNodeTransform(nodeId, transform) {
      set((state) => ({
        graph: {
          ...state.graph,
          nodes: state.graph.nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, transform } }
              : node
          ),
        },
        dirty: true,
      }))
    },

    updateNodeEvents(nodeId, events) {
      set((state) => ({
        graph: {
          ...state.graph,
          nodes: state.graph.nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, events } }
              : node
          ),
        },
        dirty: true,
      }))
    },

    addTimelineMarker(time) {
      if (!Number.isFinite(time)) return
      set((state) => ({
        graph: {
          ...state.graph,
          markers: [
            ...state.graph.markers,
            { id: crypto.randomUUID(), time: Math.max(0, time) },
          ].sort((a, b) => a.time - b.time),
        },
        dirty: true,
      }))
    },

    removeTimelineMarker(markerId) {
      set((state) => ({
        graph: {
          ...state.graph,
          markers: state.graph.markers.filter(
            (marker) => marker.id !== markerId
          ),
        },
        dirty: true,
      }))
    },

    applyTemplate(graph) {
      set((state) => {
        if (state.graph.nodes.length > 0) return state
        return {
          graph: {
            nodes: graph.nodes,
            edges: graph.edges,
            viewport: graph.viewport,
            markers: graph.markers ?? [],
          },
          selection: { nodeId: null },
          dirty: true,
        }
      })
    },

    replaceWithTemplate(graph) {
      set({
        graph: {
          nodes: graph.nodes,
          edges: graph.edges,
          viewport: graph.viewport,
          markers: graph.markers ?? [],
        },
        selection: { nodeId: null },
        dirty: true,
      })
    },

    setTransport(update) {
      set((state) => {
        const next = { ...state.transport, ...update }
        return {
          transport: {
            ...next,
            time: Number.isFinite(next.time) && next.time >= 0 ? next.time : 0,
            duration:
              Number.isFinite(next.duration) && next.duration > 0
                ? next.duration
                : 0,
            rate: Number.isFinite(next.rate) && next.rate > 0 ? next.rate : 1,
          },
        }
      })
    },

    setAnalysisStatus(status, progress) {
      set({
        analysisStatus: status,
        ...(progress !== undefined
          ? {
              analysisProgress: Number.isFinite(progress)
                ? Math.min(100, Math.max(0, progress))
                : 0,
            }
          : {}),
      })
    },

    setFeatures(features) {
      set({
        features: {
          ...features,
          beatTimes: Float32Array.from(
            Array.from(features.beatTimes).filter(
              (beat) => Number.isFinite(beat) && beat >= 0
            )
          ),
        },
        analysisStatus: "ready",
        analysisProgress: 100,
      })
    },

    setSaving(saving, error = null) {
      set({ saving, saveError: error ?? null })
    },

    setGraphVersion(version) {
      set({ graphVersion: version })
    },

    markDirty() {
      set({ dirty: true })
    },

    markClean() {
      set({ dirty: false })
    },
  }))
)
