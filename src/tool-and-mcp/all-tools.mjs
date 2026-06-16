import {
  tool
} from "@langchain/core/tools"
import fs from "node:fs/promises"
import path from "node:path"
import {
  spawn
} from "node:child_process"
import {
  z
} from 'zod'

const readFileTool = tool(
  async ({
    filePath
  }) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      console.log(`[工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字符`);
      return `文件内容：\n${content}`;
    } catch (error) {
      console.log(`[工具调用] read_file("${filePath}") - 错误: ${error.message}`);
      return `读取文件失败: ${error.message}`;
    }
  }, {
    name: "read_file",
    description: '读取指定路径的文件内容',
    schema: z.object({
      filePath: z.string().describe("要读取的文件路径"),
    })
  }
)

const writeFileTool = tool(
  async ({
    filePath,
    content
  }) => {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, {
        recursive: true
      });
      await fs.writeFile(filePath, content, "utf-8");
      console.log(`[工具调用] write_file("${filePath}", content) - 成功写入 ${content.length} 字符`);
      return `成功写入文件: ${filePath}`;
    } catch (error) {
      console.log(`[工具调用] write_file("${filePath}", content) - 错误: ${error.message}`);
      return `写入文件失败: ${error.message}`;
    }
  }, {
    name: "write_file",
    description: '将内容写入指定路径的文件',
    schema: z.object({
      filePath: z.string().describe("要写入的文件路径"),
      content: z.string().describe("要写入文件的内容"),
    })
  }
)

const executeCommandTool = tool(
  async ({
    command,
    workingDirectory
  }) => {
    const cwd = workingDirectory || process.cwd();
    console.log(`[工具调用] execute_command("${command}") ${workingDirectory ? `- 工作目录：${workingDirectory}` : ''}`)

    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(" ");

      const child = spawn(cmd, args, {
        cwd,
        stdio: 'inherit',
        shell: true,
      });

      let errorOutput = "";

      child.on("error", (err) => {
        errorOutput = err.message + "\n";
      });

      child.on("close", (code) => {
        if (code === 0) {
          console.log(`[工具调用] execute_command("${command}") - 命令执行成功`);
          const cwdInfo = workingDirectory ?
            `\n\n重要提示：命令在目录 ${workingDirectory} 中执行成功。如果需要在这个项目中继续执行命令，请使用 workingDirectory: "${workingDirectory}" 参数，不要使用cd命令。` :
            '';
          resolve(`命令执行成功！${command}${cwdInfo}`);
        } else {
          console.error(`[工具调用] execute_command("${command}") - 命令执行失败，错误输出: ${errorOutput}`);
          resolve(`命令执行失败，退出码：${code}${errorOutput ? '\n错误' + errorOutput : ''}`)
        }
      })
    })
  }, {
    name: "execute_command",
    description: '执行系统命令，支持指定工作目录，实时显示输出',
    schema: z.object({
      command: z.string().describe("要执行的命令"),
      workingDirectory: z.string().optional().describe("工作目录（推荐指定）"),
    })
  }
)

const listDirectoryTool = tool(
  async ({
    directoryPath
  }) => {
    try {
      const files = await fs.readdir(directoryPath)
      console.log(`[工具调用] list_directory("${directoryPath}") - 成功列出 ${files.length} 个文件/目录`);
      return `目录内容：\n${files.map(f => `- ${f}`).join("\n")}`;
    } catch (error) {
      console.log(`[工具调用] list_directory("${directoryPath}") - 错误: ${error.message}`);
      return `列出目录失败: ${error.message}`;
    }
  }, {
    name: "list_directory",
    description: '列出指定目录的内容',
    schema: z.object({
      directoryPath: z.string().describe("目录路径"),
    })
  }
);

export {
  readFileTool,
  writeFileTool,
  executeCommandTool,
  listDirectoryTool,
}