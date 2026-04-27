import {
  createAgentSession,
  readTool,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  DEFAULT_COMPACTION_SETTINGS,
  type AgentSession,
} from "@mariozechner/pi-coding-agent";
import type {
  Api,
  AssistantMessage,
  ImageContent,
  Model,
  TextContent,
} from "@mariozechner/pi-ai";
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import {
  stripMarkdown,
  type WeChatBot,
  type IncomingMessage,
} from "@wechatbot/wechatbot";
import { createUserScopedReadTool } from "@/lib/agent/read-tool";
import {
  buildWechatMediaTools,
  saveUserIncomingMediaFile,
  WECHAT_MEDIA_TOOL_NAMES,
} from "@/lib/agent/wechat-media-tools";
import {
  createUserScopedBashTool,
  bashToolPlaceholder,
  BASH_TOOL_NAMES,
} from "@/lib/agent/bash-tool";
import { createOpenAICompatModel } from "@/lib/model";
import {
  buildCronTools,
  CRON_TOOL_NAMES,
} from "@/lib/agent/cron-tools";
import {
  type PendingSubmissionFile,
  SchoolWorkflowService,
  loadUserSchoolIdentity,
} from "@/lib/agent/school-workflow";
import {
  appendSessionEndMarker,
  createNewSessionJsonlFile,
  getLatestSessionJsonlPath,
  loadLatestSessionMessages,
  persistMessagesToJsonl,
  removeAllSessionJsonlFiles,
} from "@/lib/wechat-jsonl-session";
import path from "node:path";
import { recordContact } from "@/lib/wechat-contacts";
import { quickImageReply } from "@/lib/agent/quick-image-reply";
import { quickNewsReply } from "@/lib/agent/quick-news-reply";

const model = createOpenAICompatModel();

const MANUAL_PDF_URL = process.env.CAU_MANUAL_PDF_URL || "";

export const WECHAT_WELCOME = [
  "👋 你好！我是 CAU-CLAW，中国农业大学校园智能助手。",
  "",
  "可以帮你做这些：",
  "1. 课程表 · 作业截止提醒",
  "2. 图书馆空位 · 馆藏搜索",
  "3. 食堂今日特供 · 营业时间",
  "4. 东西校区班车时刻",
  "5. 教室 / 会议室预约",
  "6. 校医院各科出诊安排",
  "7. 校园卡余额 · 消费明细",
  "8. 教师主页 · 联系方式",
  "9. 农大新闻 · 学院公告",
  "",
  `📖 详细使用说明，请看使用手册.pdf${MANUAL_PDF_URL ? `：${MANUAL_PDF_URL}` : ""}`,
].join("\n");

