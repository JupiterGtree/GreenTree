import * as fs from "node:fs";
import * as path from "node:path";

async function main() {
  const folders = [
    "D:\\Projects\\GTT",
    "D:\\Projects\\Green Tree",
    "D:\\Projects\\GTT-New-Ui",
    "D:\\Projects\\GTT-New-Ui\\green-tree-next-concept"
  ];

  for (const folder of folders) {
    console.log(`\nListing all files (including hidden) in: ${folder}`);
    try {
      if (!fs.existsSync(folder)) {
        console.log("  Folder does not exist.");
        continue;
      }
      const files = fs.readdirSync(folder);
      for (const file of files) {
        const fullPath = path.join(folder, file);
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          console.log(`  - File: ${file} (${stats.size} bytes)`);
        } else {
          console.log(`  - Dir:  ${file}`);
        }
      }
    } catch (err: any) {
      console.log(`  Error: ${err.message}`);
    }
  }
}

main().catch(console.error);
