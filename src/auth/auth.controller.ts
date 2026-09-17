import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto, LoginDto, ResetPasswordDto } from "./dto/auth.dto";
import { Public } from "./decorators/public.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<{ user: { id: string; email: string; name: string } }> {
    const result = await this.authService.login(
      dto.email,
      dto.password,
      req.ip,
      req.header("user-agent"),
    );

    return { user: result.user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  logout(): { loggedOut: true } {
    return { loggedOut: true };
  }

  @Get("me")
  me(): null {
    return null;
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