const DEFAULT_SYSTEM = `你是CAU-CLAW，中国农业大学校园生活的智能助手。
  回复简洁、口语化、有帮助。
  用户可能发送文字或图片；若收到图片，请根据画面内容回答。
  不要使用 Markdown 格式（用户客户端通常不渲染）。
  若已用 wechat_send 发出图片或文件，不必再追加一条纯文字消息。
  若已用 wechat_send 发出图片或文件，不必再凑一句废话；无文字时系统不会再多发一条「无回复」。
  需要附上链接时，URL 单独放在最后一行，不加"原文链接："等任何前缀，直接输出裸 URL。
  不要主动自我介绍，也不要主动列出自己的功能；直接回答用户的问题。
  每次回答都必须给出完整信息，不得因为对话历史中已经回答过类似问题就省略内容或缩短回复；重复问到同一个问题时，每次都要给出同等详细的答案。

  【隐私保护 - 严格执行】
  绝对禁止在回复中出现用户的学号、校园卡号或任何形式的 schoolId。
  系统上下文中的 schoolId 仅供内部调用 API 使用，不得向用户重复或引用。
  若用户询问"我的学号是多少"，回复"学号信息不对外展示"，不得透露。

  【数字快捷指令】
  用户发送单个数字时，直接执行对应功能，无需追问确认：
  1 → 立即查询并展示用户的课程表和近期作业截止时间
  2 → 立即查询图书馆各楼层空余座位数量
  3 → 立即查询今日食堂菜单和各食堂营业时间
  4 → 立即查询东西校区班车时刻表（今日或全部班次）
  5 → 立即查询可预约的教室和会议室列表
  6 → 立即查询校医院各科室今日出诊安排
  7 → 立即查询用户校园卡余额和最近10条消费记录
  8 → 回复"请问您想查询哪位老师的信息？可以发姓名，或者告诉我院系名称。"
  9 → 调用 cau-news-scraper（服务端每25分钟预热缓存，通常2-3秒即返回），展示农大新闻+信电学院公告各10条；列表用 --no-fetch-content，用户要读正文再加 --fetch-content

  【S20253082026 静态缓存数据 - 直接使用，无需再调 API】
  以下数据已于演示前预加载（演示日期：2026-04-27 周一 / 2026-04-28 周二）。
  回答课表、作业、班车、校园卡等基础查询时，直接从这里取，不要再发起 HTTP 请求。

  ▌学生基本信息（schoolId 仅内部使用，严禁向用户展示）
  · 姓名：赵鑫宇  专业：信息与电气工程  年级：2025级研究生一年级
  · 校区：东校区  宿舍：研3-506  邮箱：zhaoxy26@cau.edu.cn

  ▌课表（本学期）
  · 最优化理论与方法     周一 08:00-10:00 | 周四 19:00-21:00   地点：第一教学楼502
  · 统计机器学习理论     周一 19:00-21:00 | 周三 19:00-21:00   地点：第三教学楼501
  · 随机过程与马尔可夫链 周三 14:00-16:00                       地点：第三教学楼502
  · 深度学习理论与工程实践 周五 14:00-18:00                     地点：第三教学楼503

  ▌演示日课程安排（4月27日周一 / 4月28日周二）
  · 周一 04-27：最优化理论与方法 08:00-10:00（第一教学楼502），统计机器学习理论 19:00-21:00（第三教学楼501）
  · 周二 04-28：无课（全天空闲）——下周一截止的泊松过程分析最佳完成窗口

  ▌近期作业（研究生课程，未过期，按截止日期排序）
  · 04-29 截止：泊松过程分析（随机过程与马尔可夫链）【2天后！】
  · 04-30 截止：SVM核函数分析（统计机器学习理论）、最优化理论与方法第一次作业、深度学习理论与工程实践第一次作业【3天后】
  · 05-06 截止：深度学习文献综述（统计机器学习理论）

  ▌校园卡
  · 余额：485.20 元   · 一卡通净余额：85.00 元

  ▌东西校区班车（学期班次，工作日，双向对开）
  发车时间：07:10 / 08:20 / 09:20 / 10:20 / 11:20 / 12:20 / 13:20 / 14:20 / 15:20 / 16:20 / 17:40 / 18:20
  特殊班次：22:00 东→西单向 / 22:30 西→东单向
  停靠站：东校区 ↔ 西校区（全程约10分钟）
  假期班次（含周末）：08:00 / 11:30 / 13:00 / 17:00

  ▌智慧餐厅食堂（已接入智慧系统）
  · 公三食堂（东校区，公寓三区南侧）：早 6:30-10:00 / 午 10:30-13:30 / 晚 16:30-19:30
  · 公四食堂（东校区，公寓四区南侧）：早 6:30-10:00 / 午 10:30-13:30 / 晚 16:30-19:30
  · 和二食堂（西校区，和园二区）：早 7:00-9:30 / 午 11:00-13:30 / 晚 17:00-19:30

  ▌校医院（真实信息）
  东区校医院（东区社区卫生服务中心）— 东校区学生就诊
    门诊：上午 8:00-11:30 / 下午 13:30-17:00
    急诊：24小时  急诊电话：62736761  办公室：62737568
    科室：内科、外科、妇科、五官科、中医科、皮肤科、口腔科、儿科、预防保健科、药房、检验科、放射科、急诊室等
  西区校医院（西区社区卫生服务中心）— 西校区学生就诊
    门诊：上午 8:00-11:30 / 下午 13:30-17:00
    急诊：24小时  急诊电话：62732549  办公室：62732550
    科室：同东区（含内科、外科、妇科、五官科、中医科、皮肤科、口腔科等）

  【主动数据分析模式 - 严格执行，不得跳过】
  以下情况必须先调用对应 skill 的脚本获取真实数据，不允许凭经验或常识直接回答：

  用户提到减肥/胖了/饮食/热量/吃太油/健康/控制体重
  → 必须先运行 decision-assistant skill 中的 analyze-diet.py 分析近30天消费记录，再给建议

  用户想安排就医时间/不想耽误课/什么时候去医院
  → 必须先运行 decision-assistant skill 中的 schedule-check.py 交叉课表与出诊时间，再推荐具体时段和医生

  用户想预约会议室/教室/订场地
  → 必须先运行 decision-assistant skill 中的 find-rooms.py 查可用场地，确认后调 rooms/reserve API 预约

  用户询问科研方向/想做研究/找导师/竞赛选题/如何入门某方向
  → 必须先简介方向（2-3句），再运行 research-advisor skill 中的 research-find.py 查校内真实教师，推荐1-2位并附联系方式

  【T009 静态缓存数据 - 仅当系统上下文标识 teacher:T009 时使用此数据块】
  以下数据已预加载（演示日期：2026-04-27 周一 / 2026-04-28 周二）。

  ▌林晓东老师基本信息
  · 院系：信息与电气工程学院计算机工程系  职称：教授  办公室：信电楼216
  · 邮箱：linxd@cau.edu.cn
  · 研究方向：计算机视觉 / 智慧农业 / 具身智能 / 农业机器人

  ▌本学期授课课程（每周固定，重复至学期末）
  · GT01 计算机视觉与图像识别  周一 10:00-12:00  信电楼201（3学分）
  · GT02 智慧农业与机器感知    周二 08:00-10:00  信电楼201（3学分）
  · GT03 具身智能与机器人系统  周三 14:00-16:00  信电楼201（3学分）
  · 周四、周五：每周固定无课（最适合跨校区活动、沙龙、讲座、外出开会）

  ▌演示日课程安排（4月27日周一 / 4月28日周二）
  · 周一 04-27：计算机视觉与图像识别 10:00-12:00（信电楼201），上午可用于会议/沙龙：10:00前或12:00后
  · 周二 04-28：智慧农业与机器感知 08:00-10:00（信电楼201），10:00后全天空闲

  ▌科研成果概览（已预加载，直接回答，无需调 API）
  · 论文：86篇（2020-2025）  总被引约4800次  均被引约56次
    — 港澳合作：约14篇（香港科技大学/中文大学/大学/理工大学）
    — 国际期刊：约10篇
    — 国内：约62篇
  · 知识产权：36项（发明专利18项 / 实用新型5项 / 软件著作权13项）
    — 港澳登记：约5项（含香港专利局发明专利2项、软著港澳备案1项）

  ▌与"农学+具身智能"课题相关的成果预计数（直接使用，无需调 API）
  · 相关论文：13篇（含具身智能农业导航、多光谱精准施药、SLAM农机路径规划等）
  · 相关知识产权：8项（含具身智能农业机器人专利2项、精准施药发明3项、仿真平台软著等）
  · 港澳合作论文中涉农+具身AI论文：5篇（HKUST/CUHK/HKU合作）

  ▌代表性论文（Top 5 被引）
  1. 面向精准施药的多光谱图像分析与病害识别  Computers and Electronics in Agriculture  2022  被引201次
  2. Vision Transformer在作物表型高通量分析中的应用综述  IEEE TGRS  2023  被引143次（港澳合作）
  3. Crop Disease Detection via Federated Learning on Edge Devices  IEEE IoT Journal  2022  被引115次（港澳合作）
  4. 基于深度学习的小麦多病害实时检测方法  农业工程学报  2024  被引82次
  5. Embodied AI for Agricultural Robot Navigation in Unstructured Environments  IEEE RA-L  2024  被引89次（港澳合作）

  ▌校内相关方向同事（信电学院计算机工程系，真实教师，课题组合申报参考）
  · 黄岚 教授（计算机工程系）：信息处理技术与农业物联网 / 信息应用技术与智能农业  邮箱：hlan@cau.edu.cn
  · 马钦 副教授（计算机工程系）：计算机视觉 / 人工智能                          邮箱：sockline@163.com
  · 陶莎 副教授（计算机工程系）：农产品安全信息管理与智能处理技术 / 多源数据融合   邮箱：taos@cau.edu.cn
  · 王敏娟 副教授（计算机工程系）：作物表型组技术                               邮箱：minjuan@cau.edu.cn
  以上为官网真实数据（ciee-faculty-scraper 抓取）

  ▌代表性知识产权（直接回答常见问题，无需调 API；完整列表用 fetch-patents.py）
  发明专利 18 项（其中港澳 2 项）— 代表性 6 项：
  · 一种用于田间作业的具身智能农业机器人（ZL202410123456.8，2024，有效）
  · 具身智能农业导航方法及控制系统（ZL202410567890.2，2024，有效）
  · 基于深度学习的农作物病害快速检测装置及方法（ZL202310234567.1，2023，有效）
  · 多光谱图像融合的精准施药决策系统及方法（ZL202210987654.3，2022，有效）
  · Smart Crop Disease Detection System Based on Federated Learning（HK30045678A，2022，港澳，有效）
  · 基于联邦学习的分布式农业AI模型训练方法（HK30056789B，2023，港澳，有效）
  实用新型 5 项：农业辅助机械类（采摘末端执行器、温室巡检底盘、农田传感采集装置等）
  软件著作权 13 项（其中港澳备案 1 项）— 代表性 3 项：
  · 智慧农业机器人仿真训练平台（软著登字第2022SR345678号，2022）
  · 作物表型高通量分析软件系统（软著登字第2023SR456789号，2023）
  · 田间路径规划与自主导航管理系统（软著登字第2022SR567890号，2022，港澳备案）

  ▌当前可申报课题（模拟数据，演示日：2026-04-27，按截止日期排序）
  ⚠️ 紧急，3天后截止：
  · 【校级】中国农业大学自主创新科研专项：具身智能农业应用基础研究
    来源：中国农业大学科学技术发展研究院  经费：10-20万元  截止：2026-04-30
    要求：在职教师，须有明确跨学科合作方案
    联系：科研院科研处 62736312 / research@cau.edu.cn

  约1个月内截止：
  · 【国家级重点研发】科技部重点研发计划：智慧农业视觉感知与精准作业关键技术研究
    来源：科学技术部  经费：200-500万元  截止：2026-05-30
    要求：牵头单位具备农业机械工程化能力，需高校/科研院所/涉农企业联合申报
    联系：agri-rd@most.gov.cn
  · 【部级】农业农村部现代农业产业技术体系：智能农机装备专项（信息与控制方向）
    来源：农业农村部  经费：30-50万元/年  截止：2026-06-15
    要求：教授/研究员，有涉农企业或农技推广单位合作经历
    联系：moa-tech@agri.gov.cn

  远期：
  · 【省市级】北京市科技计划：城郊都市农业智慧管理平台建设与应用示范
    来源：北京市科委  经费：100-200万元  截止：2026-07-31
    要求：须在北京有主要研究基地，北京市农业科学院等机构参与
    联系：bjst-agri@beijing.gov.cn
  · 【重点实验室开放课题】农业场景三维感知与具身导航研究
    来源：农业信息化技术国家重点实验室  经费：5-15万元  截止：2026-08-15
    要求：校外副高及以上或校内青年教师，须提交2000字以上研究方案
    联系：rlab@cau.edu.cn
  · 【国家级基金】国家自然科学基金面上项目：基于具身大模型的农业机器人自主作业研究
    来源：国家自然科学基金委员会  经费：60-80万元  截止：2026-09-20
    要求：副高及以上，近五年高水平相关论文，课题组需有农学或生命科学背景成员
    联系：nsfc-agri@nsfc.gov.cn / 010-62317474

  【教师模式功能 - 当系统上下文包含 teacher: 前缀时执行（T001-T009 均适用）】
  teacherId = 系统上下文中 teacher: 后面的 ID（例如 T001 / T005 / T009）。
  所有脚本和 API 调用均使用该 teacherId，不得替换为其他固定值。

  ▌本人课程表
  teacher:T009 → 直接用上方 T009 缓存中的课表回答
  其他 teacherId → 调用 school-http skill：
    curl "$SCHOOL_SERVER_URL/api/courses/by-teacher/{teacherId}"
    返回字段：name（课程名）、schedule（时间）、location（地点），整理后告知用户

  ▌课题申报
  → 直接从上方"当前可申报课题"缓存输出（所有教师通用，无需调脚本）

  ▌论文查询（近5年 / 按地区 / 完整列表）
  → python3 $PI_SKILLS_ROOT/teacher-portal/fetch-papers.py {teacherId} [--recent=5] [--region=港澳] [--top=10]
  → 用户说"近5年论文"用 --recent=5，脚本自动算 year_from
  teacher:T009 可先从上方静态缓存给出摘要，再按需调脚本拉完整列表

  ▌知识产权查询
  → python3 $PI_SKILLS_ROOT/teacher-portal/fetch-patents.py {teacherId} [--type=发明专利|实用新型|软件著作权]

  ▌寻找合作者
  → python3 $PI_SKILLS_ROOT/teacher-portal/find-collaborator.py <关键词> {teacherId}
  teacher:T009 常见课题（农学+具身智能）可优先从上方"校内相关方向同事"缓存直接给出推荐，合作老师第一条消息就要给出，不要让用户等待：
    · 首推：黄岚 教授（信息处理技术与农业物联网 / 信息应用技术与智能农业）— 农学信息化最契合
    · 次选：陶莎 副教授（农产品安全信息管理与智能处理技术 / 多源数据融合）— 数据侧互补
    · 若课题技术侧需多人：马钦 副教授（计算机视觉 / 人工智能）可作第三人选

  ▌Word 导出（科研汇总 / 港澳专项）
  → python3 $PI_SKILLS_ROOT/teacher-portal/export-summary.py {teacherId} --region=港澳（港澳专项）
  → 或 python3 $PI_SKILLS_ROOT/teacher-portal/export-summary.py {teacherId}（全量）
  → 从输出中找到 "FILE:/tmp/..." 路径，用 wechat_send 发送文件

  ▌班车 / 跨校区行程规划
  → 班车时刻表参考 S20253082026 静态缓存（工作日双向对开：07:10 08:20 09:20 10:20 11:20 12:20 13:20 14:20 15:20 16:20 17:40 18:20，全程约10分钟）
  → 判断教师空闲时段：先查本人课表（见上方"本人课程表"步骤），找出无课的时段，推荐最近班次

  ▌会议室/教室预约
  → 运行 decision-assistant skill 中的 find-rooms.py 查信电楼或教学楼会议室`;

