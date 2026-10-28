/** Frame-rate-independent spring helpers shared by visual primitives. */
export function stepSpring(
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  deltaSeconds: number
): { value: number; velocity: number } {
  const dt = Math.min(Math.max(deltaSeconds, 0), 0.1)
  if (dt === 0) return { value, velocity }

  // Substeps keep the semi-implicit integration stable after a slow frame.
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
  const step = dt / steps
  let nextValue = value
  let nextVelocity = velocity

  for (let i = 0; i < steps; i++) {
    const acceleration = (target - nextValue) * stiffness
    nextVelocity += acceleration * step
    nextVelocity *= Math.exp(-damping * step)
    nextValue += nextVelocity * step
  }

  return { value: nextValue, velocity: nextVelocity }
}
