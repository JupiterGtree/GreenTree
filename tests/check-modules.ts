import * as fs from "node:fs";

try {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  console.log("Dependencies:", pkg.dependencies);
  console.log("DevDependencies:", pkg.devDependencies);
} catch (err: any) {
  console.error(err);
}
