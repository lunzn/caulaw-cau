
## Bun 请阅读

https://bun.sh/llms.txt



2026.4.14.14  每个wechatbot对应一个pi-coding-agent，这个agent有完整的能力，每个webchatbot的cwd和workspace都在.data/wechatbot/{id}下。crontab. reminder请集中抽象到server/tools中

不需要兼容WECHAT_MEDIA_ROOT 统一到.data/wechatbot当中。



我需要简单的映射关系：webchatbot -> pi-coding-agent-session。在用户不活跃的时候关掉回收session，用户再问问题时，获取对话信息，new一个一模一样的session。对话信息保存成jsonl，这样方便append。存储在.data/wechatbot/{id}/sessions下，按时间命名。这样每次只需要装载最新的session。用户使用/new则用新的对话，新开jsonl，并且在老jsonl后加上end之类的标识符。



在work-server中实现
https://github.com/egeominotti/bunqueue
通过消息队列建立一个课程作业收发网络，当角色为教师时，agent收到文件会询问是否发送到课程xxx。
作为学生，在作业要完成的前一天，会被提醒⏰交作业，文件发送时，通过不同的文件后缀（如pdf等就很可能是作业），agent会询问是否是提交给课程xxx的，让大家选择。
以上尽量用skill完成。
学生在next端也要能看到自己所在的课程等。



agent通过skill实现对教务信息的查询
教务信息的仿真在packages/school-server里。
elysia + sqlite（不要orm）,代码和其他包要完全解藕，只暴露http接口
https://bun.com/docs/runtime/sqlite.md
需要创建的对象包括：
1. 课程
2. 授课教师
3. 学生
4. 课程作业

学生身份和next端的能对应就行

user<->student
user<->teacher

生成一些模拟数据