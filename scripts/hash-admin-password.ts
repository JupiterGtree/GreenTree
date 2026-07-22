import { emitKeypressEvents } from "node:readline";
import { hashAdminPassword } from "../src/lib/admin/security";

async function main(): Promise<void> {
  const password = process.stdin.isTTY
    ? await readHiddenPassword("Password: ")
    : (await readStandardInput()).replace(/\r?\n$/, "");

  if (!password) throw new Error("Password cannot be empty.");

  if (process.stdin.isTTY) {
    const confirmation = await readHiddenPassword("Confirm password: ");
    if (password !== confirmation) throw new Error("Passwords do not match.");
  }

  process.stdout.write(`${hashAdminPassword(password)}\n`);
}

function readHiddenPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    emitKeypressEvents(input);
    input.setRawMode?.(true);
    input.resume();
    process.stderr.write(prompt);

    let value = "";
    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        process.stderr.write("\n");
        resolve(value);
        return;
      }
      if (key.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }
      if (character && !key.ctrl) value += character;
    };
    const cleanup = () => {
      input.off("keypress", onKeypress);
      input.setRawMode?.(false);
      input.pause();
    };
    input.on("keypress", onKeypress);
  });
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unable to hash password."}\n`);
  process.exitCode = 1;
});
