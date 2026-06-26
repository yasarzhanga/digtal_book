import { z } from "zod";
import { acceleration, sampleMotion } from "@/content-engine/utils/simulation";

export const SimulationTemplateKeySchema = z.enum(["newton-cart", "projectile", "hooke", "friction"]);
export type SimulationTemplateKey = z.infer<typeof SimulationTemplateKeySchema>;

export const SimulationTemplateInputSchema = z.object({
  templateKey: SimulationTemplateKeySchema,
  values: z.record(z.string(), z.number())
});

export interface SimulationTemplateField {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface SimulationTemplate {
  key: SimulationTemplateKey;
  title: string;
  concept: string;
  fields: SimulationTemplateField[];
}

export interface SimulationTemplateResult {
  title: string;
  metrics: { label: string; value: number; unit: string }[];
  series: { label: string; x: number; y: number }[];
}

export const simulationTemplates: SimulationTemplate[] = [
  {
    key: "newton-cart",
    title: "F=ma 小车",
    concept: "合力、质量与加速度",
    fields: [
      { key: "force", label: "合力", unit: "N", min: 1, max: 20, step: 1, default: 8 },
      { key: "mass", label: "质量", unit: "kg", min: 0.5, max: 8, step: 0.5, default: 2 }
    ]
  },
  {
    key: "projectile",
    title: "抛体运动",
    concept: "速度分解与重力加速度",
    fields: [
      { key: "speed", label: "初速度", unit: "m/s", min: 2, max: 30, step: 1, default: 14 },
      { key: "angle", label: "发射角", unit: "deg", min: 10, max: 80, step: 1, default: 45 },
      { key: "gravity", label: "重力加速度", unit: "m/s²", min: 1, max: 12, step: 0.1, default: 9.8 }
    ]
  },
  {
    key: "hooke",
    title: "弹簧振子",
    concept: "胡克定律与简谐周期",
    fields: [
      { key: "springConstant", label: "劲度系数", unit: "N/m", min: 5, max: 120, step: 1, default: 40 },
      { key: "displacement", label: "形变量", unit: "m", min: 0.02, max: 0.5, step: 0.01, default: 0.16 },
      { key: "mass", label: "质量", unit: "kg", min: 0.1, max: 5, step: 0.1, default: 1 }
    ]
  },
  {
    key: "friction",
    title: "摩擦与净力",
    concept: "最大静摩擦、滑动摩擦与加速度",
    fields: [
      { key: "mass", label: "质量", unit: "kg", min: 0.5, max: 10, step: 0.5, default: 3 },
      { key: "coefficient", label: "摩擦因数", unit: "", min: 0.05, max: 0.9, step: 0.05, default: 0.25 },
      { key: "force", label: "外力", unit: "N", min: 0, max: 80, step: 1, default: 20 }
    ]
  }
];

export function getSimulationTemplate(key: SimulationTemplateKey): SimulationTemplate {
  const template = simulationTemplates.find((item) => item.key === key);
  if (!template) {
    throw new Error("SIMULATION_TEMPLATE_NOT_FOUND");
  }
  return template;
}

export function runSimulationTemplate(input: z.infer<typeof SimulationTemplateInputSchema>): SimulationTemplateResult {
  const parsed = SimulationTemplateInputSchema.parse(input);
  const template = getSimulationTemplate(parsed.templateKey);
  const values = withDefaults(template, parsed.values);
  if (parsed.templateKey === "newton-cart") {
    const force = positive(values.force, "force");
    const mass = positive(values.mass, "mass");
    const a = acceleration(force, mass);
    return {
      title: template.title,
      metrics: [
        { label: "加速度", value: round(a), unit: "m/s²" },
        { label: "4 秒位移", value: round(0.5 * a * 16), unit: "m" }
      ],
      series: sampleMotion(force, mass, 4, 0.5).map((sample) => ({ label: "位移", x: sample.time, y: sample.position }))
    };
  }
  if (parsed.templateKey === "projectile") {
    const speed = positive(values.speed, "speed");
    const angleRad = degreesToRadians(values.angle);
    const gravity = positive(values.gravity, "gravity");
    const vx = speed * Math.cos(angleRad);
    const vy = speed * Math.sin(angleRad);
    const timeOfFlight = (2 * vy) / gravity;
    const series = Array.from({ length: 9 }, (_, index) => {
      const t = (timeOfFlight / 8) * index;
      return { label: "轨迹", x: round(vx * t), y: round(Math.max(0, vy * t - 0.5 * gravity * t * t)) };
    });
    return {
      title: template.title,
      metrics: [
        { label: "飞行时间", value: round(timeOfFlight), unit: "s" },
        { label: "水平射程", value: round(vx * timeOfFlight), unit: "m" },
        { label: "最大高度", value: round((vy * vy) / (2 * gravity)), unit: "m" }
      ],
      series
    };
  }
  if (parsed.templateKey === "hooke") {
    const springConstant = positive(values.springConstant, "springConstant");
    const displacement = positive(values.displacement, "displacement");
    const mass = positive(values.mass, "mass");
    const force = springConstant * displacement;
    const period = 2 * Math.PI * Math.sqrt(mass / springConstant);
    return {
      title: template.title,
      metrics: [
        { label: "回复力", value: round(force), unit: "N" },
        { label: "最大加速度", value: round(force / mass), unit: "m/s²" },
        { label: "周期", value: round(period), unit: "s" }
      ],
      series: Array.from({ length: 13 }, (_, index) => {
        const phase = (Math.PI * 2 * index) / 12;
        return { label: "位移", x: round((period * index) / 12), y: round(displacement * Math.cos(phase)) };
      })
    };
  }
  const mass = positive(values.mass, "mass");
  const coefficient = positive(values.coefficient, "coefficient");
  const force = Math.max(0, values.force);
  const friction = coefficient * mass * 9.8;
  const netForce = Math.max(0, force - friction);
  const a = netForce / mass;
  return {
    title: template.title,
    metrics: [
      { label: "摩擦力", value: round(friction), unit: "N" },
      { label: "净力", value: round(netForce), unit: "N" },
      { label: "加速度", value: round(a), unit: "m/s²" }
    ],
    series: sampleMotion(netForce, mass, 4, 0.5).map((sample) => ({ label: "位移", x: sample.time, y: sample.position }))
  };
}

function withDefaults(template: SimulationTemplate, values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(template.fields.map((field) => [field.key, values[field.key] ?? field.default]));
}

function positive(value: number, label: string): number {
  if (value <= 0) {
    throw new Error(`INVALID_${label.toUpperCase()}`);
  }
  return value;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
