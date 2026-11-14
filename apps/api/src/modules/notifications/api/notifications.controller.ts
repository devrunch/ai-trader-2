import { Body, Controller, Get, HttpCode, Inject, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { EmailPrefSchema, NotificationsReadSchema } from '@aitrader/contracts';
import { CsrfHeaderGuard, SessionGuard } from '../../auth/api/index';
import { EmailReports } from '../application/email-reports';
import { Notifications } from '../application/notifications';

type AuthRequest = Request & { authUser?: { id: string } };
const userId = (req: AuthRequest): string => {
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser.id;
};

@Controller('v1/notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(@Inject(Notifications) private readonly notifications: Notifications, @Inject(EmailReports) private readonly email: EmailReports) {}

  @Get()
  list(@Req() req: AuthRequest) { return this.notifications.list(userId(req)); }

  /** Marks the given notifications read, or all of them when no ids are sent. */
  @Post('read') @HttpCode(204) @UseGuards(CsrfHeaderGuard)
  async read(@Body() body: unknown, @Req() req: AuthRequest): Promise<void> {
    await this.notifications.markRead(userId(req), NotificationsReadSchema.parse(body ?? {}).ids);
  }

  /** Whether REPORT notifications are also emailed to the login address, and whether that is possible. */
  @Get('email')
  emailPref(@Req() req: AuthRequest) { return this.email.get(userId(req)); }

  @Put('email') @UseGuards(CsrfHeaderGuard)
  setEmailPref(@Body() body: unknown, @Req() req: AuthRequest) { const pref = EmailPrefSchema.parse(body); return this.email.set(userId(req), pref.reports, pref.address); }
}
