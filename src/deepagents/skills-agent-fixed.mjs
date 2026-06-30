import "dotenv/config";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import {
  ChatOpenAI
} from "@langchain/openai";
import {
  createAgent,
  HumanMessage
} from "langchain";
import {
  LocalShellBackend,
  createFilesystemMiddleware,
  createSkillsMiddleware,
} from "deepagents";

const skills = "/.agents/skills/";
const output = "src/deepagents/output/deepagents-skills-flow.excalidraw";

if (!existsSync(".agents/skills/excalidraw-diagram-generator/SKILL.md")) {
  throw new Error(
    "未找到 excalidraw-diagram-generator，请先: npx skills add github/awesome-copilot --skill excalidraw-diagram-generator -y"
  );
}

mkdirSync("src/deepagents/output", {
  recursive: true
});

const model = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
  temperature: 0,
  streaming: true,
});

const backend = await LocalShellBackend.create({
  rootDir: ".",
  virtualMode: true,
  inheritEnv: true,
});

const agent = createAgent({
  model,
  tools: [],
  systemPrompt: "按 skills 库完成任务，需要时 read_file 对应 SKILL.md。中文回答。写入 .excalidraw 后不要再 read_file 读取该文件，脚本会负责校验。",
  middleware: [
    createSkillsMiddleware({
      backend,
      sources: [skills]
    }),
    createFilesystemMiddleware({
      backend
    }),
  ],
});

const prompt = [
  "画一张流程图，描述本项目的 skills-agent 工作流：",
  "用户 Prompt → createAgent → createSkillsMiddleware → createFilesystemMiddleware → 模型回复。",
  `保存为 ${output}。要求：`,
  "- 顶部大标题 + 副标题",
  "- 每个主节点 numbered（①②…）且框内 2～3 行中文说明",
  "- 右侧一列「说明：…」补充细节",
  "- 箭头上标注阶段名（如 invoke、wrapModelCall）",
  "- 底部图例（颜色含义 + 如何运行 demo）",
].join("\n");

console.log("用户:", prompt);

function chunkText(chunk) {
  if (!chunk?.content) return "";
  if (typeof chunk.content === "string") return chunk.content;
  if (Array.isArray(chunk.content)) {
    return chunk.content
      .map((p) => (typeof p === "string" ? p : (p?.text ?? "")))
      .join("");
  }
  return "";
}

function seed() {
  return Math.floor(Math.random() * 1 _000_000_000);
}

function baseElement(id, type, x, y, width, height, style = {}) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: style.strokeColor ?? "#1e1e1e",
    backgroundColor: style.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: style.strokeWidth ?? 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: type === "rectangle" ? {
      type: 3
    } : null,
    seed: seed(),
    version: 1,
    versionNonce: seed(),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
}

function rect(id, x, y, width, height, backgroundColor, strokeColor = "#1e1e1e") {
  return baseElement(id, "rectangle", x, y, width, height, {
    backgroundColor,
    strokeColor
  });
}

function text(id, x, y, width, height, value, fontSize = 20, textAlign = "center") {
  return {
    ...baseElement(id, "text", x, y, width, height, {
      strokeColor: "#1e1e1e"
    }),
    text: value,
    fontSize,
    fontFamily: 5,
    textAlign,
    verticalAlign: "middle",
    containerId: null,
    originalText: value,
    lineHeight: 1.25,
    autoResize: false,
  };
}

function arrow(id, x, y, width, height, color = "#364fc7") {
  return {
    ...baseElement(id, "arrow", x, y, width, height, {
      strokeColor: color,
      strokeWidth: 3
    }),
    points: [
      [0, 0],
      [width, height]
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
  };
}

function validExcalidrawJson(filePath) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return parsed?.type === "excalidraw" && Array.isArray(parsed.elements);
  } catch {
    return false;
  }
}

