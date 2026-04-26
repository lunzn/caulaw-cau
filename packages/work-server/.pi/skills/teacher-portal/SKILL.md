# teacher-portal Skill

教师科研与教学信息管理技能集，供 teacher 角色使用。

## 可用脚本

所有脚本均通过 `SCHOOL_SERVER_URL` 环境变量连接学校服务器（默认 http://school-server:3002）。

### fetch-papers.py — 查询教师论文
```
python3 $PI_SKILLS_ROOT/teacher-portal/fetch-papers.py <teacherId> [--region=港澳] [--year=2024] [--recent=5] [--top=10]
```
- 输出：论文统计摘要（按年份、地区）+ 被引最高论文列表
- 示例：`python3 $PI_SKILLS_ROOT/teacher-portal/fetch-papers.py T009 --top=5`
- 港澳筛选：`python3 $PI_SKILLS_ROOT/teacher-portal/fetch-papers.py T009 --region=港澳`
- 近5年：`python3 $PI_SKILLS_ROOT/teacher-portal/fetch-papers.py T009 --recent=5`（自动计算year_from）

### fetch-patents.py — 查询知识产权（专利/软著）
```
python3 $PI_SKILLS_ROOT/teacher-portal/fetch-patents.py <teacherId> [--type=发明专利|实用新型|软件著作权]
```
- 输出：知识产权统计（按类型）+ 详细列表
- 示例：`python3 $PI_SKILLS_ROOT/teacher-portal/fetch-patents.py T009`
- 筛选：`python3 $PI_SKILLS_ROOT/teacher-portal/fetch-patents.py T009 --type=发明专利`

### fetch-projects.py — 查询开放课题/项目申报
```
python3 $PI_SKILLS_ROOT/teacher-portal/fetch-projects.py [--category=国家级基金]
```
- 输出：当前可申报的项目列表（按截止时间排序），含要求与联系方式
- 示例：`python3 $PI_SKILLS_ROOT/teacher-portal/fetch-projects.py`
- 筛选：`python3 $PI_SKILLS_ROOT/teacher-portal/fetch-projects.py --category=国家级`

### find-collaborator.py — 寻找潜在合作者
```
python3 $PI_SKILLS_ROOT/teacher-portal/find-collaborator.py <keyword> [teacherId]
```
- 搜索学校内部及信电学院有相近研究方向的教师
- 示例：`python3 $PI_SKILLS_ROOT/teacher-portal/find-collaborator.py 机器视觉`
- 示例：`python3 $PI_SKILLS_ROOT/teacher-portal/find-collaborator.py 智慧农业 T009`（排除自己）

### export-summary.py — 导出科研总结为 Word 文档
```
python3 $PI_SKILLS_ROOT/teacher-portal/export-summary.py <teacherId> [--type=all|papers|patents|collab] [--region=港澳] [--output=/tmp/summary.docx]
```
- 生成 Word 文档，最后一行打印 `FILE:/tmp/xxx.docx` 路径，供 wechat_send 发送
- 默认导出全部（all）：教师简介 + 论文列表（Top 20）+ 知识产权列表 + 合作建议
- `--region=港澳`：仅包含港澳地区论文和知识产权
- 示例（全部）：`python3 $PI_SKILLS_ROOT/teacher-portal/export-summary.py T009`
- 示例（仅港澳）：`python3 $PI_SKILLS_ROOT/teacher-portal/export-summary.py T009 --region=港澳`
- 示例（仅论文）：`python3 $PI_SKILLS_ROOT/teacher-portal/export-summary.py T009 --type=papers`

## 调用规则

- 当 teacher 用户询问自己的论文/知识产权时，先从系统缓存给出概要，再根据需要调用脚本获取完整数据
- 用户要求导出 Word 时，调用 export-summary.py，获取文件路径后用 wechat_send 发送
- find-collaborator.py 会同时查询学校服务器中的教师数据和 CIEE 信电学院抓取数据
