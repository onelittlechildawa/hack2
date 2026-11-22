export const careKeywords = [
  "自杀", "轻生", "不想活", "活不下去", "活不下", "活着没意思", "活着好累", "不想醒来",
  "结束生命", "了结自己", "跳楼", "想跳下去", "割腕", "伤害自己", "自残", "自伤",
  "去死", "想死", "寻死", "遗书", "安乐死", "离开这个世界", "彻底消失", "消失算了",
  "撑不住", "撑不下去", "扛不住", "快崩溃", "崩溃了", "好绝望", "绝望", "重度抑郁",
  "抑郁症", "受不了了", "求救", "救救我", "没有意义了",
  "suicide", "kill myself", "end my life", "self-harm", "self harm",
];

const carePattern = new RegExp(
  careKeywords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

export function hasCareSignal(text) {
  return typeof text === "string" && carePattern.test(text);
}

export const rucCareInfo = {
  title: "你现在可能正在经历很难熬的时刻",
  intro: "如果愿意的话，可以随时找学校心理咨询的老师聊聊，不必一个人扛着。",
  campuses: [
    { name: "中关村校区", location: "生态环境学院122办公室", phone: "62511397", tel: "01062511397" },
    { name: "通州校区", location: "学生事务中心306办公室", phone: "80681397", tel: "01080681397" },
  ],
  email: "rucmh@ruc.edu.cn",
  clinic: "也可以直接前往校医院门诊寻求帮助。",
};
