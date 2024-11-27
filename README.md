# Bilibili 弹幕筛选器 (bilibili-danmaku-filter)

一个智能的B站直播弹幕筛选工具，支持多维度权重分析和实时过滤。基于权重系统，帮助主播和管理员更好地处理直播间弹幕，提高互动质量。

## 项目背景

在B站直播间中，当观众人数较多时，弹幕速度往往会非常快。这给主播和管理员带来了很大的压力，难以及时发现和回应重要的消息。本项目通过智能权重系统和多维度筛选，帮助识别和突出显示重要的弹幕消息。

## 功能特点

### 智能权重计算
- 用户等级权重（最高40分）
- 管理员权重（+50分）
- 舰长权重（+30分）
- 粉丝勋章等级权重（最高30分）
- VIP权重（普通+10分，年费+20分）

### 多维度筛选
- 最低权重筛选：过滤低价值消息
- 同屏密度控制：避免信息过载
- 关键词屏蔽：过滤无关内容
- 用户屏蔽：处理问题用户
- 正则表达式过滤：高级过滤规则
- 去重功能：减少重复信息

### 实时处理
- 实时弹幕获取和显示
- 即时权重计算
- 动态筛选规则调整
- 自动重连机制

## 快速开始

### 环境要求
- Node.js >= 16
- npm >= 8

### 安装

```bash
# 克隆项目
git clone https://github.com/ai-dengwsh/bilibilt-danmaku-filter-demo.git

# 进入项目目录
cd bilibilt-danmaku-filter-demo

# 安装依赖
npm install

# 启动后端服务器
npm run server

# 启动前端开发服务器
npm run dev
```

### 使用方法

1. 访问 http://localhost:5173
2. 输入B站直播间ID或直接粘贴直播间链接
3. 点击"连接直播间"
4. 调整筛选参数：
   - 最低权重：建议从10开始调整
   - 同屏密度：控制每秒最大显示弹幕数
   - 关键词屏蔽：添加需要过滤的关键词
   - 用户屏蔽：添加需要屏蔽的用户
   - 正则表达式：添加高级过滤规则

## 技术实现

### 前端技术栈
- Vue 3：用户界面开发
- Vite：开发和构建工具
- WebSocket：实时通信

### 后端技术栈
- Node.js：运行环境
- Express：Web服务器
- WebSocket：实时消息推送
- linq.js：数据处理

### 项目结构
```
bilibili-danmaku-filter/
├── src/                # 前端源代码
│   ├── App.vue        # 主组件
│   └── main.js        # 入口文件
├── server.js          # 后端服务器
├── package.json       # 项目配置
└── README.md         # 项目文档
```

## 开发

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 贡献指南

欢迎提交问题和功能需求！如果您想贡献代码：

1. Fork 本仓库
2. 创建您的特性分支 (git checkout -b feature/AmazingFeature)
3. 提交您的更改 (git commit -m 'Add some AmazingFeature')
4. 推送到分支 (git push origin feature/AmazingFeature)
5. 打开一个 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 作者

**ai-dengwsh** - [GitHub](https://github.com/ai-dengwsh)

## 致谢

- 感谢 B站 提供的 API 支持
- 感谢所有贡献者的支持