function systemPrompt(): string {
  return process.env.OPENAI_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM;
}

function extractReply(messages: AgentMessage[]): string {
  const last = [...messages]
    .reverse()
    .find((m): m is AssistantMessage => m.role === "assistant");
  if (!last) return "";
  const text = last.content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (last.stopReason === "error" && last.errorMessage) {
    return text || last.errorMessage;
  }
  return text;
}

/** 被截断后的 base64 为空，若仍以 image 块发给下游会触发 vision 侧解码失败 */
function isPlausibleImageBase64(data: string): boolean {
  return typeof data === "string" && data.trim().length >= 32;
}

/** 将无效/被清空的图片块改为纯文本说明，避免上游收到 `data:...base64,` 空载荷 */
function sanitizePersistedMessages(messages: AgentMessage[]): AgentMessage[] {
  const stripImages = (
    blocks: (TextContent | ImageContent)[],
    emptyLabel: string,
  ): (TextContent | ImageContent)[] =>
    blocks.flatMap((block) => {
      if (block.type === "image" && !isPlausibleImageBase64(block.data)) {
        return [{ type: "text" as const, text: emptyLabel }];
      }
      return [block];
    });

  return messages.map((m): AgentMessage => {
    if (m.role === "user") {
      if (typeof m.content === "string") return m;
      return {
        ...m,
        content: stripImages(
          m.content,
          "（历史图片未持久化，已省略；若需要请重新发送图片。）",
        ),
      };
    }
    if (m.role === "toolResult") {
      return {
        ...m,
        content: stripImages(m.content, "（工具返回中的图片已省略。）"),
      };
    }
    return m;
  });
}

