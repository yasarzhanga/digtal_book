import { z } from "zod";

export const FormulaTemplateSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["mechanics", "energy", "wave", "electricity"]),
  title: z.string().min(1),
  latex: z.string().min(1),
  caption: z.string().min(1),
  parameters: z.array(z.string()).default([])
});

export type FormulaTemplate = z.infer<typeof FormulaTemplateSchema>;

export const formulaTemplates: FormulaTemplate[] = [
  {
    id: "newton-second-law",
    category: "mechanics",
    title: "牛顿第二定律",
    latex: "F=ma",
    caption: "合力等于质量与加速度的乘积。",
    parameters: ["F", "m", "a"]
  },
  {
    id: "kinetic-energy",
    category: "energy",
    title: "动能",
    latex: "E_k=\\frac{1}{2}mv^2",
    caption: "物体因运动具有的能量。",
    parameters: ["E_k", "m", "v"]
  },
  {
    id: "momentum",
    category: "mechanics",
    title: "动量",
    latex: "p=mv",
    caption: "动量等于质量与速度的乘积。",
    parameters: ["p", "m", "v"]
  },
  {
    id: "hooke-law",
    category: "mechanics",
    title: "胡克定律",
    latex: "F=-kx",
    caption: "弹性回复力与形变量成正比，方向相反。",
    parameters: ["F", "k", "x"]
  },
  {
    id: "projectile-range",
    category: "mechanics",
    title: "平抛水平位移",
    latex: "x=v_0t",
    caption: "忽略空气阻力时，水平方向匀速运动。",
    parameters: ["x", "v_0", "t"]
  },
  {
    id: "ohm-law",
    category: "electricity",
    title: "欧姆定律",
    latex: "U=IR",
    caption: "电压等于电流与电阻的乘积。",
    parameters: ["U", "I", "R"]
  },
  {
    id: "wave-speed",
    category: "wave",
    title: "波速公式",
    latex: "v=\\lambda f",
    caption: "波速等于波长与频率的乘积。",
    parameters: ["v", "\\lambda", "f"]
  },
  {
    id: "work",
    category: "energy",
    title: "恒力做功",
    latex: "W=Fs\\cos\\theta",
    caption: "力在位移方向上的分量与位移的乘积。",
    parameters: ["W", "F", "s", "\\theta"]
  }
];
