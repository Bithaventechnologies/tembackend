import { Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { WebhooksService } from "./webhooks.service";

// Raw-body preservation for this route is configured in main.ts via a
// verify callback on the JSON body parser scoped to "/webhooks/resend"
// (see RAW_BODY_ROUTE in main.ts) — req.rawBody carries the untouched bytes
// so svix signature verification runs against exactly what Resend signed.
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post("resend")
  @HttpCode(HttpStatus.OK)
  async handleResend(@Req() req: Request & { rawBody?: Buffer }): Promise<{ received: true }> {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new Error("Raw body not captured for webhook verification — check main.ts body-parser config");
    }

    const payload = this.webhooksService.verifySignature(rawBody, req.headers as Record<string, string | string[] | undefined>);
    await this.webhooksService.handleEvent(payload);
    return { received: true };
  }
}
