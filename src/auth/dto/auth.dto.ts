import { IsEmail, IsString, Matches, MinLength } from "class-validator";

// Mirrors packages/types/src/auth.ts (loginSchema / forgotPasswordSchema / resetPasswordSchema / passwordSchema).
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(12, { message: "Password must be at least 12 characters" })
  @Matches(/[a-z]/, { message: "Password must contain a lowercase letter" })
  @Matches(/[A-Z]/, { message: "Password must contain an uppercase letter" })
  @Matches(/[0-9]/, { message: "Password must contain a number" })
  @Matches(/[^a-zA-Z0-9]/, { message: "Password must contain a special character" })
  password!: string;
}