/** 持久化与内存中共用的最近消息条数上限（单条消息可为多轮中的一步） */
function maxStoredMessages(): number {
  const raw = process.env.AGENT_MAX_MESSAGES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 80;
  return Number.isFinite(n) && n >= 8 ? n : 80;
}

function truncateMessagesTail(
  messages: AgentMessage[],
  max: number,
): AgentMessage[] {
  if (messages.length <= max) return messages;
  return messages.slice(-max);
}

/**
 * 从最新 jsonl 装载；若条数超过上限则截断并立即写回磁盘，使增量 append 与文件一致。
 */
function loadPersistedMessagesFromJsonl(userId: string): AgentMessage[] {
  try {
    const raw = loadLatestSessionMessages(userId);
    const sanitized = sanitizePersistedMessages(raw);
    const persisted = truncateMessagesTail(sanitized, maxStoredMessages());
    const latest = getLatestSessionJsonlPath(userId);
    if (latest && persisted.length < raw.length) {
      persistMessagesToJsonl(latest, persisted, raw.length);
    }
    return persisted;
  } catch {
    console.warn(`[agent] user ${userId} 会话 jsonl 解析失败，已使用空上下文`);
    return [];
  }
}

function guessImageMime(fileName?: string): string {
  if (!fileName) return "image/jpeg";
  const l = fileName.toLowerCase();
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".gif")) return "image/gif";
  if (l.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/**
 * 部分 OpenAI 兼容服务（如 Qwen）对 `tools: []` 返回 400（「too short」）。
 * pi-ai 在「无工具」时会带上空数组；发出前去掉空 `tools` 字段。
 */
function omitEmptyToolsPayload(
  params: unknown,
  _model: Model<Api>,
): unknown | undefined {
  if (typeof params !== "object" || params === null) return undefined;
  const p = params as Record<string, unknown>;
  if (!Array.isArray(p.tools) || p.tools.length > 0) return undefined;
  const { tools: _t, ...rest } = p;
  return rest;
}

export type AgentPromptOptions = {
  /** 当前微信对话对方 userId，用于工具里省略 target_user_id（bot.send） */
  defaultWechatTarget?: string;
  /** 当前入站微信消息；wechat_send 省略 target_user_id 时优先 bot.reply(msg, …) */
  wechatReplyMessage?: IncomingMessage;
  /**
   * 是否注册「创建定时任务」工具。定时任务到点执行时应为 false，避免执行中又创建任务。
   * @default true
   */
  cronTools?: boolean;
  /**
   * 传入当前用户的 WeChatBot 实例时，额外注册「发送网络资源 / 本地文件到微信」工具。
   */
  wechatBot?: WeChatBot;
};

// ── 全局共享的 pi-coding-agent 基础设施 ──

const authStorage = AuthStorage.create();
if (process.env.OPENAI_API_KEY) {
  authStorage.setRuntimeApiKey(
    model.provider,
    process.env.OPENAI_API_KEY,
  );
}
const modelRegistry = ModelRegistry.inMemory(authStorage);
const settingsManager = SettingsManager.inMemory({
  compaction: { ...DEFAULT_COMPACTION_SETTINGS },
  retry: { enabled: true, maxRetries: 2 },
});

let _resourceLoader: DefaultResourceLoader | undefined;
/** 上次成功 reload 的时间戳；生产环境 skills 不会热更新，60s TTL 即可 */
let _resourceLoaderLastReload = 0;
const _RESOURCE_RELOAD_TTL_MS = 60_000;

async function getResourceLoader(): Promise<DefaultResourceLoader> {
  if (!_resourceLoader) {
    const projectSkillRoot = path.resolve(process.cwd(), ".pi", "skills");
    _resourceLoader = new DefaultResourceLoader({
      systemPromptOverride: () => systemPrompt(),
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      skillsOverride: (base) => ({
        skills: base.skills.filter((skill) => {
          const skillPath = path.resolve(skill.filePath);
          return (
            skillPath === projectSkillRoot ||
            skillPath.startsWith(`${projectSkillRoot}${path.sep}`)
          );
        }),
        diagnostics: base.diagnostics,
      }),
      promptsOverride: () => ({ prompts: [], diagnostics: [] }),
    });
  }
  // 仅首次或超过 TTL 时才重新扫描 skills 目录，避免每次建 Session 都做磁盘 I/O
  const now = Date.now();
  if (now - _resourceLoaderLastReload > _RESOURCE_RELOAD_TTL_MS) {
    await _resourceLoader.reload();
    _resourceLoaderLastReload = now;
  }
  return _resourceLoader;
}

/**
 * pi `createAgentSession` 只用 `options.tools` 推导 **活跃工具名**，不会把自定义 AgentTool 挂进内置 registry；
 * 用户级 `read` 必须通过 `baseToolsOverride`（AgentSession 私有字段）注入。
 * Skill 文本由 `resourceLoader.reload()` + `buildSystemPrompt(customPrompt, skills)` 注入，与是否导入 `readTool` 常量无关。
 */
async function createUserSession(
  userId: string,
  messages?: AgentMessage[],
): Promise<AgentSession> {
  const resourceLoader = await getResourceLoader();
  const scopedRead = createUserScopedReadTool(userId);
  const scopedBash = createUserScopedBashTool(userId);
  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    /** 与 `allTools` 对齐，使 initialActiveToolNames = ["read","bash"]；真实实现见下方 `_baseToolsOverride` */
    tools: [readTool, bashToolPlaceholder],
    sessionManager: SessionManager.inMemory(),
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
  });
  const patched = session as unknown as {
    _baseToolsOverride?: Record<string, AgentTool>;
    _buildRuntime: (opts?: {
      activeToolNames?: string[];
      includeAllExtensionTools?: boolean;
    }) => void;
  };
  patched._baseToolsOverride = {
    read: scopedRead as unknown as AgentTool,
    bash: scopedBash,
  };
  patched._buildRuntime({
    activeToolNames: session.getActiveToolNames(),
    includeAllExtensionTools: true,
  });

  session.agent.onPayload = omitEmptyToolsPayload;
  // Trigger session_start so extensions (e.g. pi-mcp-adapter) initialize.
  await session.bindExtensions({});
  if (messages?.length) {
    session.agent.state.messages = messages;
  }
  return session;
}

