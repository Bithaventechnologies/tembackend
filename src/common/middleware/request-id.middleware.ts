import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

type RequestWithId = Request & { id?: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const request = req as RequestWithId;
    const incoming = request.header("x-request-id");
    request.id = incoming && incoming.length <= 100 ? incoming : randomUUID();
    res.setHeader("x-request-id", request.id);
    next();
  }
}
