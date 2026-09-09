import type { AvatarRecord } from "./avatar-store.ts";
export function roleInstructions(avatar:AvatarRecord|null,base:string) {
  if(!avatar||avatar.DELET_OR_NOT)return base;
  return [base,"你正在进行 AI 数字人语音通话。以下是用户设置的角色资料，按其关系、性格、语气和背景进行角色扮演。不要声称自己是真实人物，不要假装拥有未提供的共同记忆。",
    `角色名称：${JSON.stringify(avatar.name)}`,
    avatar.persona?`角色资料：${JSON.stringify(avatar.persona)}`:"未填写角色资料，按默认语气自然交流。"].join("\n");
}