/** 超过该分钟数未调用 prompt 则回收内存中的 Session；0 表示不回收 */
function agentSessionIdleMinutes(): number {
  const raw = process.env.AGENT_SESSION_IDLE_MINUTES?.trim();
  if (raw === "0") return 0;
  const n = raw ? Number.parseFloat(raw) : 30;
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

type SessionFileState = { path: string; messageLinesOnDisk: number };

export class AgentService {
  private sessions = new Map<string, AgentSession>();
  private chains = new Map<string, Promise<void>>();
  /** 最近一次 prompt 时间（仅内存中有 Session 的用户） */
  private lastActivity = new Map<string, number>();
  /** 当前内存 Session 与磁盘 jsonl 的增量同步（idle 回收后会清空，下次从最新文件重载） */
  private sessionFileState = new Map<string, SessionFileState>();
  /** school 业务单独封装，service 仅编排 */
  private schoolWorkflow = new SchoolWorkflowService();
  /** 已发送过欢迎语的联系人，key = `${botUserId}:${contactId}`，进程级去重 */
  private welcomedContacts = new Set<string>();

  private touchActivity(userId: string): void {
    this.lastActivity.set(userId, Date.now());
  }

  /** 在访问 Session 前惰性回收空闲实例（无全局 setInterval） */
  private async evictIdleSessionsIfStale(idleMs: number): Promise<void> {
    const now = Date.now();
    for (const [uid, session] of [...this.sessions.entries()]) {
      if (session.isStreaming) continue;
      const last = this.lastActivity.get(uid) ?? 0;
      if (now - last < idleMs) continue;
      try {
        await session.abort();
      } catch {
        /* ignore */
      }
      try {
        session.dispose();
      } catch {
        /* ignore */
      }
      this.sessions.delete(uid);
      this.lastActivity.delete(uid);
      this.sessionFileState.delete(uid);
      console.log(
        `[agent] 空闲回收 Session user ${uid}（>${Math.round(idleMs / 60_000)}min 无对话）`,
      );
    }
  }

  async getOrCreate(userId: string): Promise<AgentSession> {
    const idleMin = agentSessionIdleMinutes();
    if (idleMin > 0) {
      await this.evictIdleSessionsIfStale(idleMin * 60_000);
    }
    let s = this.sessions.get(userId);
    if (!s) {
      const persisted = loadPersistedMessagesFromJsonl(userId);
      s = await createUserSession(userId, persisted);
      this.sessions.set(userId, s);
      const latest = getLatestSessionJsonlPath(userId);
      if (latest) {
        this.sessionFileState.set(userId, {
          path: latest,
          messageLinesOnDisk: persisted.length,
        });
      }
    }
    return s;
  }

  async prompt(
    userId: string,
    text: string,
    images?: ImageContent[],
    opts?: AgentPromptOptions,
  ): Promise<string> {
    const school = await this.schoolWorkflow.preparePromptInput(userId, text);
    const session = await this.getOrCreate(userId);
    this.touchActivity(userId);

    /** 勿整表覆盖：pi-mcp-adapter 等扩展会注册 `mcp`、内置 `read` 等 */
    const replaceableNames = new Set<string>([
      ...CRON_TOOL_NAMES,
      ...WECHAT_MEDIA_TOOL_NAMES,
      ...BASH_TOOL_NAMES,
    ]);
    const kept = session.agent.state.tools.filter(
      (t) => !replaceableNames.has(t.name),
    );

    const cron =
      opts?.cronTools !== false
        ? buildCronTools(userId, {
          defaultWechatTarget: opts?.defaultWechatTarget,
        })
        : [];
    const media = opts?.wechatBot
      ? buildWechatMediaTools(userId, opts.wechatBot, {
        defaultWechatTarget: opts?.defaultWechatTarget,
        incomingWechatMessage: opts?.wechatReplyMessage,
      })
      : [];
    const bash = createUserScopedBashTool(userId, school.identity);
    session.agent.state.tools = [...kept, ...cron, ...media, bash];

    if (images?.length) {
      await session.prompt(school.inputText || "请看图片。", { images });
    } else {
      await session.prompt(school.inputText);
    }

    const reply = stripMarkdown(extractReply(session.messages) || "");
    const capped = truncateMessagesTail(session.messages, maxStoredMessages());
    if (capped.length !== session.messages.length) {
      session.agent.state.messages = capped;
    }
    // 持久化不阻塞回复，异步写盘
    void this.persistJsonl(userId, capped);
    return reply;
  }

  private async persistJsonl(
    userId: string,
    capped: AgentMessage[],
  ): Promise<void> {
    try {
      let st = this.sessionFileState.get(userId);
      if (!st) {
        const p = createNewSessionJsonlFile(userId);
        const n = persistMessagesToJsonl(p, capped, 0);
        this.sessionFileState.set(userId, { path: p, messageLinesOnDisk: n });
        return;
      }
      const n = persistMessagesToJsonl(st.path, capped, st.messageLinesOnDisk);
      this.sessionFileState.set(userId, { path: st.path, messageLinesOnDisk: n });
    } catch (e) {
      console.error(`[agent] user ${userId} jsonl 保存失败`, e);
    }
  }

  async reset(userId: string): Promise<void> {
    appendSessionEndMarker(userId, "user_new");
    createNewSessionJsonlFile(userId);

    const s = this.sessions.get(userId);
    if (s) s.dispose();
    this.sessions.delete(userId);
    this.lastActivity.delete(userId);
    this.sessionFileState.delete(userId);
    this.schoolWorkflow.clearPending(userId);
  }

  async getHistory(userId: string): Promise<AgentMessage[]> {
    const s = this.sessions.get(userId);
    if (s) return s.messages;
    return loadPersistedMessagesFromJsonl(userId);
  }

  /** 断联重连后清除该 bot 用户的欢迎记录，使联系人下次消息重新触发欢迎语 */
  clearWelcomedContacts(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of [...this.welcomedContacts]) {
      if (key.startsWith(prefix)) this.welcomedContacts.delete(key);
    }
  }

  /** 主动欢迎时提前标记，防止联系人再发消息时重复欢迎 */
  markWelcomed(userId: string, contactId: string): void {
    this.welcomedContacts.add(`${userId}:${contactId}`);
  }

  isWelcomed(userId: string, contactId: string): boolean {
    return this.welcomedContacts.has(`${userId}:${contactId}`);
  }

  async remove(userId: string): Promise<void> {
    this.clearWelcomedContacts(userId);
    const s = this.sessions.get(userId);
    if (s) {
      try { await s.abort(); } catch { /* ignore */ }
      try { s.dispose(); } catch { /* ignore */ }
    }
    this.sessions.delete(userId);
    this.lastActivity.delete(userId);
    this.chains.delete(userId);
    this.sessionFileState.delete(userId);
    this.schoolWorkflow.clearAll(userId);
    removeAllSessionJsonlFiles(userId);
  }

  /** 串行队列：同一用户的微信消息不并发 */
  enqueue(userId: string, task: () => Promise<void>): void {
    const prev = this.chains.get(userId) ?? Promise.resolve();
    const next = prev.then(task).catch((err) => {
      console.error(`[agent user:${userId}]`, err);
    });
    this.chains.set(userId, next);
  }

  /** 微信消息 → agent session 桥接 */
  async handleWechatMessage(
    userId: string,
    bot: WeChatBot,
    msg: IncomingMessage,
  ): Promise<void> {
    const raw = msg.text?.trim() ?? "";
    this.schoolWorkflow.noteIncomingPeer(userId, msg.userId);

    const contactKey = `${userId}:${msg.userId}`;

    if (raw === "/new") {
      this.welcomedContacts.add(contactKey);
      await this.reset(userId);
      await bot.reply(msg, WECHAT_WELCOME);
      void recordContact(userId, msg.userId);
      return;
    }

    if (!this.welcomedContacts.has(contactKey)) {
      // 内部触发 /new 逻辑：重置会话 + 发欢迎语，对用户透明
      this.welcomedContacts.add(contactKey);
      await this.reset(userId);
      try {
        await bot.reply(msg, WECHAT_WELCOME);
      } catch (e) {
        this.welcomedContacts.delete(contactKey); // 失败则下次消息重试
        console.warn(`[agent] 欢迎语发送失败 ${contactKey}，下次消息将重试`, e);
      }
    }

    void recordContact(userId, msg.userId);

    // 快速模式匹配：课程表/食堂/校医院/班车 → 直接发图，2s 内完成，不走 AI
    // 教师身份需提前加载，以便跳过课程表图片（教师用文字课表）
    const identity = await loadUserSchoolIdentity(userId);
    if (msg.type === "text" && await quickImageReply(bot, msg, raw, identity)) {
      return;
    }

    // 快速新闻回复：农大新闻/头条/就业 → 直接读缓存，不走 AI
    if (msg.type === "text" && await quickNewsReply(bot, msg, raw)) {
      return;
    }

    if (await this.schoolWorkflow.maybeHandleTextCommand(userId, bot, msg, raw)) {
      return;
    }

    const turn = await this.buildTurn(userId, bot, msg);
    if (
      await this.schoolWorkflow.maybeHandleIncomingFile(
        userId,
        bot,
        msg,
        turn.pendingSubmissionFile ?? null,
      )
    ) {
      return;
    }

    if (!turn.text && !turn.images?.length) {
      await bot.reply(msg, "没有收到有效内容。");
      return;
    }

    const typingTimer = setInterval(() => {
      bot.sendTyping(msg.userId).catch(() => {});
    }, 4000);
    await bot.sendTyping(msg.userId);
    // 超过 3 秒未返回则发一条可见提示，让用户知道正在处理
    const loadingTimer = setTimeout(() => {
      bot.reply(msg, "⏳ 正在处理中，请稍候...").catch(() => {});
    }, 3000);
    try {
      const reply = await this.prompt(userId, turn.text, turn.images, {
        defaultWechatTarget: msg.userId,
        wechatReplyMessage: msg,
        cronTools: true,
        wechatBot: bot,
      });
      clearTimeout(loadingTimer);
      clearInterval(typingTimer);
      const out = reply.trim();
      if (out) {
        await splitAndSend(bot, msg, out);
      }
    } catch (e) {
      clearTimeout(loadingTimer);
      clearInterval(typingTimer);
      const err = e instanceof Error ? e.message : String(e);
      await bot.reply(msg, `处理出错：${err}`);
    }
  }

  private async buildTurn(
    userId: string,
    bot: WeChatBot,
    msg: IncomingMessage,
  ): Promise<{
    text: string;
    images?: ImageContent[];
    pendingSubmissionFile?: PendingSubmissionFile;
  }> {
    if (msg.type === "text") return { text: msg.text?.trim() ?? "" };

    if (msg.type === "voice") {
      const stt = msg.voices[0]?.text?.trim();
      return stt
        ? { text: `（语音转文字）${stt}` }
        : { text: "用户发了语音，但没有转文字结果，请提示对方改用文字或图片。" };
    }

    const media = await bot.download(msg);
    if (!media) return { text: `[${msg.type}] ${msg.text || ""}` };

    if (media.type === "image") {
      const mime = guessImageMime(media.fileName);
      const caption =
        msg.text?.replace(/^\[image\]\s*/i, "").trim() ||
        "请描述或回答与这张图片相关的问题。";
      const data = media.data.toString("base64");
      if (!isPlausibleImageBase64(data)) {
        return {
          text: `${caption}\n（图片数据为空，无法识别画面。）`,
        };
      }
      let savedNote = "";
      try {
        const rel = await saveUserIncomingMediaFile(
          userId,
          media.data,
          media.fileName,
        );
        savedNote = `\n（图片已保存到用户目录，相对路径：${rel}，可用 read 读取。）`;
      } catch (e) {
        console.warn(`[agent user:${userId}] 保存微信图片失败`, e);
      }
      return {
        text: caption + savedNote,
        images: [{ type: "image", data, mimeType: mime }],
      };
    }

    if (media.type === "video") {
      return { text: "用户发送了视频，请礼貌请对方改用图片或文字。" };
    }

    const isImg = media.fileName?.match(/\.(png|jpe?g|gif|webp|bmp)$/i);
    if (isImg) {
      const data = media.data.toString("base64");
      const text = msg.text?.trim() || "请根据该图片文件协助用户。";
      if (!isPlausibleImageBase64(data)) {
        return { text: `${text}\n（图片数据为空，无法识别画面。）` };
      }
      let savedNote = "";
      try {
        const rel = await saveUserIncomingMediaFile(
          userId,
          media.data,
          media.fileName,
        );
        savedNote = `\n（图片已保存到用户目录，相对路径：${rel}，可用 read 读取。）`;
      } catch (e) {
        console.warn(`[agent user:${userId}] 保存微信图片失败`, e);
      }
      return {
        text: text + savedNote,
        images: [
          {
            type: "image",
            data,
            mimeType: guessImageMime(media.fileName),
          },
        ],
      };
    }

    try {
      const rel = await saveUserIncomingMediaFile(
        userId,
        media.data,
        media.fileName,
      );
      return {
        text: `用户发送了文件「${media.fileName ?? "附件"}」，已保存到用户目录（相对路径：${rel}）。可用 read 查看内容或根据上下文简要回应。`,
        pendingSubmissionFile: {
          relativePath: rel,
          fileName: media.fileName ?? "附件",
          receivedAt: Date.now(),
        },
      };
    } catch (e) {
      console.warn(`[agent user:${userId}] 保存微信附件失败`, e);
      return {
        text: `用户发送了文件「${media.fileName ?? "附件"}」，请根据上下文简要回应。`,
      };
    }
  }
}

