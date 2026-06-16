import {
  McpServer
} from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  StdioServerTransport
} from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  z
} from "zod"

// 数据库
const database = {
  users: {
    '001': {
      id: '001',
      name: '张三',
      email: 'zhangsan@example.com',
      role: 'admin'
    },
    '002': {
      id: '002',
      name: '李四',
      email: 'lisi@example.com',
      role: 'user'
    },
    '003': {
      id: '003',
      name: '王五',
      email: 'wangwu@example.com',
      role: 'user'
    },
  }
}

const server = new McpServer({
  name: "my-mcp-server",
  version: "1.0.0",
})

// 注册工具：查询用户信息
server.registerTool('query_user', {
  description: '查询数据库中的用户信息。输入用户ID，返回用户的详细信息（姓名、邮箱、角色）。',
  inputSchema: z.object({
    userId: z.string().describe('用户ID, 例如: "001", "002", "003"'),
  }),
}, async ({
  userId
}) => {
  const user = database.users[userId];

  if (!user) {
    return {
      content: [{
        type: 'text',
        text: `用户 ID ${userId} 不存在。可用的用户 ID 包括: ${Object.keys(database.users).join(', ')}`
      }]
    }
  }

  return {
    content: [{
      type: 'text',
      text: `用户信息:\nID: ${user.id}\n姓名: ${user.name}\n邮箱: ${user.email}\n角色: ${user.role}`,
    }]
  }
})

server.registerResource('使用指南', 'docs://guide', {
  description: 'MCP server 使用文档',
  mimeType: 'text/plain',
}, async () => {
  return {
    contents: [{
      uri: 'docs://guide',
      mimeType: 'text/plain',
      text: `MCP Server 使用指南：

功能：提供用户查询等工具。

使用：在 Cursor deng MCP client 中通过自然语言对话，Cursor 会自动调用相应的工具。`
    }]
  }
})

// 启动服务器
const transport = new StdioServerTransport()
await server.connect(transport)
console.log('MCP Server 已启动，等待客户端连接...')