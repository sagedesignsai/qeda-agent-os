import type { FeatureStore } from "./sampling"
import { sampleAt } from "./sampling"
import type { TimelineMarker, VisualEventSettings } from "./types"

export type ActiveVisualEvent = {
  action: VisualEventSettings["action"]
  intensity: number
}

function lastBeatAtOrBefore(beatTimes: Float32Array, time: number) {
  let low = 0
  let high = beatTimes.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (beatTimes[mid] <= time) {
      found = mid
      low = mid + 1
    } else high = mid - 1
  }
  return found >= 0 ? beatTimes[found] : null
}

function lastFeatureCrossing(
  store: FeatureStore,
  feature: string,
  threshold: number,
  time: number,
  lookbackSeconds: number
) {
  const lastFrame = Math.min(
    store.frameCount - 1,
    Math.floor(Math.max(0, time) * store.frameRate)
  )
  const firstFrame = Math.max(
    1,
    Math.floor(Math.max(0, time - lookbackSeconds) * store.frameRate)
  )

  for (let frame = lastFrame; frame >= firstFrame; frame--) {
    const current = sampleAt(store, frame / store.frameRate)[
      feature as keyof ReturnType<typeof sampleAt>
    ]
    const previous = sampleAt(store, (frame - 1) / store.frameRate)[
      feature as keyof ReturnType<typeof sampleAt>
    ]
    if (current >= threshold && previous < threshold) {
      return frame / store.frameRate
    }
  }
  return null
}

export function evaluateVisualEvent(
  settings: VisualEventSettings | undefined,
  store: FeatureStore | null,
  time: number,
  markers: TimelineMarker[]
): ActiveVisualEvent | null {
  if (!settings) return null

  const decay = Math.max(0.05, settings.decaySeconds)
  const eventTimes: number[] = []

  if (store && settings.beat) {
    const beat = lastBeatAtOrBefore(store.beatTimes, time)
    if (beat !== null) eventTimes.push(beat)
  }

  if (store && settings.onset) {
    const onset = lastFeatureCrossing(store, "onset", 0.65, time, decay)
    if (onset !== null) eventTimes.push(onset)
  }

  if (store && settings.thresholdEnabled) {
    const crossing = lastFeatureCrossing(
      store,
      settings.thresholdFeature,
      settings.threshold,
      time,
      decay
    )
    if (crossing !== null) eventTimes.push(crossing)
  }

  if (settings.timelineMarker) {
    let latest: number | null = null
    for (const marker of markers) {
      if (marker.time <= time && (latest === null || marker.time > latest)) {
        latest = marker.time
      }
    }
    if (latest !== null) eventTimes.push(latest)
  }

  let intensity = 0
  for (const eventTime of eventTimes) {
    const age = time - eventTime
    if (age < 0 || age > decay) continue
    intensity = Math.max(
      intensity,
      settings.strength * Math.exp((-4 * age) / decay)
    )
  }

  return intensity > 0 ? { action: settings.action, intensity } : null
}
