# MCP 接入说明（当前项目）

## 结论

- 通过 [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) 接入 MCP。
- 安装在主项目 `node_modules/pi-mcp-adapter`，由 `.pi/extensions/mcp-adapter.ts` 包装后被 SDK 自动发现。
- `session_start` 触发时后台异步连接 MCP 服务器。

## 配置文件

`.pi/mcp.json` — 项目级配置，自动被 `pi-mcp-adapter` 读取（优先级高于全局 `~/.pi/agent/mcp.json`）。

### stdio MCP 服务器示例（当前配置）

```json
{
  "mcpServers": {
    "shennong-claw-py": {
      "command": "/path/to/python",
      "args": ["-m", "shennong_claw_mcp.server"],
      "cwd": "/path/to/shennong-claw-mcp-py",
      "lifecycle": "keep-alive",
      "env": {
        "SHENNONG_TRANSPORT": "http",
        "SHENNONG_HTTP_BASE_URL": "https://...",
        "SHENNONG_HTTP_BACKEND": "sensor",
        "SHENNONG_API_TOKEN": "${SHENNONG_API_TOKEN}"
      }
    }
  }
}
```

`lifecycle: "keep-alive"` 启用自动重连。`${VAR}` 语法可从环境变量中读取值。

## 工具使用方式

`pi-mcp-adapter` 在 context 里只注册一个 `mcp` 工具（约 200 tokens），
LLM 按需两步发现并调用：

```
# 搜索工具
mcp({ search: "device" })

# 调用工具（args 为 JSON 字符串）
mcp({ tool: "shennong_get_device_info", args: '{"device_num": "xxx"}' })
```

其他模式：

| 用法 | 说明 |
|------|------|
| `mcp({ })` | 查看所有服务器状态 |
| `mcp({ describe: "tool_name" })` | 查看工具参数 schema |
| `mcp({ server: "shennong-claw-py" })` | 列出某服务器的所有工具 |

## 为何不单独注册每个工具

直接把几十个工具全注册到 context 会消耗大量 token。`pi-mcp-adapter`
用一个代理工具替代，LLM 按需搜索，不增加额外 context 开销。