function writeFallbackDiagram(filePath) {
  const nodes = [
    ["node-user", 60, 210, 210, 110, "#d0ebff", "① 用户 Prompt\n提出画图需求\n指定保存路径"],
    ["node-agent", 340, 210, 210, 110, "#d3f9d8", "② createAgent\n组装模型与中间件\n启动事件流"],
    ["node-skills", 620, 210, 240, 110, "#fff3bf", "③ Skills Middleware\n发现 SKILL.md\n注入技能说明"],
    ["node-fs", 940, 210, 240, 110, "#ffd8a8", "④ Filesystem Middleware\n提供读写文件工具\n落盘 .excalidraw"],
    ["node-model", 1260, 210, 210, 110, "#e5dbff", "⑤ 模型回复\n流式输出过程\n返回生成结果"],
  ];

  const elements = [
    text("title", 390, 40, 760, 48, "skills-agent 工作流", 36),
    text("subtitle", 350, 94, 840, 32, "Deep Agents 通过技能库与文件系统中间件生成 Excalidraw 图表", 20),
  ];

  for (const [id, x, y, width, height, color, label] of nodes) {
    elements.push(rect(`${id}-box`, x, y, width, height, color));
    elements.push(text(`${id}-text`, x + 14, y + 13, width - 28, height - 26, label, 19));
  }

  const arrows = [
    ["arrow-invoke", 278, 265, 54, 0, "invoke"],
    ["arrow-agent", 558, 265, 54, 0, "wrapModelCall"],
    ["arrow-skill", 868, 265, 64, 0, "tool routing"],
    ["arrow-fs", 1188, 265, 64, 0, "streamEvents"],
  ];

  for (const [id, x, y, width, height, label] of arrows) {
    elements.push(arrow(id, x, y, width, height));
    elements.push(text(`${id}-label`, x - 16, y - 34, width + 32, 26, label, 16));
  }

  const notes = [
    "说明：skills 路径指向 /.agents/skills/。",
    "说明：SKILL.md 约束输出必须是 Excalidraw JSON。",
    "说明：filesystem middleware 负责 read_file/write_file。",
    "说明：脚本最后会校验文件，避免乱码落盘。",
  ];

  elements.push(text("notes-title", 1040, 390, 360, 30, "说明", 24, "left"));
  notes.forEach((note, index) => {
    elements.push(rect(`note-${index}-box`, 1010, 435 + index * 58, 430, 42, "#f8f9fa", "#adb5bd"));
    elements.push(text(`note-${index}-text`, 1026, 443 + index * 58, 398, 26, note, 17, "left"));
  });

  elements.push(rect("legend-box", 80, 440, 780, 150, "#f8f9fa", "#868e96"));
  elements.push(text("legend-title", 105, 462, 120, 30, "图例", 24, "left"));
  elements.push(text("legend-text", 105, 505, 720, 62, "蓝色：用户输入  绿色：Agent 装配  黄色：技能解析  橙色：文件写入  紫色：模型响应\n运行 demo：node src/deepagents/skills-agent.mjs", 18, "left"));

  const diagram = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: 20
    },
    files: {}
  };

  writeFileSync(filePath, `${JSON.stringify(diagram, null, 2)}\n`, "utf8");
}

const stream = await agent.streamEvents({
  messages: [new HumanMessage(prompt)]
}, {
  recursionLimit: 100
});

let skillsMetadata;
console.log("\n--- 流式输出 ---\n");

try {
  for await (const event of stream) {
    if (event.event === "on_chat_model_stream") {
      const text = chunkText(event.data?.chunk);
      if (text) process.stdout.write(text);
    }
    if (event.event === "on_tool_start") {
      const name = event.name?.split("/").pop() ?? event.name;
      process.stdout.write(`\n\n→ ${name}\n\n`);
    }
    if (event.event === "on_chain_end" && event.data?.output?.skillsMetadata) {
      skillsMetadata = event.data.output.skillsMetadata;
    }
  }
} catch (e) {
  console.log("\n\n提示: 模型端生成未完成，将使用脚本本地校验/修复。", e.cause?.message ?? e.message);
}

console.log("\n");
console.log("skills:", skillsMetadata?.map((s) => s.name));
if (existsSync(output)) {
  if (!validExcalidrawJson(output)) {
    console.log("检测到生成文件不是有效 Excalidraw JSON，已重写为 UTF-8 JSON。 ");
    writeFallbackDiagram(output);
  }
  console.log("图表:", output);
  console.log("打开: https://excalidraw.com → Open → 选择该文件");
} else {
  writeFallbackDiagram(output);
  console.log("模型未生成文件，已写入本地 fallback 图表:", output);
}

await backend.close();