import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";
import {
  ChatOpenAI
} from "@langchain/openai";
import {
  createAgent,
  HumanMessage
} from "langchain";
import {
  createFilesystemMiddleware,
  FilesystemBackend
} from "deepagents";

const workspaceDir = path.join(
  path.dirname(fileURLToPath(
    import.meta.url)),
  "workspace"
);

/** 先匹配先生效；未命中任何规则则默认允许 */
const permissions = [{
    operations: ["read"],
    paths: ["/secret.txt"],
    mode: "deny"
  },
  {
    operations: ["write"],
    paths: ["/todo.md"],
    mode: "allow"
  },
  {
    operations: ["write"],
    paths: ["/**"],
    mode: "deny"
  },
];

fs.rmSync(workspaceDir, {
  recursive: true,
  force: true
});
fs.mkdirSync(workspaceDir);
fs.writeFileSync(path.join(workspaceDir, "secret.txt"), "机密：不得读取", "utf8");

const model = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
  temperature: 0,
});

const agent = createAgent({
  model,
  tools: [],
  systemPrompt: "工作区根路径为 /。用 ls、read_file、write_file、edit_file 操作文件，路径以 / 开头。中文回答。",
  middleware: [
    createFilesystemMiddleware({
      backend: new FilesystemBackend({
        rootDir: workspaceDir,
        virtualMode: true
      }),
      permissions,
    }),
  ],
});

console.log("工作区:", workspaceDir);
console.log("权限:", JSON.stringify(permissions, null, 2));

async function run(label, prompt) {
  console.log(`\n=== ${label} ===\n`, prompt, "\n");
  const {
    messages
  } = await agent.invoke({
    messages: [new HumanMessage(prompt)]
  }, {
    recursionLimit: 20
  });
  for (const m of messages) {
    for (const t of m.tool_calls ?? []) console.log("→", t.name);
  }
  console.log("回复:", messages.at(-1)?.content);
}

async function expectDenied(label, prompt) {
  console.log(`\n=== ${label}（预期拒绝）===\n`, prompt, "\n");
  try {
    await agent.invoke({
      messages: [new HumanMessage(prompt)]
    }, {
      recursionLimit: 5
    });
    console.log("未触发拒绝（异常）");
  } catch (e) {
    const msg = e.cause?.message ?? e.message;
    console.log("✗", msg);
  }
}

await run(
  "允许的操作",
  "write_file 创建 /todo.md（三条待办），edit_file 把第一条标为完成，ls /，一句话总结。"
);

await expectDenied("禁止读", "只调用 read_file，路径 /secret.txt。");
await expectDenied("禁止写", "只调用 write_file，路径 /hack.txt，内容 test。");

// 工作区: /Users/chanweiyan/workspace/noder/ai-agent/tool_test/src/deepagents/workspace
// 权限: [
//   {
//     "operations": [
//       "read"
//     ],
//     "paths": [
//       "/secret.txt"
//     ],
//     "mode": "deny"
//   },
//   {
//     "operations": [
//       "write"
//     ],
//     "paths": [
//       "/todo.md"
//     ],
//     "mode": "allow"
//   },
//   {
//     "operations": [
//       "write"
//     ],
//     "paths": [
//       "/**"
//     ],
//     "mode": "deny"
//   }
// ]

// === 允许的操作 ===
//  write_file 创建 /todo.md（三条待办），edit_file 把第一条标为完成，ls /，一句话总结。

// → write_file
// → edit_file
// → ls
// 回复: 总结：创建了 `/todo.md` 包含三条待办事项，已将"完成项目报告"标为已完成 `[x]`，根目录下目前仅有该文件。

// === 禁止读（预期拒绝）===
//  只调用 read_file，路径 /secret.txt。

// ✗ Error: permission denied for read on /secret.txt

// === 禁止写（预期拒绝）===
//  只调用 write_file，路径 /hack.txt，内容 test。

// ✗ Error: permission denied for write on /hack.txt