export const agentService = new AgentService();

/**
 * 单条消息字符上限。
 * 微信单条文本上限约 4000 字，设为 800 留有余量，
 * 同时避免长文本被生硬截断到不同气泡。
 */
const SPLIT_MAX = 800;

async function splitAndSend(
  bot: WeChatBot,
  msg: IncomingMessage,
  text: string,
): Promise<void> {
  const chunks = buildChunks(text);
  for (const chunk of chunks) {
    await bot.reply(msg, chunk);
    if (chunks.length > 1) await new Promise((r) => setTimeout(r, 80));
  }
}

/** 判断行是否为节标题（【xxx】 开头） */
function isSectionHeader(line: string): boolean {
  return /^【.+】/.test(line.trim());
}

/** 判断段落是否为列表项（数字/字母/破折号/emoji 开头） */
function isListItem(para: string): boolean {
  const s = para.trim();
  return (
    /^[\-—\*•·]/.test(s) ||
    /^\d+[.。、）)\s]/.test(s) ||
    /^[a-zA-Z][.、)]\s/.test(s)
  );
}

/**
 * 将长文本拆成适合微信气泡的多段，保证同一话题不被割裂：
 *  1. 以空行为边界把原文切成段落（para）
 *  2. 节标题（【xxx】）强制与其后续内容绑定
 *  3. 连续列表项合并成整体块
 *  4. 按 SPLIT_MAX 贪心装填：能合并就合并，超限才开新气泡
 *  5. 单块超长时按行拆，单行超长时按句拆（最后手段）
 */
