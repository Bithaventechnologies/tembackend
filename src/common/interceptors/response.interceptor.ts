import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, map } from "rxjs";
import type { ApiSuccessBody } from "../api-response";

// Wraps every successful controller return value in {success:true,data}
// unless the handler already returned that shape itself (e.g. streamed CSV
// responses that write directly to `res` bypass this by not returning a body).
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccessBody<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessBody<T>> {
    return next.handle().pipe(
      map((data) => {
        if (
          data &&
          typeof data === "object" &&
          "success" in (data as Record<string, unknown>)
        ) {
          return data as unknown as ApiSuccessBody<T>;
        }
        return { success: true, data } as ApiSuccessBody<T>;
      }),
    );
  }
}
