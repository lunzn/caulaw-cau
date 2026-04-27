/**
 * 快速教授档案回复：关键词匹配姓名后直接从静态数据返回，不走 AI。
 * 适用于展示型查询（"林万龙是谁" / "任金政联系方式" 等）。
 * 复杂问题（"林万龙适合做我的导师吗"）不在此处处理，继续走 AI。
 */
import type { WeChatBot, IncomingMessage } from "@wechatbot/wechatbot";

// ── 教授档案 ────────────────────────────────────────────────────────────────

const PROFESSORS: ProfessorProfile[] = [
  {
    patterns: [/林万龙/],
    card: `【林万龙 教授】经济管理学院 · 农业经济系
现任：中国农业大学副校长（兼本科生院院长、研究生院院长）/ 国家乡村振兴研究院副院长
职称：教授、博士生导师
研究方向：发展经济学 / 农村公共财政与公共服务 / 农村贫困与减贫 / 投资项目管理与评估
电话：(010)-6273 6537
邮箱：linwanlong@vip.163.com
地址：北京市海淀区清华东路17号 中国农业大学经济管理学院

科研：主持国家级及国际项目40余项（国家社科重大1项、国家自科4项、世界银行/亚行/联合国开发署等国际合作10余项、省部级20余项）
论文：《管理世界》《中国农村经济》Food Policy、World Development 等期刊40余篇；2019年《农业经济问题》创刊40年高被引作者第36位
荣誉：霍英东优秀青年教师一等奖（社科类）/ 北京市哲学社会科学优秀成果二等奖 / 教育部新世纪优秀人才`,
  },
  {
    patterns: [/任金政/],
    card: `【任金政 教授】经济管理学院 · 会计系
现任：中国农业大学经济管理学院副院长（2015年至今）
职称：教授、博士生导师（管理学博士，中国农业大学 2006）
研究方向：项目分析与风险管理（农业保险定价 / 洪水保险 / 数字金融 / 扶贫资金绩效评价）
电话：010-62738506
邮箱：rjzheng1977@163.com

科研：主持国家自然科学基金2项、北京市社科基金2项（含重点1项）、国务院扶贫办委托项目10项及省部委项目20余项
论文：发表70余篇，其中SSCI/SCI/CSSCI收录30余篇；代表期刊：Emerging Markets Finance and Trade、Sustainability、保险研究、农业技术经济等
著作：《北京市居民互联网理财行为研究》《扶贫案例编写指南》《基于风险管控的种植业保险绩效评价研究》
荣誉：北京市高等教育教学成果二等奖（2013）/ 山西省科技进步二等奖 / 北京高校优秀本科教学管理人员（2020）
曾任：美国普渡大学访问学者（2013-2014）`,
  },
];

// ── 类型 ─────────────────────────────────────────────────────────────────────

type ProfessorProfile = {
  patterns: RegExp[];
  card: string;
};

// ── 复杂查询过滤（交给 AI） ───────────────────────────────────────────────────

const COMPLEX_RE = /适合|推荐|建议|比较|选择|导师|合作|课题|研究方向.*如何|帮我|分析|评价/;

function isComplexQuery(text: string): boolean {
  return text.length > 15 && COMPLEX_RE.test(text);
}

// ── 主函数 ───────────────────────────────────────────────────────────────────

/**
 * 尝试快速教授档案回复。
 * @returns true 表示已处理（调用者应 return），false 表示未匹配或复杂查询（继续走 AI）
 */
export async function quickProfessorReply(
  bot: WeChatBot,
  msg: IncomingMessage,
  text: string,
): Promise<boolean> {
  if (!text || isComplexQuery(text)) return false;

  for (const prof of PROFESSORS) {
    if (prof.patterns.some((p) => p.test(text))) {
      await bot.reply(msg, prof.card);
      return true;
    }
  }

  return false;
}
