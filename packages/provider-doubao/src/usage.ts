import type { ServerEvent } from "./protocol.ts";

const record = (value: unknown): Record<string,unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : undefined;
const id = (value: unknown) => typeof value === "string" && /^[\w.:-]{1,200}$/.test(value) ? value : undefined;
const metrics = ["input_tokens","output_tokens","total_tokens","prompt_tokens","completion_tokens",
  "text_tokens","audio_tokens","cached_tokens"];
function counts(value: unknown) {
  const source=record(value), result:Record<string,number>={};
  for(const key of metrics) if(typeof source?.[key]==="number" && Number.isFinite(source[key]) && source[key]>=0)
    result[key]=source[key];
  return result;
}
/** Store only recognized numeric provider accounting, never arbitrary response data. */
export function providerUsage(event: ServerEvent) {
  const response=record(event.response), source=record(event.usage)??record(response?.usage);
  if(!source)return null;
  const values:Record<string,number|Record<string,number>>=counts(source);
  for(const key of ["input_token_details","output_token_details","input_tokens_details","output_tokens_details",
    "prompt_tokens_details","completion_tokens_details"]) {
    const details=counts(source[key]); if(Object.keys(details).length)values[key]=details;
  }
  if(!Object.keys(values).length)return null;
  const responseId=id(response?.id)??id(event.response_id), eventId=id(event.event_id);
  return {key:responseId??eventId??`latest:${id(event.type)??"usage"}`,provider:"doubao",
    eventType:id(event.type),eventId,responseId,values};
}
