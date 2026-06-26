export interface SimulationSample {
  time: number;
  velocity: number;
  position: number;
}

export function acceleration(force: number, mass: number): number {
  if (mass <= 0) {
    throw new Error("mass must be positive");
  }
  return force / mass;
}

export function sampleMotion(force: number, mass: number, durationSeconds: number, stepSeconds: number): SimulationSample[] {
  const a = acceleration(force, mass);
  const samples: SimulationSample[] = [];
  for (let t = 0; t <= durationSeconds + 0.00001; t += stepSeconds) {
    const rounded = Math.round(t * 100) / 100;
    samples.push({
      time: rounded,
      velocity: Math.round(a * rounded * 1000) / 1000,
      position: Math.round(0.5 * a * rounded * rounded * 1000) / 1000
    });
  }
  return samples;
}
