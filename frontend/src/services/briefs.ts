// src/services/briefs.ts
import { apiGet, apiPost } from "./api";
import type { BriefPayload, SendTestBriefRequest, SendTestBriefResponse } from "../types/brief";

export const fetchBriefPreview = (): Promise<BriefPayload> =>
  apiGet<BriefPayload>("/api/v1/brief/preview");

export const sendTestBrief = (body: SendTestBriefRequest): Promise<SendTestBriefResponse> =>
  apiPost<SendTestBriefResponse>("/api/v1/brief/send-test", body);