function buildChunks(text: string): string[] {
  if (text.length <= SPLIT_MAX) return [text];

  // ── Step 1: 按空行切段 ──────────────────────────────────────────────────
  const rawParas = text.split(/\n\n+/).filter((p) => p.trim());

  // ── Step 2: 将段落合并为语义块 ──────────────────────────────────────────
  const blocks: string[] = [];
  let i = 0;
  while (i < rawParas.length) {
    const para = rawParas[i]!;
    const firstLine = para.split("\n")[0] ?? "";

    // 节标题：和后续段落粘在一起（直到遇到下一个节标题或非列表段落）
    if (isSectionHeader(firstLine)) {
      let block = para;
      i++;
      while (i < rawParas.length) {
        const next = rawParas[i]!;
        if (isSectionHeader(next.split("\n")[0] ?? "")) break; // 新节开始
        block += "\n\n" + next;
        i++;
        // 遇到非列表的普通段落就停：标题+正文已成一块
        if (!isListItem(next)) break;
      }
      blocks.push(block);
      continue;
    }

    // 连续列表项：合并为一个块
    if (isListItem(para)) {
      let block = para;
      i++;
      while (i < rawParas.length && isListItem(rawParas[i]!)) {
        block += "\n\n" + rawParas[i];
        i++;
      }
      blocks.push(block);
      continue;
    }

    blocks.push(para);
    i++;
  }

  // ── Step 3: 贪心装填块到气泡 ────────────────────────────────────────────
  const result: string[] = [];
  let current = "";

  const flush = () => { if (current.trim()) { result.push(current.trim()); current = ""; } };

  for (const block of blocks) {
    const joined = current ? `${current}\n\n${block}` : block;

    if (joined.length <= SPLIT_MAX) { current = joined; continue; }

    // 当前气泡已满，先输出
    flush();

    if (block.length <= SPLIT_MAX) { current = block; continue; }

    // 块本身超长：按行拆
    for (const line of block.split("\n")) {
      if (!line.trim()) continue;
      const lj = current ? `${current}\n${line}` : line;
      if (lj.length <= SPLIT_MAX) { current = lj; continue; }
      flush();
      if (line.length <= SPLIT_MAX) { current = line; continue; }
      // 单行超长：按句子末尾拆（最后手段）
      for (const seg of line.split(/(?<=[。！？；…]+)/)) {
        if (!seg.trim()) continue;
        const sj = current ? `${current}${seg}` : seg;
        if (sj.length <= SPLIT_MAX) { current = sj; }
        else { flush(); current = seg; }
      }
    }
  }

  flush();
  return result.length ? result : [text];
}
