# docker compose up

docker compose up -d redis 的作用是：按 docker-compose.yml 中的配置启动名为 redis 的服务，并让它在后台运行。

常见配套命令：

- 查看状态：docker compose ps
- 看日志：docker compose logs -f redis
- 停止服务：docker compose stop redis
- 删除服务容器：docker compose rm -f redis
- 停止并清理：docker compose down

## 助手: **DeepAgents** 是 LangChain 团队最新推出的高级 Agent 框架，基于 LangGraph 构建。三者的关系可以这样理解：

**层级递进**
- **LangChain** → 底层组件库（模型调用、工具、提示等）
- **LangGraph** → 中间编排层（图、状态、循环、分支）
- **DeepAgents** → 上层开箱即用的 Agent（内置规划、反思、多步推理）

**DeepAgents 解决了什么**
LangGraph 虽然灵活，但写一个复杂 Agent 需要手动搭图、管状态、写循环逻辑，门槛高。DeepAgents 把这些**最佳实践打包成现成的 Agent**，核心特性：

- **深度规划**：自动拆解任务→执行→反思→调整，循环迭代
- **工具调用**：内置工具编排，自动决定何时调用、如何组合
- **长期记忆**：持久化上下文，跨会话保持状态
- **子Agent委派**：复杂任务自动分发到子Agent

**一句话总结**
如果 LangChain 是零件，LangGraph 是图纸+工具，那 **DeepAgents 就是成品机**——直接拿来用，不用自己搭。

目前 DeepAgents 还比较新，但方向很明确：让开发者从"写编排逻辑"变成"定义 Agent 目标和工具"。