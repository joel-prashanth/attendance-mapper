import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, "../data/user-config.json");

export function configExists() {
  return fs.existsSync(CONFIG_PATH);
}

export function loadConfig() {
  if (!configExists()) {
    return null;
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");

  return JSON.parse(raw);
}

export function saveConfig(config) {
  const directory = path.dirname(CONFIG_PATH);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  return CONFIG_PATH;
}

export function getClassMapping(config, sectionCode) {
  return config?.classMappings?.[sectionCode] ?? null;
}
