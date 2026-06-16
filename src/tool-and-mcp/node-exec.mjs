import {
  spawn
} from "node:child_process";

const command = "ls -al";

const cwd = process.cwd();

const [cmd, ...args] = command.split(" ");

const child = spawn(cmd, args, {
  cwd,
  stdio: "inherit",
  shell: true,
})

let errorOutput = "";

child.on("error", (err) => {
  errorOutput += `子进程发生错误: ${err.message}\n`;
});

child.on("close", (code) => {
  if (code === 0) {
    process.exit(0);
  } else {
    if (errorOutput) {
      console.error("错误输出:", errorOutput);
    }
    process.exit(code || 1);
  }
});