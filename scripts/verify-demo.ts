import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const commands = ["npm run db:reset", "npm run test", "npm run test:e2e"];

for (const command of commands) {
  console.log(`\n> ${command}`);
  execSync(command, { cwd: process.cwd(), stdio: "inherit" });
}

const screenshotDir = path.resolve(process.cwd(), "artifacts/demo-verification");
const requiredScreenshots = ["reader-1440.png", "reader-834.png", "reader-390.png"];
for (const fileName of requiredScreenshots) {
  const filePath = path.join(screenshotDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing verification screenshot: ${filePath}`);
  }
}

console.log("\nDemo verification passed. Screenshots:");
for (const fileName of requiredScreenshots) {
  console.log(`- ${path.join(screenshotDir, fileName)}`);
}
