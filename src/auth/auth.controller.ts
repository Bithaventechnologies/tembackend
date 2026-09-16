import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto, LoginDto, ResetPasswordDto } from "./dto/auth.dto";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { SessionGuard } from "./guards/session.guard";
import { CsrfGuard } from "./guards/csrf.guard";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "./session.util";
import type { AuthenticatedUser } from "./auth.types";

@Controller("auth")
export class AuthController {
  private readonly cookieSecure: boolean;
  private readonly cookieDomain: string;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {
    this.cookieSecure = this.config.get<string>("COOKIE_SECURE") === "true";
    this.cookieDomain = this.config.get<string>("COOKIE_DOMAIN", "localhost");
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: { id: string; email: string; name: string } }> {
    const result = await this.authService.login(
      dto.email,
      dto.password,
      req.ip,
      req.header("user-agent"),
    );

    res.cookie(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: "lax",
      domain: this.cookieDomain === "localhost" ? undefined : this.cookieDomain,
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
    res.cookie(CSRF_COOKIE_NAME, result.csrfToken, {
      httpOnly: false,
      secure: this.cookieSecure,
      sameSite: "lax",
      domain: this.cookieDomain === "localhost" ? undefined : this.cookieDomain,
      maxAge: SESSION_TTL_MS,
      path: "/",
    });

    return { user: result.user };
  }

  @UseGuards(SessionGuard, CsrfGuard)
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ loggedOut: true }> {
    await this.authService.logout(user.sessionId);
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
    return { loggedOut: true };
  }

  @UseGuards(SessionGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return { message: "If an account exists for that email, a reset link has been sent." };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: "Password has been reset. Please log in again." };
  }
}
