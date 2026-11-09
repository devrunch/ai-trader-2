import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Login, LoginError, Logout, CurrentUser } from '../application/index.js';
import { LoginDto, UserResponse } from './auth.dto.js';
import { z } from 'zod';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';
import { SessionGuard } from './session.guard.js';
import { CsrfHeaderGuard } from './csrf-header.guard.js';
const cookieName = 'aitrader_session';
@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(Login) private readonly login: Login, @Inject(Logout) private readonly logout: Logout, @Inject(CurrentUser) private readonly current: CurrentUser, @Inject('AUTH_PRODUCTION') private readonly production: boolean) {}
  @Post('login') @HttpCode(200) @UseGuards(CsrfHeaderGuard, AuthRateLimitGuard)
  async signIn(@Body() input: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const body = LoginDto.parse(input);
    try { const result = await this.login.execute(body.username, body.password, req.ip ?? 'unknown'); res.cookie(cookieName, result.sessionId, { httpOnly: true, sameSite: 'strict', secure: this.production, path: '/', maxAge: 12 * 60 * 60 * 1000 }); return { user: UserResponse.parse(result.user) }; }
    catch (error) { if (error instanceof LoginError) throw new UnauthorizedException(error.message); throw error; }
  }
  @Post('logout') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> { const cookieValue: unknown = req.cookies[cookieName]; await this.logout.execute(z.string().optional().parse(cookieValue)); res.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', secure: this.production, path: '/' }); }
  @Get('me') @UseGuards(SessionGuard)
  me(@Req() req: Request & { authUser?: { id: string; username: string; role: 'admin' | 'user' } }) { if (!req.authUser) throw new UnauthorizedException(); return { user: req.authUser }; }
}
